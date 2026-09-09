"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, History, MoreHorizontal, UserRoundPlus, UsersRound } from "lucide-react";
import { Alert, Card, StatusBadge } from "./ui";
import { AssignmentForm, MemberForm } from "./management-forms";

type Member = { id: string; name: string; isActive: boolean; createdAt: Date };
type Musyrif = { id: string; name: string; username: string; sectorId: string | null };
type HistoryItem = { id: string; reason: string | null; createdAt: Date; oldMusyrifId: string | null; newMusyrifId: string | null; changedBy: { name: string } };

export function GroupDetailClient({ group, musyrifs, canManage }: { group: { id: string; name: string; status: "ACTIVE" | "INACTIVE" | "DELETED"; sector: { name: string; mahalli: { name: string; city: { name: string } } }; members: Member[]; userGroups: { user: { id: string; name: string; username: string } }[]; assignmentHistory: HistoryItem[] }; musyrifs: Musyrif[]; canManage: boolean }) {
  const router = useRouter();
  const [showInactive, setShowInactive] = useState(false);
  const [error, setError] = useState("");
  const activeMembers = group.members.filter((member) => member.isActive);
  const members = showInactive ? group.members : activeMembers;
  async function deactivate(memberId: string) {
    if (!window.confirm("Nonaktifkan anggota ini?")) return;
    const response = await fetch(`/api/members/${memberId}`, { method: "DELETE" });
    if (!response.ok) { const data = await response.json(); setError(data.error || "Gagal memperbarui anggota."); } else router.refresh();
  }
  const currentMusyrif = group.userGroups[0]?.user;
  return <div>
    <div className="mb-7"><Link href="/dashboard/groups" className="mb-4 inline-flex items-center gap-2 text-xs font-semibold text-muted hover:text-brand"><ArrowLeft size={15} /> Kembali ke kelompok</Link><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">Detail kelompok</p><h1 className="mt-1 text-3xl font-bold tracking-tight">{group.name}</h1><p className="mt-2 text-sm text-muted">{group.sector.mahalli.city.name} · {group.sector.mahalli.name} · {group.sector.name}</p></div><StatusBadge tone={group.status === "ACTIVE" ? "green" : "amber"}>{group.status === "ACTIVE" ? "Aktif" : "Nonaktif"}</StatusBadge></div></div>
    <Alert message={error} />
    <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
      <div className="space-y-6">
        <Card className="overflow-hidden"><div className="flex flex-col justify-between gap-3 border-b border-line px-5 py-4 sm:flex-row sm:items-center"><div className="flex items-center gap-3"><div className="rounded-xl bg-brand-soft p-2.5 text-brand"><UsersRound size={19} /></div><div><h2 className="font-bold">Daftar anggota</h2><p className="mt-1 text-xs text-muted">{activeMembers.length} anggota aktif</p></div></div>{canManage && <button className="btn-quiet" onClick={() => setShowInactive((value) => !value)}>{showInactive ? "Sembunyikan nonaktif" : "Tampilkan nonaktif"}</button>}</div>{canManage && <div className="border-b border-line p-5"><MemberForm groupId={group.id} /></div>}<div className="divide-y divide-line">{members.map((member, index) => <div className="flex items-center justify-between px-5 py-4" key={member.id}><div className="flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-xs font-bold text-slate-500">{String(index + 1).padStart(2, "0")}</div><div><p className={`text-sm font-semibold ${!member.isActive ? "text-slate-400 line-through" : ""}`}>{member.name}</p><p className="mt-0.5 text-[11px] text-muted">Bergabung {new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(new Date(member.createdAt))}</p></div></div>{canManage && member.isActive && <button className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" onClick={() => deactivate(member.id)} aria-label="Nonaktifkan anggota"><MoreHorizontal size={17} /></button>}</div>)}{!members.length && <div className="p-10 text-center text-sm text-muted">Belum ada anggota aktif.</div>}</div></Card>
        <Card className="overflow-hidden"><div className="flex items-center gap-3 border-b border-line px-5 py-4"><div className="rounded-xl bg-amber-50 p-2.5 text-amber-700"><History size={19} /></div><div><h2 className="font-bold">Riwayat penugasan</h2><p className="mt-1 text-xs text-muted">Perubahan Musyrif pada kelompok ini</p></div></div><div className="divide-y divide-line">{group.assignmentHistory.map((item) => <div className="flex gap-3 px-5 py-4" key={item.id}><div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-amber-400" /><div><p className="text-sm">{item.newMusyrifId ? "Penugasan Musyrif diperbarui" : "Penugasan Musyrif dicabut"}</p><p className="mt-1 text-xs text-muted">{item.changedBy.name} · {new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.createdAt))}{item.reason ? ` · ${item.reason}` : ""}</p></div></div>)}{!group.assignmentHistory.length && <div className="p-8 text-center text-sm text-muted">Belum ada riwayat penugasan.</div>}</div></Card>
      </div>
      <div className="space-y-6">
        <Card className="p-5"><div className="flex items-start gap-3"><div className="rounded-xl bg-coral/10 p-2.5 text-coral"><UserRoundPlus size={19} /></div><div><h2 className="font-bold">Musyrif aktif</h2><p className="mt-1 text-xs text-muted">Maksimal satu Musyrif per kelompok.</p></div></div>{currentMusyrif ? <div className="mt-5 rounded-xl bg-slate-50 p-4"><p className="font-semibold">{currentMusyrif.name}</p><p className="mt-1 text-xs text-muted">@{currentMusyrif.username}</p></div> : <div className="mt-5 rounded-xl border border-dashed border-line p-4 text-center text-sm text-muted">Belum ada Musyrif</div>}{canManage && <div className="mt-5 border-t border-line pt-4"><AssignmentForm groupId={group.id} musyrifs={musyrifs} currentMusyrifId={currentMusyrif?.id} /></div>}</Card>
      </div>
    </div>
  </div>;
}