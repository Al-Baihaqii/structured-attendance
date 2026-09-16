import type { PrismaClient } from "@prisma/client";
import { assertIntegrationEnvironment } from "./environment";

export async function withTestPrisma<T>(run: (prisma: PrismaClient) => Promise<T>): Promise<T> {
  const url = assertIntegrationEnvironment();
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    await prisma.$connect();
    const [identity] = await prisma.$queryRaw<Array<{ database: string; username: string }>>`
      SELECT current_database() AS database, current_user AS username`;
    if (identity.database !== "structured_attendance_test" || identity.username !== "structured_attendance_test") {
      throw new Error("Unexpected integration database identity.");
    }
    return await run(prisma);
  } finally {
    await prisma.$disconnect();
  }
}
