import type { Role } from "@prisma/client";

export type SessionUser = {
  userId: string;
  username: string;
  name: string;
  role: Role;
  cityId: string | null;
  mahalliId: string | null;
  sectorId: string | null;
  sessionVersion: number;
};

export type GroupWithScope = {
  id: string;
  sectorId: string;
  status?: string;
  sector?: {
    mahalliId: string;
    mahalli?: {
      cityId: string;
    } | null;
  } | null;
  userGroups?: {
    userId?: string;
    user?: {
      id: string;
    };
  }[];
};

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin",
  CITY_ADMIN: "Admin Kota",
  MAHALLI_ADMIN: "Admin Mahalli",
  SECTOR_ADMIN: "Admin Sektor",
  MUSYRIF: "Musyrif",
};

export const GROUP_STATUS_LABELS = {
  ACTIVE: "Aktif",
  INACTIVE: "Nonaktif",
  DELETED: "Dihapus",
} as const;