import Link from "next/link";
import { ArrowUpRight, FolderKanban } from "lucide-react";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessibleGroupsWhere } from "@/lib/authorization";
import { CreateGroupForm } from "@/components/management-forms";
import { Card, EmptyState, SectionHeading, StatusBadge } from "@/components/ui";
import { GROUP_STATUS_LABELS } from "@/lib/types";

export default async function GroupsPage() {
  const user = await getSession();
  if (!user) return null;
  const [groups, sectors] = await Promise.all([
    prisma.group.findMany({ where: { ...getAccessibleGroupsWhere(user), status: { not: "DELETED" } }, include: { sector: { include: { mahalli: { include: { city: true } } } }, members: { where: { isActive: true }, select: { id: true } }, userGroups: { where: { user: { role: "MUSYRIF", isActive: true } }, include: { user: { select: { name: true } } } } }, orderBy: { name: "asc" } }),
    prisma.sector.findMany({ where: user.role === "SUPER_ADMIN" ? { isActive: true } : user.role === "CITY_ADMIN" ? { mahalli: { cityId: user.cityId ?? "__none__" } } : user.role === "MAHALLI_ADMIN" ? { mahalliId: user.mahalliId ?? "__none__" } : { id: user.sectorId ?? "__none__" }, include: { mahalli: { include: { city: true } } }, orderBy: { name: "asc" } }),
  ]);
  const canCreate = user.role !== "MUSYRIF";
  const sectorOptions = sectors.map((sector) => ({ id: sector.id, name: sector.name, mahalli: { id: sector.mahalli.id, name: sector.mahalli.name, city: { id: sector.mahalli.city.id, name: sector.mahalli.city.name } } }));
  return <div>
    <SectionHeading eyebrow={user.role === "MUSYRIF" ? "Ruang tugas" : "Operasional"} title={user.role === "MUSYRIF" ? "Kelompok Saya" : "Kelompok"} description={user.role === "MUSYRIF" ? "Kelompok yang saat ini ditugaskan kepada Anda." : "Daftar kelompok yang berada dalam scope wilayah Anda."} action={canCreate ? <Link href="#buat-kelompok" className="btn-primary"><FolderKanban size={16} /> Buat kelompok</Link> : undefined} />
    <div className="grid gap-5 lg:grid-cols-[1fr_330px]">
      <Card className="overflow-hidden">
        <div className="grid gap-4 p-5 md:grid-cols-2">{groups.map((group) => <Link href={`/dashboard/groups/${group.id}`} key={group.id} className="group rounded-xl border border-line p-5 transition hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-card"><div className="flex items-start justify-between"><div className="grid h-11 w-11 place-items-center rounded-xl bg-brand-soft text-lg font-bold text-brand">{group.name.slice(0, 1)}</div><ArrowUpRight size={17} className="text-slate-300 transition group-hover:text-brand" /></div><h3 className="mt-5 font-bold">{group.name}</h3><p className="mt-1 text-xs text-muted">{group.sector.mahalli.city.name} · {group.sector.mahalli.name}</p><p className="mt-0.5 text-xs text-muted">{group.sector.name}</p><div className="mt-5 flex items-center justify-between border-t border-line pt-4"><span className="text-xs font-semibold text-slate-500">{group.members.length} anggota</span><StatusBadge tone={group.status === "ACTIVE" ? "green" : "amber"}>{GROUP_STATUS_LABELS[group.status]}</StatusBadge></div><p className="mt-3 text-xs text-muted">Musyrif: <span className="font-semibold text-ink">{group.userGroups[0]?.user.name || "Belum ditugaskan"}</span></p></Link>)}{!groups.length && <div className="md:col-span-2"><EmptyState title="Belum ada kelompok" description={canCreate ? "Buat kelompok pertama dari panel di sebelah kanan." : "Anda belum ditugaskan ke kelompok mana pun."} /></div>}</div>
      </Card>
      {canCreate && <Card id="buat-kelompok" className="h-fit p-5"><h2 className="font-bold">Buat kelompok baru</h2><p className="mt-1 text-xs leading-5 text-muted">Kelompok harus terhubung ke satu sektor.</p><div className="mt-5"><CreateGroupForm sectors={sectorOptions} /></div></Card>}
    </div>
  </div>;
}