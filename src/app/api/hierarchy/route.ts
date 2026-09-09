import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { requireRole, canViewGroup } from "@/lib/authorization";
import { apiError, ok } from "@/lib/api";

export async function GET() {
  try {
    const currentUser = await requireAuth();
    const cities = await prisma.city.findMany({
      where: currentUser.role === "SUPER_ADMIN" ? { isActive: true } : { id: currentUser.cityId ?? "__none__", isActive: true },
      include: { mahallis: { where: { isActive: true }, include: { sectors: { where: { isActive: true }, orderBy: { name: "asc" } } }, orderBy: { name: "asc" } } },
      orderBy: { name: "asc" },
    });
    return ok({ cities });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const currentUser = await requireAuth();
    requireRole(currentUser, ["SUPER_ADMIN", "CITY_ADMIN", "MAHALLI_ADMIN", "SECTOR_ADMIN"]);
    const body = await request.json() as { type?: string; name?: string; cityId?: string; mahalliId?: string; sectorId?: string };
    const name = body.name?.trim();
    if (!name) return NextResponse.json({ error: "Nama wilayah wajib diisi." }, { status: 400 });

    if (body.type === "city") {
      requireRole(currentUser, ["SUPER_ADMIN"]);
      const city = await prisma.city.create({ data: { name } });
      await prisma.activityLog.create({ data: { actorId: currentUser.userId, action: "CREATE", entityType: "CITY", entityId: city.id, description: `Membuat kota ${city.name}.` } });
      return ok({ city }, { status: 201 });
    }
    if (body.type === "mahalli") {
      requireRole(currentUser, ["SUPER_ADMIN", "CITY_ADMIN"]);
      if (!body.cityId || (currentUser.role === "CITY_ADMIN" && body.cityId !== currentUser.cityId)) throw new Error("Kota berada di luar scope akses Anda.");
      const mahalli = await prisma.mahalli.create({ data: { name, cityId: body.cityId } });
      await prisma.activityLog.create({ data: { actorId: currentUser.userId, action: "CREATE", entityType: "MAHALLI", entityId: mahalli.id, description: `Membuat mahalli ${mahalli.name}.` } });
      return ok({ mahalli }, { status: 201 });
    }
    if (body.type === "sector") {
      requireRole(currentUser, ["SUPER_ADMIN", "CITY_ADMIN", "MAHALLI_ADMIN"]);
      if (!body.mahalliId) throw new Error("Mahalli wajib dipilih.");
      const mahalli = await prisma.mahalli.findUnique({ where: { id: body.mahalliId } });
      if (!mahalli || (currentUser.role === "CITY_ADMIN" && mahalli.cityId !== currentUser.cityId) || (currentUser.role === "MAHALLI_ADMIN" && mahalli.id !== currentUser.mahalliId)) throw new Error("Mahalli berada di luar scope akses Anda.");
      const sector = await prisma.sector.create({ data: { name, mahalliId: body.mahalliId } });
      await prisma.activityLog.create({ data: { actorId: currentUser.userId, action: "CREATE", entityType: "SECTOR", entityId: sector.id, description: `Membuat sektor ${sector.name}.` } });
      return ok({ sector }, { status: 201 });
    }
    return NextResponse.json({ error: "Jenis wilayah tidak dikenali." }, { status: 400 });
  } catch (error) {
    return apiError(error);
  }
}