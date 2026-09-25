import type { GroupStatus, Role, Prisma } from "@prisma/client";
import type { GroupWithScope, SessionUser } from "./types";

export class AuthorizationError extends Error {
  status = 403;

  constructor(message = "Anda tidak memiliki akses untuk melakukan tindakan ini.") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export class GroupDeletedError extends Error {
  constructor() {
    super("Kelompok telah dihapus dan tidak dapat diubah.");
    this.name = "GroupDeletedError";
  }
}

export function assertGroupMutable(group: { status: GroupStatus }) {
  if (group.status === "DELETED") throw new GroupDeletedError();
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
  // City-owned accounts must not become manageable through stale legacy lower scopes.
  if (targetRole === "MUSYRIF") {
    return currentUser.role === "CITY_ADMIN" && Boolean(currentUser.cityId) && targetScope.cityId === currentUser.cityId;
  }


  if (currentUser.role === "CITY_ADMIN") {
    return (
      ["MAHALLI_ADMIN", "SECTOR_ADMIN", "MUSYRIF"].includes(targetRole) &&
      Boolean(currentUser.cityId) && targetScope.cityId === currentUser.cityId
    );
  }

  if (currentUser.role === "MAHALLI_ADMIN") {
    return (
      ["SECTOR_ADMIN", "MUSYRIF"].includes(targetRole) &&
      Boolean(currentUser.mahalliId) && targetScope.mahalliId === currentUser.mahalliId
    );
  }

  if (currentUser.role === "SECTOR_ADMIN") {
    return false;
  }

  return false;
}

export function isAssignedMusyrif(currentUser: SessionUser, group: GroupWithScope) {
  if (currentUser.role !== "MUSYRIF") return false;

  return Boolean(currentUser.cityId && currentUser.cityId === group.sector?.mahalli?.cityId
    && group.assignments?.some(assignment => assignment.musyrifId === currentUser.userId && assignment.endedAt === null));
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

  return { assignments: { some: { musyrifId: currentUser.userId, endedAt: null } }, sector: { mahalli: { cityId: currentUser.cityId ?? "__none__" } } };
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


export function getSessionAccessWhere(user: SessionUser): Prisma.AttendanceSessionWhereInput {
  return { group: getAccessibleGroupsWhere(user) };
}

type SessionAccess = {
  groupId: string; group: GroupWithScope;
  assignment: { id: string; groupId: string; musyrifId: string; endedAt: Date | null } | null;
};
export function canEditSession(user: SessionUser, session: SessionAccess) {
  if (session.group.status === "DELETED") return false;
  if (user.role !== "MUSYRIF") return canManageGroup(user, session.group);
  return Boolean(session.assignment && session.assignment.groupId === session.groupId
    && session.assignment.musyrifId === user.userId && session.assignment.endedAt === null
    && isAssignedMusyrif(user, session.group)
    && session.group.assignments?.some(a => a.id === session.assignment?.id && a.endedAt === null));
}
export function assertSessionAccess(user: SessionUser, session: SessionAccess, action: "view" | "manage" = "view") {
  const allowed = action === "view" ? canViewGroup(user, session.group)
    : user.role === "MUSYRIF" ? Boolean(session.assignment?.groupId === session.groupId
      && session.assignment.musyrifId === user.userId && session.assignment.endedAt === null
      && isAssignedMusyrif(user, session.group)
      && session.group.assignments?.some(a => a.id === session.assignment?.id && a.endedAt === null))
    : canManageGroup(user, session.group);
  if (!allowed) throw new AuthorizationError();
}
