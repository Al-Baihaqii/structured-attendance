import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, requireAuth } from "@/lib/auth";
import { canCreateUserRole, requireRole } from "@/lib/authorization";
import { apiError, ok } from "@/lib/api";
import { userSchema } from "@/lib/validators";
import { validateUserScope } from "@/lib/user-scope";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = await requireAuth();
    requireRole(currentUser, ["SUPER_ADMIN", "CITY_ADMIN", "MAHALLI_ADMIN", "SECTOR_ADMIN"]);
    const { id } = await params;
    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Pengguna tidak ditemukan." }, { status: 404 });
    const input = userSchema.partial().parse(await request.json());
    const isSelf = existing.id === currentUser.userId;
    const role = input.role ?? existing.role;
    const requestedScope = {
      cityId: input.cityId === undefined ? existing.cityId : input.cityId || null,
      mahalliId: input.mahalliId === undefined ? existing.mahalliId : input.mahalliId || null,
      sectorId: input.sectorId === undefined ? existing.sectorId : input.sectorId || null,
    };
    if (isSelf && (role !== existing.role || requestedScope.cityId !== existing.cityId || requestedScope.mahalliId !== existing.mahalliId || requestedScope.sectorId !== existing.sectorId)) {
      return NextResponse.json({ error: "Anda tidak dapat mengubah peran atau scope sendiri." }, { status: 403 });
    }
    if (!isSelf) {
      const currentScope = await validateUserScope(existing.role, existing);
      if (!canCreateUserRole(currentUser, existing.role, currentScope)) {
        return NextResponse.json({ error: "Pengguna berada di luar scope akses Anda." }, { status: 403 });
      }
    }
    const scope = await validateUserScope(role, requestedScope);
    if (!isSelf && !canCreateUserRole(currentUser, role, scope)) {
      return NextResponse.json({ error: "Scope atau peran tujuan berada di luar akses Anda." }, { status: 403 });
    }
    const updated = await prisma.user.update({
      where: { id, role: existing.role, cityId: existing.cityId, mahalliId: existing.mahalliId, sectorId: existing.sectorId },
      data: {
        username: input.username,
        name: input.name,
        email: input.email === "" ? null : input.email,
        ...(!isSelf ? { role, ...scope } : {}),
        ...(input.password ? { passwordHash: await hashPassword(input.password), sessionVersion: { increment: 1 } } : {}),
      },
      select: { id: true, username: true, name: true, role: true, isActive: true },
    });
    await prisma.activityLog.create({ data: { actorId: currentUser.userId, action: "UPDATE", entityType: "USER", entityId: id, description: `Memperbarui pengguna ${updated.name}.` } });
    return ok({ user: updated });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = await requireAuth();
    requireRole(currentUser, ["SUPER_ADMIN", "CITY_ADMIN", "MAHALLI_ADMIN", "SECTOR_ADMIN"]);
    const { id } = await params;
    if (id === currentUser.userId) return NextResponse.json({ error: "Anda tidak dapat menonaktifkan akun sendiri." }, { status: 400 });
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user || !canCreateUserRole(currentUser, user.role, user)) return NextResponse.json({ error: "Pengguna berada di luar scope akses Anda." }, { status: 403 });
    await prisma.user.update({ where: { id }, data: { isActive: false, sessionVersion: { increment: 1 } } });
    await prisma.activityLog.create({ data: { actorId: currentUser.userId, action: "DEACTIVATE", entityType: "USER", entityId: id, description: `Menonaktifkan pengguna ${user.name}.` } });
    return ok({ success: true });
  } catch (error) {
    return apiError(error);
  }
}