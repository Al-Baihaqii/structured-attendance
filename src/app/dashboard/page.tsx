import Link from "next/link";
import { ArrowUpRight, FolderKanban, MapPinned, UsersRound, UserRoundCheck } from "lucide-react";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessibleGroupsWhere } from "@/lib/authorization";
import { Card, EmptyState, MetricCard, SectionHeading, StatusBadge } from "@/components/ui";
import { GROUP_STATUS_LABELS } from "@/lib/types";

export default async function DashboardPage() {
  const user = await getSession();
  if (!user) return null;
  const groupsWhere = { ...getAccessibleGroupsWhere(user), status: { not: "DELETED" as const } };
  const [groups, users, cities, members, recentLogs] = await Promise.all([
    prisma.group.findMany({ where: groupsWhere, include: { sector: { include: { mahalli: { include: { city: true } } } }, members: { where: { isActive: true }, select: { id: true } }, userGroups: { where: { user: { role: "MUSYRIF", isActive: true } }, include: { user: { select: { name: true } } } } }, orderBy: { updatedAt: "desc" }, take: 5 }),
    prisma.user.count({ where: user.role === "SUPER_ADMIN" ? {} : { cityId: user.cityId ?? "__none__" } }),
    prisma.city.count({ where: user.role === "SUPER_ADMIN" ? { isActive: true } : { id: user.cityId ?? "__none__", isActive: true } }),
    prisma.member.count({ where: { isActive: true, group: groupsWhere } }),
    prisma.activityLog.findMany({ where: user.role === "SUPER_ADMIN" ? {} : { actor: { cityId: user.cityId ?? "__none__" } }, orderBy: { createdAt: "desc" }, take: 5, include: { actor: { select: { name: true } } } }),
  ]);

  return <div>
    <SectionHeading eyebrow="Ringkasan" title={`Halo, ${user.name.split(" ")[0]}`} description="Pantau struktur wilayah dan kelompok yang berada dalam tanggung jawab Anda." action={<Link href="/dashboard/groups" className="btn-primary">Kelola kelompok <ArrowUpRight size={16} /></Link>} />
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Total kelompok" value={groups.length} detail={user.role === "MUSYRIF" ? "Kelompok yang ditugaskan" : "Dalam scope Anda"} icon={<FolderKanban size={20} />} />
      <MetricCard label="Anggota aktif" value={members} detail="Terdaftar di kelompok aktif" icon={<UsersRound size={20} />} accent="green" />
      <MetricCard label="Pengguna" value={users} detail="Akun dalam wilayah akses" icon={<UserRoundCheck size={20} />} accent="amber" />
      <MetricCard label="Kota terjangkau" value={cities} detail="Wilayah organisasi aktif" icon={<MapPinned size={20} />} accent="coral" />
    </div>
    <div className="mt-8 grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-5 py-4"><div><h2 className="font-bold">Kelompok terbaru</h2><p className="mt-1 text-xs text-muted">Kelompok yang terakhir diperbarui</p></div><Link href="/dashboard/groups" className="text-xs font-bold text-brand">Lihat semua</Link></div>
        {groups.length ? <div className="divide-y divide-line">{groups.map((group) => <Link href={`/dashboard/groups/${group.id}`} key={group.id} className="flex items-center justify-between px-5 py-4 transition hover:bg-slate-50"><div className="flex min-w-0 items-center gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-sm font-bold text-brand">{group.name.slice(0, 1).toUpperCase()}</div><div className="min-w-0"><p className="truncate text-sm font-bold">{group.name}</p><p className="mt-1 truncate text-xs text-muted">{group.sector.mahalli.name} · {group.sector.name}</p></div></div><div className="flex items-center gap-4"><div className="hidden text-right sm:block"><p className="text-xs font-semibold">{group.members.length} anggota</p><p className="mt-1 text-[11px] text-muted">{group.userGroups[0]?.user.name || "Belum ada Musyrif"}</p></div><StatusBadge tone={group.status === "ACTIVE" ? "green" : "amber"}>{GROUP_STATUS_LABELS[group.status]}</StatusBadge></div></Link>)}</div> : <EmptyState title="Belum ada kelompok" description="Mulai dengan membuat kelompok pada wilayah yang Anda kelola." href="/dashboard/groups" action="Buka kelompok" />}
      </Card>
      <Card className="overflow-hidden">
        <div className="border-b border-line px-5 py-4"><h2 className="font-bold">Aktivitas terakhir</h2><p className="mt-1 text-xs text-muted">Perubahan penting di workspace</p></div>
        {recentLogs.length ? <div className="divide-y divide-line">{recentLogs.map((log) => <div className="px-5 py-4" key={log.id}><div className="flex items-start gap-3"><div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-coral" /><div><p className="text-xs leading-5 text-ink">{log.description}</p><p className="mt-1 text-[11px] text-muted">{log.actor.name} · {new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(log.createdAt)}</p></div></div></div>)}</div> : <EmptyState title="Belum ada aktivitas" description="Aktivitas penting akan muncul di sini." />}
      </Card>
    </div>
  </div>;
}