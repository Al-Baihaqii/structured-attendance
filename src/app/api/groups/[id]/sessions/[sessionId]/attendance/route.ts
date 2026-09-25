import { HttpError } from "@/lib/http-error";
import { assertUnsafeRequest, readJsonRequest } from "@/lib/request-security";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireAuth } from "@/lib/auth";
import { assertSessionAccess, assertGroupMutable } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import { apiError, ok } from "@/lib/api";
import { attendanceBatchSchema } from "@/lib/validators";
import { lockGroup } from "@/lib/group-lock";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; sessionId: string }> }) {
  try {
    assertUnsafeRequest(request, true);
    const currentUser = await requireAuth();
    const { id: groupId, sessionId } = await params;
    const input = attendanceBatchSchema.parse(await readJsonRequest(request));
    const memberIds = input.records.map((record) => record.memberId);
    return await prisma.$transaction(async (tx) => {
      await lockGroup(tx, groupId);
      const session = await tx.attendanceSession.findFirst({ where: { id: sessionId, groupId }, include: { assignment: true, group: { include: { sector: { include: { mahalli: true } }, assignments: { where: { endedAt: null } } } } } });
      if (!session) return NextResponse.json({ error: "Pertemuan tidak ditemukan." }, { status: 404 });
      assertSessionAccess(currentUser, session, "manage");
      assertGroupMutable(session.group);
      const members = await tx.member.findMany({ where: { groupId, id: { in: memberIds } }, select: { id: true } });
      if (members.length !== input.records.length) return NextResponse.json({ error: "Anggota tidak ditemukan atau bukan anggota kelompok ini." }, { status: 400 });
      // A conditional write locks the session until commit, including no-op batches.
      const locked = await tx.attendanceSession.updateMany({ where: { id: sessionId, groupId, attendanceVersion: input.expectedVersion }, data: { attendanceVersion: input.expectedVersion } });
      if (!locked.count) {
        const current = await tx.attendanceSession.findUnique({ where: { id: sessionId }, select: { attendanceVersion: true } });
        return NextResponse.json({ error: "Presensi telah berubah. Muat ulang data sebelum menyimpan kembali.", code: "ATTENDANCE_VERSION_CONFLICT", expectedVersion: input.expectedVersion, currentVersion: current?.attendanceVersion ?? null }, { status: 409 });
      }
      const previous = await tx.attendanceRecord.findMany({ where: { sessionId, memberId: { in: memberIds } }, select: { memberId: true, status: true, reason: true } });
      const previousByMember = new Map(previous.map((record) => [record.memberId, record]));
      const changes = [];
      const creates: Prisma.AttendanceRecordCreateManyInput[] = [];
      const updates = new Map<string, { memberIds: string[]; status: typeof input.records[number]["status"]; reason: string | null }>();
      for (const record of input.records) {
        const before = previousByMember.get(record.memberId);
        const data = { status: record.status, reason: record.reason || null };
        if (before && before.status === data.status && before.reason === data.reason) continue;
        changes.push({ memberId: record.memberId, before: before ? { status: before.status } : null, after: { status: data.status }, reasonChanged: (before?.reason ?? null) !== data.reason });
        if (!before) {
          creates.push({ sessionId, memberId: record.memberId, ...data });
        } else {
          const key = JSON.stringify([data.status, data.reason]);
          const batch = updates.get(key) ?? { memberIds: [], ...data };
          batch.memberIds.push(record.memberId);
          updates.set(key, batch);
        }
      }
      // One transaction connection executes queries serially; batch equal writes instead
      // of issuing an upsert per member (Promise.all would not remove round trips).
      if (creates.length) await tx.attendanceRecord.createMany({ data: creates });
      for (const { memberIds, ...data } of updates.values()) {
        const updated = await tx.attendanceRecord.updateMany({ where: { sessionId, memberId: { in: memberIds } }, data });
        if (updated.count !== memberIds.length) throw new HttpError("Data presensi berubah. Silakan muat ulang dan coba kembali.", 409);
      }
      const attendanceVersion = input.expectedVersion + (changes.length ? 1 : 0);
      if (changes.length) {
        await tx.attendanceSession.update({ where: { id: sessionId }, data: { attendanceVersion } });
        await tx.activityLog.create({ data: { actorId: currentUser.userId, action: "UPDATE", entityType: "ATTENDANCE_SESSION", entityId: sessionId, description: `Menyimpan ${changes.length} perubahan presensi pada pertemuan ${session.meetingNumber} kelompok ${session.group.name}.`, metadata: { groupId, versionBefore: input.expectedVersion, versionAfter: attendanceVersion, changes } } });
      }
      return ok({ success: true, attendanceVersion, changedCount: changes.length });
    }, { isolationLevel: "ReadCommitted", timeout: 15_000 });
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: "Data presensi tidak valid." }, { status: 400 });
    if (error instanceof Prisma.PrismaClientKnownRequestError || error instanceof Prisma.PrismaClientUnknownRequestError || error instanceof Prisma.PrismaClientInitializationError || error instanceof Prisma.PrismaClientValidationError) {
      return NextResponse.json({ error: "Gagal menyimpan presensi. Silakan coba kembali." }, { status: 500 });
    }
    return apiError(error);
  }
}
