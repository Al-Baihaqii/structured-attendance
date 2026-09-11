import type { Role } from "@prisma/client";
import type { GroupWithScope, SessionUser } from "./types";

export class AuthorizationError extends Error {
  status = 403;

  constructor(message = "Anda tidak memiliki akses untuk melakukan tindakan ini.") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export function requireRole(currentUser: SessionUser, roles: Role[]) {
  if (!roles.includes(currentUser.role)) {
    throw new AuthorizationError("Peran Anda tidak diizinkan melakukan tindakan ini.");
  }

  return currentUser;
}

export function canCreateUserRole(
  currentUser: SessionUser,
  targetRole: Role,
  targetScope: {
    cityId?: string | null;
    mahalliId?: string | null;
    sectorId?: string | null;
  },
) {
  if (currentUser.role === "SUPER_ADMIN") return true;

  if (currentUser.role === "CITY_ADMIN") {
    return (
      ["MAHALLI_ADMIN", "SECTOR_ADMIN", "MUSYRIF"].includes(targetRole) &&
      targetScope.cityId === currentUser.cityId
    );
  }

  if (currentUser.role === "MAHALLI_ADMIN") {
    return (
      ["SECTOR_ADMIN", "MUSYRIF"].includes(targetRole) &&
      targetScope.mahalliId === currentUser.mahalliId
    );
  }

  if (currentUser.role === "SECTOR_ADMIN") {
    return targetRole === "MUSYRIF" && targetScope.sectorId === currentUser.sectorId;
  }

  return false;
}

export function isAssignedMusyrif(currentUser: SessionUser, group: GroupWithScope) {
  if (currentUser.role !== "MUSYRIF") return false;

  return Boolean(
    group.userGroups?.some((assignment) => {
      return assignment.userId === currentUser.userId || assignment.user?.id === currentUser.userId;
    }),
  );
}

export function canViewGroup(currentUser: SessionUser, group: GroupWithScope) {
  if (currentUser.role === "SUPER_ADMIN") return true;

  if (currentUser.role === "CITY_ADMIN") {
    return Boolean(currentUser.cityId && group.sector?.mahalli?.cityId === currentUser.cityId);
  }

  if (currentUser.role === "MAHALLI_ADMIN") {
    return Boolean(currentUser.mahalliId && group.sector?.mahalliId === currentUser.mahalliId);
  }

  if (currentUser.role === "SECTOR_ADMIN") {
    return Boolean(currentUser.sectorId && group.sectorId === currentUser.sectorId);
  }

  return isAssignedMusyrif(currentUser, group);
}

export function canManageGroup(currentUser: SessionUser, group: GroupWithScope) {
  return currentUser.role !== "MUSYRIF" && canViewGroup(currentUser, group);
}

export function canManageMember(currentUser: SessionUser, group: GroupWithScope) {
  return canManageGroup(currentUser, group) || isAssignedMusyrif(currentUser, group);
}

export function canManageMeeting(currentUser: SessionUser, group: GroupWithScope) {
  return canManageGroup(currentUser, group) || isAssignedMusyrif(currentUser, group);
}

export function getAccessibleGroupsWhere(currentUser: SessionUser) {
  if (currentUser.role === "SUPER_ADMIN") return {};

  if (currentUser.role === "CITY_ADMIN") {
    return { sector: { mahalli: { cityId: currentUser.cityId ?? "__none__" } } };
  }

  if (currentUser.role === "MAHALLI_ADMIN") {
    return { sector: { mahalliId: currentUser.mahalliId ?? "__none__" } };
  }

  if (currentUser.role === "SECTOR_ADMIN") {
    return { sectorId: currentUser.sectorId ?? "__none__" };
  }

  return { userGroups: { some: { userId: currentUser.userId } } };
}

export function assertGroupAccess(
  currentUser: SessionUser,
  group: GroupWithScope,
  action: "view" | "manage" = "view",
) {
  const allowed = action === "manage" ? canManageGroup(currentUser, group) : canViewGroup(currentUser, group);

  if (!allowed) {
    throw new AuthorizationError(
      action === "manage"
        ? "Anda tidak memiliki akses untuk mengelola kelompok pada wilayah ini."
        : "Kelompok ini berada di luar scope akses Anda.",
    );
  }
}

export function assertMeetingAccess(currentUser: SessionUser, group: GroupWithScope) {
  if (!canManageMeeting(currentUser, group)) {
    throw new AuthorizationError("Anda tidak memiliki akses untuk mengelola pertemuan kelompok ini.");
  }
}