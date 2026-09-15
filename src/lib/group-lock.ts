import type { Prisma } from "@prisma/client";

// Lock the parent even when no assignment exists. Held until transaction completion.
export async function lockGroup(tx: Prisma.TransactionClient, groupId: string) {
  await tx.$queryRaw`SELECT "id" FROM "Group" WHERE "id" = ${groupId} FOR UPDATE`;
}
