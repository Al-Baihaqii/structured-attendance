import { PrismaClient, Role, GroupStatus } from "@prisma/client";
import { ensureSeedAssignment } from "./seed-assignment";
import { lockUser } from "../src/lib/user-lock";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const required = (key: string) => {
  const value = process.env[key];
  if (!value) throw new Error(`${key} belum diatur.`);
  return value;
};

async function upsertUser(input: {
  username: string;
  name: string;
  email?: string;
  password: string;
  role: Role;
  cityId?: string;
  mahalliId?: string;
  sectorId?: string;
}) {
  const passwordHash = await bcrypt.hash(input.password, 12);
  if (input.role === "MUSYRIF" && !input.cityId) throw new Error("Musyrif seed harus memiliki kota.");
  return prisma.$transaction(async tx => {
    const existing = await tx.user.findUnique({ where: { username: input.username } });
    if (existing) {
      await lockUser(tx, existing.id);
      const locked = await tx.user.findUniqueOrThrow({ where: { id: existing.id } });
      if ((locked.role !== input.role || locked.cityId !== (input.cityId ?? null))
        && await tx.groupAssignment.count({ where: { musyrifId: locked.id, endedAt: null } })) {
        throw new Error("Seed tidak boleh mengubah kota/peran pengguna dengan penugasan aktif.");
      }
    }
    return tx.user.upsert({
      where: { username: input.username },
      update: {
        name: input.name,
        email: input.email,
        passwordHash,
        role: input.role,
        isActive: true,
        cityId: input.cityId ?? null,
        mahalliId: input.role === "MUSYRIF" ? null : input.mahalliId ?? null,
        sectorId: input.role === "MUSYRIF" ? null : input.sectorId ?? null,
      },
      create: {
        username: input.username,
        name: input.name,
        email: input.email,
        passwordHash,
        role: input.role,
        cityId: input.cityId ?? null,
        mahalliId: input.role === "MUSYRIF" ? null : input.mahalliId ?? null,
        sectorId: input.role === "MUSYRIF" ? null : input.sectorId ?? null,
      },
    });
  }, { isolationLevel: "ReadCommitted" });
}

async function main() {
  const seedPassword = required("SUPER_ADMIN_PASSWORD");
  const admin = await upsertUser({
    username: required("SUPER_ADMIN_USERNAME"),
    name: required("SUPER_ADMIN_NAME"),
    email: process.env.SUPER_ADMIN_EMAIL || undefined,
    password: seedPassword,
    role: "SUPER_ADMIN",
  });

  if (process.env.SEED_DEMO_DATA !== "true") {
    console.log(`Super Admin ${admin.username} siap digunakan.`);
    return;
  }

  const city = await prisma.city.upsert({
    where: { name: "Semarang" },
    update: { isActive: true },
    create: { name: "Semarang" },
  });
  const mahalli = await prisma.mahalli.upsert({
    where: { cityId_name: { cityId: city.id, name: "Semarang Barat" } },
    update: { isActive: true },
    create: { cityId: city.id, name: "Semarang Barat" },
  });
  const sector = await prisma.sector.upsert({
    where: { mahalliId_name: { mahalliId: mahalli.id, name: "Kalibanteng" } },
    update: { isActive: true },
    create: { mahalliId: mahalli.id, name: "Kalibanteng" },
  });
  const group = await prisma.group.upsert({
    where: { sectorId_name: { sectorId: sector.id, name: "Kelompok 1" } },
    update: { status: GroupStatus.ACTIVE },
    create: { sectorId: sector.id, name: "Kelompok 1" },
  });

  await upsertUser({
    username: "admin.kota",
    name: "Admin Kota Semarang",
    password: seedPassword,
    role: "CITY_ADMIN",
    cityId: city.id,
  });
  await upsertUser({
    username: "admin.mahalli",
    name: "Admin Mahalli Barat",
    password: seedPassword,
    role: "MAHALLI_ADMIN",
    cityId: city.id,
    mahalliId: mahalli.id,
  });
  await upsertUser({
    username: "admin.sektor",
    name: "Admin Sektor Kalibanteng",
    password: seedPassword,
    role: "SECTOR_ADMIN",
    cityId: city.id,
    mahalliId: mahalli.id,
    sectorId: sector.id,
  });
  const musyrif = await upsertUser({
    username: "musyrif.kalibanteng",
    name: "Ahmad Fauzan",
    password: seedPassword,
    role: "MUSYRIF",
    cityId: city.id,
  });

  await prisma.$transaction(tx => ensureSeedAssignment(tx, group.id, musyrif.id), { isolationLevel: "ReadCommitted" });

  const demoMembers = ["Budi Santoso", "Dimas Pratama", "Rizky Maulana", "Fajar Hidayat", "Ilham Ramadhan"];
  for (const name of demoMembers) {
    await prisma.member.upsert({
      where: { id: `${group.id}-${name.toLowerCase().replaceAll(" ", "-")}` },
      update: { isActive: true, name },
      create: { id: `${group.id}-${name.toLowerCase().replaceAll(" ", "-")}`, groupId: group.id, name },
    });
  }

  console.log("Seed demo selesai.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());