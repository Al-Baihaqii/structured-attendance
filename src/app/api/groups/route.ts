import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { canManageGroup, getAccessibleGroupsWhere, requireRole } from "@/lib/authorization";
import { apiError, ok } from "@/lib/api";
import { groupSchema } from "@/lib/validators";

export async function GET() {
  try {
    const currentUser = await requireAuth();
    const groups = await prisma.group.findMany({
      where: { ...getAccessibleGroupsWhere(currentUser), status: { not: "DELETED" } },
      include: {
        sector: { include: { mahalli: { include: { city: true } } } },
        members: { where: { isActive: true }, select: { id: true } },
        assignments: { include: { musyrif: { select: { id: true, name: true } } } },
      },
      orderBy: [{ status: "asc" }, { name: "asc" }],
    });
    return ok({ groups });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const currentUser = await requireAuth();
    requireRole(currentUser, ["SUPER_ADMIN", "CITY_ADMIN", "MAHALLI_ADMIN", "SECTOR_ADMIN"]);
    const input = groupSchema.parse(await request.json());
    return await prisma.$transaction(async (tx) => {
      const sector = await tx.sector.findUnique({ where: { id: input.sectorId }, include: { mahalli: true } });
      if (!sector) return NextResponse.json({ error: "Sektor tidak ditemukan." }, { status: 404 });
      const scopeGroup = { id: "new", sectorId: sector.id, sector: { mahalliId: sector.mahalliId, mahalli: { cityId: sector.mahalli.cityId } } };
      if (!canManageGroup(currentUser, scopeGroup)) return NextResponse.json({ error: "Anda tidak memiliki akses untuk mengelola kelompok pada sektor ini." }, { status: 403 });
      if (!sector.isActive) return NextResponse.json({ error: "Sektor tidak aktif." }, { status: 409 });
      const group = await tx.group.create({ data: { name: input.name, sectorId: input.sectorId } });
      await tx.activityLog.create({ data: { actorId: currentUser.userId, action: "CREATE", entityType: "GROUP", entityId: group.id, description: `Membuat kelompok ${group.name}.` } });
      return ok({ group }, { status: 201 });
    });
  } catch (error) {
    return apiError(error);
  }
}