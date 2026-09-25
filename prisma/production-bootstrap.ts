import type { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

export function assertSeedMode(environment = process.env) {
  if (environment.NODE_ENV === "production" && environment.SEED_DEMO_DATA === "true") {
    throw new Error("Seed demo dilarang di production.");
  }
}

export async function bootstrapProductionAdmin(prisma: PrismaClient, input: { username: string; name: string; email?: string; password: string }) {
  const existing = await prisma.user.findUnique({ where: { username: input.username }, select: { id: true, username: true, role: true, isActive: true, cityId: true, mahalliId: true, sectorId: true } });
  if (existing) {
    if (existing.role !== "SUPER_ADMIN" || !existing.isActive || existing.cityId || existing.mahalliId || existing.sectorId) {
      throw new Error("Username bootstrap sudah digunakan atau akun tidak sesuai. Tidak ada perubahan dilakukan.");
    }
    return existing;
  }
  if (input.password.length < 8 || new TextEncoder().encode(input.password).length > 72) {
    throw new Error("Password bootstrap minimal 8 karakter dan maksimal 72 byte UTF-8.");
  }
  const passwordHash = await bcrypt.hash(input.password, 12);
  // Create, never upsert: a concurrent username collision must fail, not overwrite.
  return prisma.user.create({ data: { username: input.username, name: input.name, email: input.email, passwordHash, role: "SUPER_ADMIN", cityId: null, mahalliId: null, sectorId: null }, select: { id: true, username: true } });
}
