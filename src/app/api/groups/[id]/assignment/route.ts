import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { assertGroupAccess } from "@/lib/authorization";
import { apiError, ok } from "@/lib/api";
import { assignmentSchema } from "@/lib/validators";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = await requireAuth();
    const { id: groupId } = await params;
    const input = assignmentSchema.parse(await request.json());
    const [group, musyrif] = await Promise.all([
      prisma.group.findUnique({ where: { id: groupId }, include: { sector: { include: { mahalli: true } } } }),
      prisma.user.findUnique({ where: { id: input.musyrifId } }),
    ]);
    if (!group) return NextResponse.json({ error: "Kelompok tidak ditemukan." }, { status: 404 });
    assertGroupAccess(currentUser, group, "manage");
    if (!musyrif || !musyrif.isActive || musyrif.role !== "MUSYRIF") return NextResponse.json({ error: "Target harus berupa Musyrif aktif." }, { status: 400 });
    if (musyrif.id === currentUser.userId) return NextResponse.json({ error: "Musyrif tidak dapat menugaskan dirinya sendiri." }, { status: 400 });
    if (musyrif.sectorId !== group.sectorId && currentUser.role !== "SUPER_ADMIN") return NextResponse.json({ error: "Musyrif harus berada pada sektor yang sama." }, { status: 400 });

    await prisma.$transaction(async (tx) => {
      const old = await tx.userGroup.findFirst({ where: { groupId, user: { role: "MUSYRIF" } } });
      if (old) await tx.userGroup.delete({ where: { id: old.id } });
      await tx.userGroup.create({ data: { groupId, userId: musyrif.id } });
      await tx.groupAssignmentHistory.create({ data: { groupId, oldMusyrifId: old?.userId, newMusyrifId: musyrif.id, changedById: currentUser.userId, reason: input.reason } });
      await tx.activityLog.create({ data: { actorId: currentUser.userId, action: "ASSIGN", entityType: "GROUP", entityId: groupId, description: `Menugaskan ${musyrif.name} ke ${group.name}.` } });
    });
    return ok({ success: true });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = await requireAuth();
    const { id: groupId } = await params;
    const group = await prisma.group.findUnique({ where: { id: groupId }, include: { sector: { include: { mahalli: true } } } });
    if (!group) return NextResponse.json({ error: "Kelompok tidak ditemukan." }, { status: 404 });
    assertGroupAccess(currentUser, group, "manage");
    await prisma.$transaction(async (tx) => {
      const old = await tx.userGroup.findFirst({ where: { groupId, user: { role: "MUSYRIF" } } });
      if (!old) return;
      await tx.userGroup.delete({ where: { id: old.id } });
      await tx.groupAssignmentHistory.create({ data: { groupId, oldMusyrifId: old.userId, changedById: currentUser.userId, reason: "Penugasan dicabut." } });
      await tx.activityLog.create({ data: { actorId: currentUser.userId, action: "UNASSIGN", entityType: "GROUP", entityId: groupId, description: `Mencabut Musyrif dari ${group.name}.` } });
    });
    return ok({ success: true });
  } catch (error) {
    return apiError(error);
  }
}