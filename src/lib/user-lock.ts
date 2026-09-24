import type { Prisma, User } from "@prisma/client";

// Group operations acquire Group -> User; user mutations never acquire Group locks.
export async function lockUser(tx: Prisma.TransactionClient, userId: string) {
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
}

// Read the assignment candidate from the locked row, avoiding a second round-trip.
// Call only after locking the Group, with the same transaction client.
export async function lockAssignmentUser(tx: Prisma.TransactionClient, userId: string) {
  const users = await tx.$queryRaw<Pick<User, "id" | "name" | "role" | "isActive" | "cityId">[]>`
    SELECT "id", "name", "role", "isActive", "cityId"
    FROM "User" WHERE "id" = ${userId} FOR UPDATE
  `;
  return users[0] ?? null;
}
