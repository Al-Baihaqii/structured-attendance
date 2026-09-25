import type { Prisma } from "@prisma/client";
import type { SessionUser } from "./types";
import { getAccessibleGroupsWhere } from "./authorization";

export function getHierarchyReadScope(user: SessionUser) {
  const sector: Prisma.SectorWhereInput = user.role === "SUPER_ADMIN" ? {}
    : user.role === "CITY_ADMIN" ? { mahalli: { cityId: user.cityId ?? "__none__" } }
    : user.role === "MAHALLI_ADMIN" ? { mahalliId: user.mahalliId ?? "__none__" }
    : user.role === "SECTOR_ADMIN" ? { id: user.sectorId ?? "__none__" }
    : { groups: { some: getAccessibleGroupsWhere(user) } };
  const mahalli: Prisma.MahalliWhereInput = user.role === "SUPER_ADMIN" ? {}
    : user.role === "CITY_ADMIN" ? { cityId: user.cityId ?? "__none__" }
    : user.role === "MAHALLI_ADMIN" ? { id: user.mahalliId ?? "__none__" }
    : { sectors: { some: sector } };
  const city: Prisma.CityWhereInput = user.role === "SUPER_ADMIN" ? {}
    : user.role === "CITY_ADMIN" ? { id: user.cityId ?? "__none__" }
    : { mahallis: { some: mahalli } };
  return { city, mahalli, sector };
}

export function getAccessibleUsersWhere(user: SessionUser): Prisma.UserWhereInput {
  return user.role === "SUPER_ADMIN" ? {}
    : user.role === "CITY_ADMIN" ? { cityId: user.cityId ?? "__none__" }
    : user.role === "MAHALLI_ADMIN" ? { mahalliId: user.mahalliId ?? "__none__" }
    : user.role === "SECTOR_ADMIN" ? { sectorId: user.sectorId ?? "__none__" }
    : { id: user.userId };
}
