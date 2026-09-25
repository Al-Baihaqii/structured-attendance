import { assertUnsafeRequest, readJsonRequest } from "@/lib/request-security";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, requireAuth } from "@/lib/auth";
import { canCreateUserRole, requireRole } from "@/lib/authorization";
import { apiError, ok } from "@/lib/api";
import { userSchema } from "@/lib/validators";
import { lockUser } from "@/lib/user-lock";
import { validateUserScope } from "@/lib/user-scope";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertUnsafeRequest(request, true);
    const currentUser = await requireAuth();
    requireRole(currentUser, ["SUPER_ADMIN", "CITY_ADMIN", "MAHALLI_ADMIN", "SECTOR_ADMIN"]);
    const { id } = await params;
    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Pengguna tidak ditemukan." }, { status: 404 });
    const input = userSchema.partial().parse(await readJsonRequest(request));
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
    const passwordHash = input.password ? await hashPassword(input.password) : undefined;
    return await prisma.$transaction(async (tx) => {
      await lockUser(tx, id);
      const locked = await tx.user.findUnique({ where: { id } });
      if (!locked) return NextResponse.json({ error: "Pengguna tidak ditemukan." }, { status: 404 });
      // Do not apply authorization computed for a target whose scope changed while waiting.
      if (locked.role !== existing.role || locked.cityId !== existing.cityId || locked.mahalliId !== existing.mahalliId || locked.sectorId !== existing.sectorId) {
        return NextResponse.json({ error: "Data pengguna berubah. Muat ulang sebelum menyimpan.", code: "USER_SCOPE_CONFLICT" }, { status: 409 });
      }
      if ((role !== locked.role || scope.cityId !== locked.cityId)
        && await tx.groupAssignment.count({ where: { musyrifId: id, endedAt: null } })) {
        return activeAssignmentsConflict();
      }
      const updated = await tx.user.update({
        where: { id, role: existing.role, cityId: existing.cityId, mahalliId: existing.mahalliId, sectorId: existing.sectorId },
        data: {
          username: input.username,
          name: input.name,
          email: input.email === "" ? null : input.email,
          ...(!isSelf ? { role, ...scope } : {}),
          ...(role === "MUSYRIF" ? { cityId: scope.cityId, mahalliId: null, sectorId: null } : {}),
          ...(input.password ? { passwordHash: passwordHash, sessionVersion: { increment: 1 } } : {}),
        },
        select: { id: true, username: true, name: true, role: true, isActive: true },
      });
      await tx.activityLog.create({ data: { actorId: currentUser.userId, action: "UPDATE", entityType: "USER", entityId: id, description: `Memperbarui pengguna ${updated.name}.` } });
      return ok({ user: updated });
    }, { isolationLevel: "ReadCommitted" });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertUnsafeRequest(request, false);
    const currentUser = await requireAuth();
    requireRole(currentUser, ["SUPER_ADMIN", "CITY_ADMIN", "MAHALLI_ADMIN", "SECTOR_ADMIN"]);

    const { id } = await params;

    return await prisma.$transaction(async (tx) => {
      if (id === currentUser.userId) {
        return NextResponse.json(
          { error: "Anda tidak dapat menonaktifkan akun sendiri." },
          { status: 400 }
        );
      }

      await lockUser(tx, id);
      const user = await tx.user.findUnique({
        where: { id },
      });

      if (!user) {
        return NextResponse.json(
          { error: "Pengguna tidak ditemukan." },
          { status: 404 }
        );
      }

      if (!canCreateUserRole(currentUser, user.role, user)) {
        return NextResponse.json(
          { error: "Pengguna berada di luar scope akses Anda." },
          { status: 403 }
        );
      }

      if (!user.isActive) {
        return ok({ success: true });
      }

      if (await tx.groupAssignment.count({ where: { musyrifId: id, endedAt: null } })) return activeAssignmentsConflict();
      await tx.user.update({
        where: {
          id,
          isActive: true,
        },
        data: {
          isActive: false,
          sessionVersion: {
            increment: 1,
          },
        },
      });

      await tx.activityLog.create({
        data: {
          actorId: currentUser.userId,
          action: "DEACTIVATE",
          entityType: "USER",
          entityId: id,
          description: `Menonaktifkan pengguna ${user.name}.`,
        },
      });

      return ok({ success: true });
    }, { isolationLevel: "ReadCommitted" });
  } catch (error) {
    return apiError(error);
  }
}

function activeAssignmentsConflict() {
  return NextResponse.json({ error: "Cabut semua penugasan aktif sebelum mengubah kota/peran atau menonaktifkan Musyrif.", code: "USER_ACTIVE_ASSIGNMENTS" }, { status: 409 });
}
