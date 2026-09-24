import type { Prisma } from "@prisma/client";

// Group operations acquire Group -> User; user mutations never acquire Group locks.
export async function lockUser(tx: Prisma.TransactionClient, userId: string) {
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
}
