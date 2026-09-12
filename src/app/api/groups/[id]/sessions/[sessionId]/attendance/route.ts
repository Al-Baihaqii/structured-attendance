import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireAuth } from "@/lib/auth";
import { assertMeetingAccess } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import { apiError, ok } from "@/lib/api";
import { attendanceBatchSchema } from "@/lib/validators";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; sessionId: string }> }) {
  try {
    const currentUser = await requireAuth();
    const { id: groupId, sessionId } = await params;
    const input = attendanceBatchSchema.parse(await request.json());
    return await prisma.$transaction(async (tx) => {
      const session = await tx.attendanceSession.findFirst({ where: { id: sessionId, groupId }, include: { group: { include: { sector: { include: { mahalli: true } }, userGroups: true } } } });
      if (!session) return NextResponse.json({ error: "Pertemuan tidak ditemukan." }, { status: 404 });
      assertMeetingAccess(currentUser, session.group);
      const members = await tx.member.findMany({ where: { groupId, id: { in: input.records.map((record) => record.memberId) } }, select: { id: true } });
      if (members.length !== input.records.length) return NextResponse.json({ error: "Anggota tidak ditemukan atau bukan anggota kelompok ini." }, { status: 400 });
      for (const record of input.records) {
        const data = { status: record.status, reason: record.reason || null };
        await tx.attendanceRecord.upsert({ where: { sessionId_memberId: { sessionId, memberId: record.memberId } }, create: { sessionId, memberId: record.memberId, ...data }, update: data });
      }
      await tx.activityLog.create({ data: { actorId: currentUser.userId, action: "UPDATE", entityType: "ATTENDANCE_SESSION", entityId: sessionId, description: `Menyimpan ${input.records.length} presensi pada pertemuan ${session.meetingNumber} kelompok ${session.group.name}.` } });
      return ok({ success: true });
    });
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: "Data presensi tidak valid." }, { status: 400 });
    if (error instanceof Prisma.PrismaClientKnownRequestError || error instanceof Prisma.PrismaClientUnknownRequestError || error instanceof Prisma.PrismaClientInitializationError || error instanceof Prisma.PrismaClientValidationError) {
      return NextResponse.json({ error: "Gagal menyimpan presensi. Silakan coba kembali." }, { status: 500 });
    }
    return apiError(error);
  }
}
