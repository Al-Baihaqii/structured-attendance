import { getHierarchyReadScope } from "@/lib/read-scope";
import { HttpError } from "@/lib/http-error";
import { assertUnsafeRequest, readJsonRequest } from "@/lib/request-security";
import { z } from "zod";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { requireRole } from "@/lib/authorization";
import { apiError, ok } from "@/lib/api";

export async function GET() {
  try {
    const currentUser = await requireAuth();
    const scope = getHierarchyReadScope(currentUser);
    const cities = await prisma.city.findMany({
      where: { ...scope.city, isActive: true },
      include: { mahallis: { where: { ...scope.mahalli, isActive: true }, include: { sectors: { where: { ...scope.sector, isActive: true }, orderBy: { name: "asc" } } }, orderBy: { name: "asc" } } },
      orderBy: { name: "asc" },
    });
    return ok({ cities });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertUnsafeRequest(request, true);
    const currentUser = await requireAuth();
    requireRole(currentUser, ["SUPER_ADMIN", "CITY_ADMIN", "MAHALLI_ADMIN", "SECTOR_ADMIN"]);
    const body = z.object({ type: z.string().optional(), name: z.string().trim().min(1, "Nama wilayah wajib diisi.").max(100), cityId: z.string().optional(), mahalliId: z.string().optional() }).parse(await readJsonRequest(request));
    const name = body.name?.trim();
    if (!name) return NextResponse.json({ error: "Nama wilayah wajib diisi." }, { status: 400 });

    if (body.type === "city") {
      requireRole(currentUser, ["SUPER_ADMIN"]);
      const city = await prisma.$transaction(async (tx) => {
        const newCity = await tx.city.create({ data: { name } });
        await tx.activityLog.create({ data: { actorId: currentUser.userId, action: "CREATE", entityType: "CITY", entityId: newCity.id, description: `Membuat kota ${newCity.name}.` } });
        return newCity;
      });
      return ok({ city }, { status: 201 });
    }
    
    if (body.type === "mahalli") {
      requireRole(currentUser, ["SUPER_ADMIN", "CITY_ADMIN"]);
      const cityId = body.cityId;
      if (!cityId) throw new HttpError("Kota wajib dipilih.");
      if (currentUser.role === "CITY_ADMIN" && cityId !== currentUser.cityId) throw new HttpError("Kota berada di luar scope akses Anda.", 403);
      const mahalli = await prisma.$transaction(async (tx) => {
        const city = await tx.city.findUnique({ where: { id: cityId } });
        if (!city || city.isActive !== true) throw new HttpError("Kota tidak ditemukan atau tidak aktif.");
        const newMahalli = await tx.mahalli.create({ data: { name, cityId } });
        await tx.activityLog.create({ data: { actorId: currentUser.userId, action: "CREATE", entityType: "MAHALLI", entityId: newMahalli.id, description: `Membuat mahalli ${newMahalli.name}.` } });
        return newMahalli;
      });
      return ok({ mahalli }, { status: 201 });
    }
    
    if (body.type === "sector") {
      requireRole(currentUser, ["SUPER_ADMIN", "CITY_ADMIN", "MAHALLI_ADMIN"]);
      const mahalliId = body.mahalliId;
      if (!mahalliId) throw new HttpError("Mahalli wajib dipilih.");
      const sector = await prisma.$transaction(async (tx) => {
        const mahalli = await tx.mahalli.findUnique({ where: { id: mahalliId }, include: { city: true } });
        if (!mahalli || mahalli.isActive !== true || !mahalli.city || mahalli.city.isActive !== true) throw new HttpError("Mahalli atau Kota tidak ditemukan atau tidak aktif.");
        if ((currentUser.role === "CITY_ADMIN" && mahalli.cityId !== currentUser.cityId) || (currentUser.role === "MAHALLI_ADMIN" && mahalli.id !== currentUser.mahalliId)) throw new HttpError("Mahalli berada di luar scope akses Anda.", 403);
        const newSector = await tx.sector.create({ data: { name, mahalliId } });
        await tx.activityLog.create({ data: { actorId: currentUser.userId, action: "CREATE", entityType: "SECTOR", entityId: newSector.id, description: `Membuat sektor ${newSector.name}.` } });
        return newSector;
      });
      return ok({ sector }, { status: 201 });
    }
    
    return NextResponse.json({ error: "Jenis wilayah tidak dikenali." }, { status: 400 });
  } catch (error) {
    return apiError(error);
  }
}