import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { assertGroupAccess, assertGroupMutable } from "@/lib/authorization";
import { apiError, ok } from "@/lib/api";
import { lockGroup } from "@/lib/group-lock";
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
    const input = groupSchema.partial().parse(await request.json());
    return await prisma.$transaction(async (tx) => {
      await lockGroup(tx, id);
      const group = await tx.group.findUnique({ where: { id }, include: { sector: { include: { mahalli: true } } } });
      if (!group) return NextResponse.json({ error: "Kelompok tidak ditemukan." }, { status: 404 });
      assertGroupAccess(currentUser, group, "manage");
      assertGroupMutable(group);
      let metadata: Prisma.InputJsonObject | undefined;
      if (input.sectorId && input.sectorId !== group.sectorId) {
        const sector = await tx.sector.findUnique({
          where: { id: input.sectorId },
          include: { mahalli: { include: { city: true } } },
        });
        if (!sector) return NextResponse.json({ error: "Sektor tidak ditemukan." }, { status: 404 });
        assertGroupAccess(currentUser, { id, sectorId: sector.id, sector }, "manage");
        const assignments = await tx.userGroup.findMany({
          where: { groupId: id, user: { role: "MUSYRIF" } },
          select: { user: { select: { sectorId: true } } },
        });
        if (currentUser.role !== "SUPER_ADMIN" && assignments.some(({ user }) => user.sectorId !== sector.id)) {
          return NextResponse.json({
            error: "Penugasan Musyrif tidak sesuai dengan sektor tujuan. Cabut penugasan sebelum memindahkan kelompok.",
            code: "GROUP_ASSIGNMENT_SCOPE_CONFLICT",
          }, { status: 409 });
        }
        metadata = {
          previousScope: { cityId: group.sector.mahalli.cityId, mahalliId: group.sector.mahalliId, sectorId: group.sectorId },
          destinationScope: { cityId: sector.mahalli.cityId, mahalliId: sector.mahalliId, sectorId: sector.id },
        };
      }
      const updated = await tx.group.update({ where: { id }, data: { name: input.name, ...(input.sectorId ? { sectorId: input.sectorId } : {}) } });
      await tx.activityLog.create({ data: {
        actorId: currentUser.userId, action: "UPDATE", entityType: "GROUP", entityId: id,
        description: metadata ? `Memindahkan kelompok ${updated.name}.` : `Memperbarui kelompok ${updated.name}.`,
        ...(metadata ? { metadata } : {}),
      } });
      return ok({ group: updated });
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
      await lockGroup(tx, id);

      const group = await tx.group.findUnique({
        where: { id },
        include: {
          sector: {
            include: {
              mahalli: true,
            },
          },
        },
      });

      if (!group) {
        return NextResponse.json(
          { error: "Kelompok tidak ditemukan." },
          { status: 404 }
        );
      }

      assertGroupAccess(currentUser, group, "manage");
      assertGroupMutable(group);

      await tx.group.update({
        where: { id },
        data: {
          status: "DELETED",
        },
      });

      await tx.activityLog.create({
        data: {
          actorId: currentUser.userId,
          action: "DELETE",
          entityType: "GROUP",
          entityId: id,
          description: `Menghapus kelompok ${group.name}.`,
        },
      });

      return ok({ success: true });
    });
  } catch (error) {
    return apiError(error);
  }
}