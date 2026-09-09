import { ShieldCheck, UsersRound } from "lucide-react";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CreateUserForm, DeactivateButton } from "@/components/management-forms";
import { Card, SectionHeading, StatusBadge } from "@/components/ui";
import { ROLE_LABELS } from "@/lib/types";

export default async function UsersPage() {
  const user = await getSession();
  if (!user) return null;
  const where = user.role === "SUPER_ADMIN" ? {} : user.role === "CITY_ADMIN" ? { cityId: user.cityId ?? "__none__" } : user.role === "MAHALLI_ADMIN" ? { mahalliId: user.mahalliId ?? "__none__" } : { sectorId: user.sectorId ?? "__none__" };
  const [users, cities, sectors] = await Promise.all([
    prisma.user.findMany({ where, select: { id: true, name: true, username: true, role: true, isActive: true, city: { select: { name: true } }, mahalli: { select: { name: true } }, sector: { select: { name: true } } }, orderBy: { name: "asc" } }),
    prisma.city.findMany({ where: user.role === "SUPER_ADMIN" ? { isActive: true } : { id: user.cityId ?? "__none__", isActive: true }, include: { mahallis: { where: { isActive: true }, orderBy: { name: "asc" } } }, orderBy: { name: "asc" } }),
    prisma.sector.findMany({ where: user.role === "SUPER_ADMIN" ? { isActive: true } : user.role === "CITY_ADMIN" ? { mahalli: { cityId: user.cityId ?? "__none__" } } : user.role === "MAHALLI_ADMIN" ? { mahalliId: user.mahalliId ?? "__none__" } : { id: user.sectorId ?? "__none__" }, include: { mahalli: { include: { city: true } } }, orderBy: { name: "asc" } }),
  ]);
  const cityOptions = cities.map((city) => ({ id: city.id, name: city.name, mahallis: city.mahallis.map((mahalli) => ({ id: mahalli.id, name: mahalli.name, sectors: [] })) }));
  const sectorOptions = sectors.map((sector) => ({ id: sector.id, name: sector.name, mahalli: { id: sector.mahalli.id, name: sector.mahalli.name, city: { id: sector.mahalli.city.id, name: sector.mahalli.city.name } } }));
  return <div>
    <SectionHeading eyebrow="Akses & peran" title="Pengguna" description="Atur akun, peran, dan batas wilayah setiap pengguna." />
    <div className="grid gap-6 xl:grid-cols-[1fr_410px]">
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-5 py-4"><div><h2 className="font-bold">Daftar pengguna</h2><p className="mt-1 text-xs text-muted">{users.length} akun dalam scope Anda</p></div><UsersRound size={19} className="text-brand" /></div>
        <div className="divide-y divide-line">{users.map((item) => <div key={item.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex min-w-0 items-center gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">{item.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-bold">{item.name}</p><StatusBadge tone={item.isActive ? "green" : "red"}>{item.isActive ? "Aktif" : "Nonaktif"}</StatusBadge></div><p className="mt-1 text-xs text-muted">@{item.username} · {ROLE_LABELS[item.role]}</p><p className="mt-0.5 text-[11px] text-muted">{[item.city?.name, item.mahalli?.name, item.sector?.name].filter(Boolean).join(" / ") || "Akses global"}</p></div></div>{item.id !== user.userId && item.isActive && <DeactivateButton userId={item.id} />}</div>)}</div>
      </Card>
      <Card className="h-fit p-5"><div className="flex items-start gap-3"><div className="rounded-xl bg-brand-soft p-2.5 text-brand"><ShieldCheck size={19} /></div><div><h2 className="font-bold">Tambah pengguna</h2><p className="mt-1 text-xs leading-5 text-muted">Peran dan scope akan divalidasi otomatis.</p></div></div><div className="mt-5"><CreateUserForm cities={cityOptions} sectors={sectorOptions} /></div></Card>
    </div>
  </div>;
}