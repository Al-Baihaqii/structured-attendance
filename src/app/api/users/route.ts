import { NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hashPassword, requireAuth } from "@/lib/auth";
import { canCreateUserRole, requireRole } from "@/lib/authorization";
import { apiError, ok } from "@/lib/api";
import { userSchema, validateScopeForRole } from "@/lib/validators";

export async function GET() {
  try {
    const currentUser = await requireAuth();
    const where = currentUser.role === "SUPER_ADMIN"
      ? {}
      : currentUser.role === "CITY_ADMIN"
        ? { cityId: currentUser.cityId ?? "__none__" }
        : currentUser.role === "MAHALLI_ADMIN"
          ? { mahalliId: currentUser.mahalliId ?? "__none__" }
          : currentUser.role === "SECTOR_ADMIN"
            ? { sectorId: currentUser.sectorId ?? "__none__" }
            : { userGroups: { some: { userId: currentUser.userId } } };
    const users = await prisma.user.findMany({
      where,
      select: { id: true, username: true, name: true, email: true, role: true, isActive: true, cityId: true, mahalliId: true, sectorId: true, city: { select: { name: true } }, mahalli: { select: { name: true } }, sector: { select: { name: true } } },
      orderBy: { name: "asc" },
    });
    return ok({ users });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const currentUser = await requireAuth();
    requireRole(currentUser, ["SUPER_ADMIN", "CITY_ADMIN", "MAHALLI_ADMIN", "SECTOR_ADMIN"]);
    const input = userSchema.parse(await request.json());
    if (!input.password) return NextResponse.json({ error: "Password wajib diisi untuk pengguna baru." }, { status: 400 });
    const scopeError = validateScopeForRole(input.role, input);
    if (scopeError) return NextResponse.json({ error: scopeError }, { status: 400 });
    if (!canCreateUserRole(currentUser, input.role as Role, input)) {
      return NextResponse.json({ error: "Anda tidak memiliki akses untuk membuat pengguna dengan scope tersebut." }, { status: 403 });
    }

    const exists = await prisma.user.findUnique({ where: { username: input.username } });
    if (exists) return NextResponse.json({ error: "Username sudah digunakan." }, { status: 409 });
    const user = await prisma.user.create({
      data: {
        username: input.username,
        name: input.name,
        email: input.email || null,
        passwordHash: await hashPassword(input.password),
        role: input.role,
        cityId: input.cityId || null,
        mahalliId: input.mahalliId || null,
        sectorId: input.sectorId || null,
      },
      select: { id: true, username: true, name: true, role: true },
    });
    await prisma.activityLog.create({ data: { actorId: currentUser.userId, action: "CREATE", entityType: "USER", entityId: user.id, description: `Membuat pengguna ${user.name} (${user.role}).` } });
    return ok({ user }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}