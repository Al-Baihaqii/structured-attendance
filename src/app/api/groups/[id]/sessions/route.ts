import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { assertMeetingAccess, assertGroupMutable } from "@/lib/authorization";
import { apiError, ok } from "@/lib/api";
import { lockGroup } from "@/lib/group-lock";
import { meetingAttendanceSchema } from "@/lib/validators";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = await requireAuth();
    const { id: groupId } = await params;
    const input = meetingAttendanceSchema.parse(await request.json());
    return await prisma.$transaction(async (tx) => {
      await lockGroup(tx, groupId);
      const group = await tx.group.findUnique({ where: { id: groupId }, include: { sector: { include: { mahalli: true } }, assignments: { where: { endedAt: null } } } });
      if (!group) return NextResponse.json({ error: "Kelompok tidak ditemukan." }, { status: 404 });
      assertMeetingAccess(currentUser, group);
      assertGroupMutable(group);
      if (group.assignments.length !== 1) return NextResponse.json({ error: "Kelompok harus memiliki tepat satu penugasan Musyrif aktif.", code: "ACTIVE_ASSIGNMENT_REQUIRED" }, { status: 409 });
      const assignment = group.assignments[0];
      const musyrif = await tx.user.findUnique({ where: { id: assignment.musyrifId }, select: { role: true, isActive: true, cityId: true } });
      if (!musyrif?.isActive || musyrif.role !== "MUSYRIF" || musyrif.cityId !== group.sector.mahalli.cityId) {
        return NextResponse.json({ error: "Penugasan Musyrif tidak valid untuk kota kelompok ini.", code: "INVALID_GROUP_ASSIGNMENT" }, { status: 409 });
      }
      const memberIds = input.records.map(record => record.memberId);
      if (memberIds.length) {
        const members = await tx.member.findMany({ where: { groupId, isActive: true, id: { in: memberIds } }, select: { id: true } });
        if (members.length !== memberIds.length) return NextResponse.json({ error: "Presensi baru hanya dapat diisi untuk anggota aktif kelompok ini." }, { status: 400 });
      }
      const highest = await tx.attendanceSession.aggregate({ where: { groupId }, _max: { meetingNumber: true } });
      const meetingNumber = (highest._max.meetingNumber ?? 0) + 1;
      if (meetingNumber > 2147483647) return NextResponse.json({ error: "Nomor pertemuan telah mencapai batas." }, { status: 409 });
      const session = await tx.attendanceSession.create({ data: { groupId, assignmentId: assignment.id, meetingNumber, date: new Date(`${input.date}T00:00:00.000Z`), notes: input.notes || null, attendanceVersion: input.records.length ? 1 : 0 } });
      // The new session row is created under the Group lock; no existing session
      // can be edited before this transaction commits. Later edits use its version.
      if (input.records.length) await tx.attendanceRecord.createMany({ data: input.records.map(record => ({ sessionId: session.id, memberId: record.memberId, status: record.status, reason: record.reason || null })) });
      await tx.activityLog.create({ data: { actorId: currentUser.userId, action: "CREATE", entityType: "ATTENDANCE_SESSION", entityId: session.id, description: `Menambahkan pertemuan ${session.meetingNumber} pada kelompok ${group.name}.`, metadata: { groupId, assignmentId: assignment.id, versionBefore: 0, versionAfter: session.attendanceVersion, changes: input.records.map(record => ({ memberId: record.memberId, before: null, after: { status: record.status }, reasonChanged: Boolean(record.reason) })) } } });
      return ok({ session }, { status: 201 });
    }, { isolationLevel: "ReadCommitted", timeout: 15_000 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002" && Array.isArray(error.meta?.target) && error.meta.target.includes("groupId") && error.meta.target.includes("meetingNumber")) {
      return NextResponse.json({ error: "Nomor pertemuan sudah digunakan untuk kelompok ini." }, { status: 409 });
    }
    if (error instanceof SyntaxError) return NextResponse.json({ error: "Data pertemuan tidak valid." }, { status: 400 });
    if (error instanceof Prisma.PrismaClientKnownRequestError || error instanceof Prisma.PrismaClientUnknownRequestError || error instanceof Prisma.PrismaClientInitializationError) {
      return NextResponse.json({ error: "Gagal menyimpan pertemuan. Silakan coba kembali." }, { status: 500 });
    }
    return apiError(error);
  }
}
