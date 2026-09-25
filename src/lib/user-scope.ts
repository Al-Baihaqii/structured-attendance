import { HttpError } from "./http-error";
import type { Role } from "@prisma/client";
import { prisma } from "./prisma";
import { validateScopeForRole } from "./validators";

type UserScope = { cityId?: string | null; mahalliId?: string | null; sectorId?: string | null };

export async function validateUserScope(role: Role, input: UserScope) {
  const scope = { cityId: input.cityId || null, mahalliId: input.mahalliId || null, sectorId: input.sectorId || null };
  if (role === "MUSYRIF") {
    if (!scope.cityId) throw new HttpError("Musyrif harus memiliki kota.");
    const city = await prisma.city.findUnique({ where: { id: scope.cityId } });
    if (!city) throw new HttpError("Kota tidak ditemukan.");
    return { cityId: scope.cityId, mahalliId: null, sectorId: null };
  }
  const error = validateScopeForRole(role, scope);
  if (error) throw new HttpError(error);
  if (scope.sectorId) {
    const sector = await prisma.sector.findUnique({ where: { id: scope.sectorId }, include: { mahalli: true } });
    if (!sector) throw new HttpError("Sektor tidak ditemukan.");
    if (scope.mahalliId && scope.mahalliId !== sector.mahalliId) throw new HttpError("Sektor tidak berada pada mahalli yang dipilih.");
    if (scope.cityId && scope.cityId !== sector.mahalli.cityId) throw new HttpError("Mahalli tidak berada pada kota yang dipilih.");
    scope.mahalliId = sector.mahalliId;
    scope.cityId = sector.mahalli.cityId;
  } else if (scope.mahalliId) {
    const mahalli = await prisma.mahalli.findUnique({ where: { id: scope.mahalliId } });
    if (!mahalli) throw new HttpError("Mahalli tidak ditemukan.");
    if (scope.cityId && scope.cityId !== mahalli.cityId) throw new HttpError("Mahalli tidak berada pada kota yang dipilih.");
    scope.cityId = mahalli.cityId;
  } else if (scope.cityId) {
    const city = await prisma.city.findUnique({ where: { id: scope.cityId } });
    if (!city) throw new HttpError("Kota tidak ditemukan.");
  }
  return scope;
}
