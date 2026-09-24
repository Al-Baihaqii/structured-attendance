import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, requireAuth } from "@/lib/auth";
import { canCreateUserRole, requireRole } from "@/lib/authorization";
import { apiError, ok } from "@/lib/api";
import { userSchema } from "@/lib/validators";
import { validateUserScope } from "@/lib/user-scope";

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
            : { id: currentUser.userId };
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
    const scope = await validateUserScope(input.role, input);
    if (!canCreateUserRole(currentUser, input.role, scope)) {
      return NextResponse.json({ error: "Anda tidak memiliki akses untuk membuat pengguna dengan scope tersebut." }, { status: 403 });
    }

    const passwordHash = await hashPassword(input.password);
    return await prisma.$transaction(async (tx) => {
      const exists = await tx.user.findUnique({ where: { username: input.username } });
      if (exists) return NextResponse.json({ error: "Username sudah digunakan." }, { status: 409 });
      const user = await tx.user.create({
        data: {
          username: input.username,
          name: input.name,
          email: input.email || null,
          passwordHash,
          role: input.role,
          ...scope,
        },
        select: { id: true, username: true, name: true, role: true },
      });
      await tx.activityLog.create({ data: { actorId: currentUser.userId, action: "CREATE", entityType: "USER", entityId: user.id, description: `Membuat pengguna ${user.name} (${user.role}).` } });
      return ok({ user }, { status: 201 });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
      && Array.isArray(error.meta?.target) && error.meta.target.includes("username")) {
      return NextResponse.json({ error: "Username sudah digunakan." }, { status: 409 });
    }
    return apiError(error);
  }
}
