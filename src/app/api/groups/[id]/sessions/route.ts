import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { assertMeetingAccess } from "@/lib/authorization";
import { apiError, ok } from "@/lib/api";
import { meetingSchema } from "@/lib/validators";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = await requireAuth();
    const { id: groupId } = await params;
    const group = await prisma.group.findUnique({ where: { id: groupId }, include: { sector: { include: { mahalli: true } }, userGroups: true } });
    if (!group) return NextResponse.json({ error: "Kelompok tidak ditemukan." }, { status: 404 });
    assertMeetingAccess(currentUser, group);
    const input = meetingSchema.parse(await request.json());
    const session = await prisma.$transaction(async (tx) => {
      const session = await tx.attendanceSession.create({ data: { groupId, meetingNumber: input.meetingNumber, date: new Date(`${input.date}T00:00:00.000Z`), notes: input.notes || null } });
      await tx.activityLog.create({ data: { actorId: currentUser.userId, action: "CREATE", entityType: "ATTENDANCE_SESSION", entityId: session.id, description: `Menambahkan pertemuan ${session.meetingNumber} pada kelompok ${group.name}.` } });
      return session;
    });
    return ok({ session }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Nomor pertemuan sudah digunakan untuk kelompok ini." }, { status: 409 });
    }
    if (error instanceof SyntaxError) return NextResponse.json({ error: "Data pertemuan tidak valid." }, { status: 400 });
    if (error instanceof Prisma.PrismaClientKnownRequestError || error instanceof Prisma.PrismaClientUnknownRequestError || error instanceof Prisma.PrismaClientInitializationError) {
      return NextResponse.json({ error: "Gagal menyimpan pertemuan. Silakan coba kembali." }, { status: 500 });
    }
    return apiError(error);
  }
}
