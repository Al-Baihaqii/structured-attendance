import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { canManageMember } from "@/lib/authorization";
import { apiError, ok } from "@/lib/api";
import { memberSchema } from "@/lib/validators";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = await requireAuth();
    const { id } = await params;
    const member = await prisma.member.findUnique({ where: { id }, include: { group: { include: { sector: { include: { mahalli: true } } } } } });
    if (!member || !canManageMember(currentUser, member.group)) return NextResponse.json({ error: "Anggota tidak ditemukan atau berada di luar scope Anda." }, { status: 404 });
    const input = memberSchema.partial().parse(await request.json());
    const updated = await prisma.member.update({ where: { id }, data: { name: input.name } });
    await prisma.activityLog.create({ data: { actorId: currentUser.userId, action: "UPDATE", entityType: "MEMBER", entityId: id, description: `Memperbarui anggota ${updated.name}.` } });
    return ok({ member: updated });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = await requireAuth();
    const { id } = await params;
    const member = await prisma.member.findUnique({ where: { id }, include: { group: { include: { sector: { include: { mahalli: true } } } } } });
    if (!member || !canManageMember(currentUser, member.group)) return NextResponse.json({ error: "Anggota tidak ditemukan atau berada di luar scope Anda." }, { status: 404 });
    await prisma.member.update({ where: { id }, data: { isActive: false } });
    await prisma.activityLog.create({ data: { actorId: currentUser.userId, action: "DEACTIVATE", entityType: "MEMBER", entityId: id, description: `Menonaktifkan anggota ${member.name}.` } });
    return ok({ success: true });
  } catch (error) {
    return apiError(error);
  }
}