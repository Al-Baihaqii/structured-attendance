import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, requireAuth } from "@/lib/auth";
import { canCreateUserRole, requireRole } from "@/lib/authorization";
import { apiError, ok } from "@/lib/api";
import { userSchema, validateScopeForRole } from "@/lib/validators";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = await requireAuth();
    requireRole(currentUser, ["SUPER_ADMIN", "CITY_ADMIN", "MAHALLI_ADMIN", "SECTOR_ADMIN"]);
    const { id } = await params;
    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Pengguna tidak ditemukan." }, { status: 404 });
    const input = userSchema.partial().parse(await request.json());
    const role = input.role || existing.role;
    const scope = { cityId: input.cityId ?? existing.cityId, mahalliId: input.mahalliId ?? existing.mahalliId, sectorId: input.sectorId ?? existing.sectorId };
    const scopeError = validateScopeForRole(role, scope);
    if (scopeError) return NextResponse.json({ error: scopeError }, { status: 400 });
    if (existing.id === currentUser.userId && role !== existing.role) return NextResponse.json({ error: "Anda tidak dapat mengubah peran sendiri." }, { status: 400 });
    if (!canCreateUserRole(currentUser, role, scope) && existing.id !== currentUser.userId) {
      return NextResponse.json({ error: "Pengguna berada di luar scope akses Anda." }, { status: 403 });
    }
    const updated = await prisma.user.update({
      where: { id },
      data: {
        username: input.username,
        name: input.name,
        email: input.email === "" ? null : input.email,
        role,
        cityId: scope.cityId,
        mahalliId: scope.mahalliId,
        sectorId: scope.sectorId,
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