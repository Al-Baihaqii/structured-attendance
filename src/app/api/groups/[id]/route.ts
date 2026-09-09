import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { assertGroupAccess } from "@/lib/authorization";
import { apiError, ok } from "@/lib/api";
import { groupSchema } from "@/lib/validators";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = await requireAuth();
    const { id } = await params;
    const group = await prisma.group.findUnique({
      where: { id },
      include: {
        sector: { include: { mahalli: { include: { city: true } } } },
        members: { orderBy: { name: "asc" } },
        userGroups: { where: { user: { role: "MUSYRIF", isActive: true } }, include: { user: { select: { id: true, name: true, username: true } } } },
        assignmentHistory: { orderBy: { createdAt: "desc" }, take: 8, include: { changedBy: { select: { name: true } }, } },
      },
    });
    if (!group) return NextResponse.json({ error: "Kelompok tidak ditemukan." }, { status: 404 });
    assertGroupAccess(currentUser, group);
    return ok({ group, canManage: currentUser.role !== "MUSYRIF" });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = await requireAuth();
    const { id } = await params;
    const group = await prisma.group.findUnique({ where: { id }, include: { sector: { include: { mahalli: true } } } });
    if (!group) return NextResponse.json({ error: "Kelompok tidak ditemukan." }, { status: 404 });
    assertGroupAccess(currentUser, group, "manage");
    const input = groupSchema.partial().parse(await request.json());
    const updated = await prisma.group.update({ where: { id }, data: { name: input.name, ...(input.sectorId ? { sectorId: input.sectorId } : {}) } });
    await prisma.activityLog.create({ data: { actorId: currentUser.userId, action: "UPDATE", entityType: "GROUP", entityId: id, description: `Memperbarui kelompok ${updated.name}.` } });
    return ok({ group: updated });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = await requireAuth();
    const { id } = await params;
    const group = await prisma.group.findUnique({ where: { id }, include: { sector: { include: { mahalli: true } } } });
    if (!group) return NextResponse.json({ error: "Kelompok tidak ditemukan." }, { status: 404 });
    assertGroupAccess(currentUser, group, "manage");
    await prisma.group.update({ where: { id }, data: { status: "DELETED" } });
    await prisma.activityLog.create({ data: { actorId: currentUser.userId, action: "DELETE", entityType: "GROUP", entityId: id, description: `Menghapus kelompok ${group.name}.` } });
    return ok({ success: true });
  } catch (error) {
    return apiError(error);
  }
}