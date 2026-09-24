import type { Prisma } from "@prisma/client";
import { lockGroup } from "../src/lib/group-lock";
import { lockUser } from "../src/lib/user-lock";

// Idempotent bootstrap: never replace another tenure or erase closed history.
export async function ensureSeedAssignment(tx: Prisma.TransactionClient, groupId: string, musyrifId: string) {
  await lockGroup(tx, groupId);
  await lockUser(tx, musyrifId);
  const group = await tx.group.findUnique({ where: { id: groupId }, include: { sector: { include: { mahalli: true } } } });
  const user = await tx.user.findUnique({ where: { id: musyrifId } });
  if (!group || group.status === "DELETED" || !user?.isActive || user.role !== "MUSYRIF"
    || !user.cityId || user.cityId !== group.sector.mahalli.cityId || user.mahalliId || user.sectorId) {
    throw new Error("Scope penugasan seed tidak valid.");
  }
  const active = await tx.groupAssignment.findMany({ where: { groupId, endedAt: null } });
  if (active.length > 1 || (active.length === 1 && active[0].musyrifId !== musyrifId)) {
    throw new Error("Kelompok seed sudah memiliki penugasan aktif lain.");
  }
  return active[0] ?? tx.groupAssignment.create({ data: { groupId, musyrifId } });
}
