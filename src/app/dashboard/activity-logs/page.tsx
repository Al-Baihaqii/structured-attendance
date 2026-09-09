import { Activity, Clock3 } from "lucide-react";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, SectionHeading, StatusBadge } from "@/components/ui";

export default async function ActivityLogsPage() {
  const user = await getSession();
  if (!user) return null;
  const logs = await prisma.activityLog.findMany({ where: user.role === "SUPER_ADMIN" ? {} : { actor: { cityId: user.cityId ?? "__none__" } }, include: { actor: { select: { name: true, role: true } } }, orderBy: { createdAt: "desc" }, take: 100 });
  return <div>
    <SectionHeading eyebrow="Audit trail" title="Log aktivitas" description="Riwayat tindakan penting yang terjadi dalam scope Anda." action={<div className="flex items-center gap-2 text-xs text-muted"><Clock3 size={15} /> 100 aktivitas terbaru</div>} />
    <Card className="overflow-hidden">
      <div className="hidden grid-cols-[1.2fr_1fr_0.8fr_1.4fr] gap-4 border-b border-line bg-slate-50/70 px-5 py-3 text-[10px] font-bold uppercase tracking-[0.14em] text-muted sm:grid"><span>Aktivitas</span><span>Pelaku</span><span>Entitas</span><span>Waktu</span></div>
      <div className="divide-y divide-line">{logs.map((log) => <div key={log.id} className="grid gap-3 px-5 py-4 sm:grid-cols-[1.2fr_1fr_0.8fr_1.4fr] sm:items-center sm:gap-4"><div className="flex items-start gap-3"><div className="mt-0.5 rounded-lg bg-brand-soft p-2 text-brand"><Activity size={15} /></div><p className="text-sm font-medium leading-5">{log.description}</p></div><div><p className="text-sm font-semibold">{log.actor.name}</p><p className="mt-0.5 text-[11px] text-muted">{log.actor.role.replaceAll("_", " ")}</p></div><div><StatusBadge tone="blue">{log.entityType}</StatusBadge></div><div className="text-xs text-muted">{new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(log.createdAt)}</div></div>)}{!logs.length && <div className="p-12 text-center text-sm text-muted">Belum ada aktivitas tercatat.</div>}</div>
    </Card>
  </div>;
}