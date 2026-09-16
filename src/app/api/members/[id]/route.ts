import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { canManageMember, assertGroupMutable } from "@/lib/authorization";
import { apiError, ok } from "@/lib/api";
import { lockGroup } from "@/lib/group-lock";
import { memberSchema } from "@/lib/validators";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = await requireAuth();
    const { id } = await params;
    return await prisma.$transaction(async (tx) => {
      const target = await tx.member.findUnique({ where: { id }, select: { groupId: true } });
      if (!target) return NextResponse.json({ error: "Anggota tidak ditemukan atau berada di luar scope Anda." }, { status: 404 });
      await lockGroup(tx, target.groupId);
      const member = await tx.member.findUnique({ where: { id }, include: { group: { include: { sector: { include: { mahalli: true } } } } } });
      if (!member || member.groupId !== target.groupId || !canManageMember(currentUser, member.group)) return NextResponse.json({ error: "Anggota tidak ditemukan atau berada di luar scope Anda." }, { status: 404 });
      assertGroupMutable(member.group);
      const input = memberSchema.partial().parse(await request.json());
      if (input.name === undefined || input.name === member.name) {
        const { group: _group, ...unchanged } = member;
        return ok({ member: unchanged });
      }
      const updated = await tx.member.update({ where: { id }, data: { name: input.name } });
      await tx.activityLog.create({ data: { actorId: currentUser.userId, action: "UPDATE", entityType: "MEMBER", entityId: id, description: `Memperbarui anggota ${updated.name}.` } });
      return ok({ member: updated });
    }, { isolationLevel: "ReadCommitted" });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = await requireAuth();
    const { id } = await params;
    return await prisma.$transaction(async (tx) => {
      const target = await tx.member.findUnique({ where: { id }, select: { groupId: true } });
      if (!target) return NextResponse.json({ error: "Anggota tidak ditemukan atau berada di luar scope Anda." }, { status: 404 });
      await lockGroup(tx, target.groupId);
      const member = await tx.member.findUnique({ where: { id }, include: { group: { include: { sector: { include: { mahalli: true } } } } } });
      if (!member || member.groupId !== target.groupId || !canManageMember(currentUser, member.group)) return NextResponse.json({ error: "Anggota tidak ditemukan atau berada di luar scope Anda." }, { status: 404 });
      assertGroupMutable(member.group);
      const changed = await tx.member.updateMany({ where: { id, groupId: target.groupId, isActive: true }, data: { isActive: false } });
      if (!changed.count) return ok({ success: true });
      await tx.activityLog.create({ data: { actorId: currentUser.userId, action: "DEACTIVATE", entityType: "MEMBER", entityId: id, description: `Menonaktifkan anggota ${member.name}.` } });
      return ok({ success: true });
    }, { isolationLevel: "ReadCommitted" });
  } catch (error) {
    return apiError(error);
  }
}
