import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { assertGroupAccess, assertGroupMutable } from "@/lib/authorization";
import { apiError, ok } from "@/lib/api";
import { lockGroup } from "@/lib/group-lock";
import { assignmentSchema } from "@/lib/validators";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = await requireAuth();
    const { id: groupId } = await params;
    const input = assignmentSchema.parse(await request.json());
    return await prisma.$transaction(async (tx) => {
      await lockGroup(tx, groupId);
      const [group, musyrif] = await Promise.all([
        tx.group.findUnique({ where: { id: groupId }, include: { sector: { include: { mahalli: true } } } }),
        tx.user.findUnique({ where: { id: input.musyrifId } }),
      ]);
      if (!group) return NextResponse.json({ error: "Kelompok tidak ditemukan." }, { status: 404 });
      assertGroupAccess(currentUser, group, "manage");
      assertGroupMutable(group);
      if (!musyrif || !musyrif.isActive || musyrif.role !== "MUSYRIF") return NextResponse.json({ error: "Target harus berupa Musyrif aktif." }, { status: 400 });
      if (musyrif.id === currentUser.userId) return NextResponse.json({ error: "Musyrif tidak dapat menugaskan dirinya sendiri." }, { status: 400 });
      if (musyrif.sectorId !== group.sectorId && currentUser.role !== "SUPER_ADMIN") return NextResponse.json({ error: "Musyrif harus berada pada sektor yang sama." }, { status: 400 });

      const assignments = await tx.userGroup.findMany({ where: { groupId, user: { role: "MUSYRIF" } } });
      if (assignments.length > 1) return duplicateAssignment();
      const old = assignments[0];
      if (old) await tx.userGroup.delete({ where: { id: old.id } });
      await tx.userGroup.create({ data: { groupId, userId: musyrif.id } });
      await tx.groupAssignmentHistory.create({ data: { groupId, oldMusyrifId: old?.userId, newMusyrifId: musyrif.id, changedById: currentUser.userId, reason: input.reason } });
      await tx.activityLog.create({ data: { actorId: currentUser.userId, action: "ASSIGN", entityType: "GROUP", entityId: groupId, description: `Menugaskan ${musyrif.name} ke ${group.name}.` } });
      return ok({ success: true });
    }, { isolationLevel: "ReadCommitted" });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = await requireAuth();
    const { id: groupId } = await params;
    return await prisma.$transaction(async (tx) => {
      await lockGroup(tx, groupId);
      const group = await tx.group.findUnique({ where: { id: groupId }, include: { sector: { include: { mahalli: true } } } });
      if (!group) return NextResponse.json({ error: "Kelompok tidak ditemukan." }, { status: 404 });
      assertGroupAccess(currentUser, group, "manage");
      assertGroupMutable(group);
      const assignments = await tx.userGroup.findMany({ where: { groupId, user: { role: "MUSYRIF" } } });
      if (assignments.length > 1) return duplicateAssignment();
      const old = assignments[0];
      if (!old) return ok({ success: true });
      await tx.userGroup.delete({ where: { id: old.id } });
      await tx.groupAssignmentHistory.create({ data: { groupId, oldMusyrifId: old.userId, changedById: currentUser.userId, reason: "Penugasan dicabut." } });
      await tx.activityLog.create({ data: { actorId: currentUser.userId, action: "UNASSIGN", entityType: "GROUP", entityId: groupId, description: `Mencabut Musyrif dari ${group.name}.` } });
      return ok({ success: true });
    }, { isolationLevel: "ReadCommitted" });
  } catch (error) {
    return apiError(error);
  }
}

function duplicateAssignment() {
  return NextResponse.json({ error: "Kelompok memiliki lebih dari satu penugasan Musyrif. Perbaiki data penugasan sebelum melanjutkan.", code: "GROUP_ASSIGNMENT_DUPLICATE" }, { status: 409 });
}
