"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AttendanceStatus } from "@prisma/client";
import { Alert, StatusBadge } from "./ui";
import { attendanceBatchSchema } from "@/lib/validators";

type Member = { id: string; name: string; isActive: boolean };
type RecordValue = { memberId: string; status: AttendanceStatus; reason: string | null };
type Draft = { status: AttendanceStatus | ""; reason: string };

export function AttendanceForm({ groupId, sessionId, members, records, attendanceVersion }: { groupId: string; sessionId: string; members: Member[]; records: RecordValue[]; attendanceVersion: number }) {
  const router = useRouter();
  const [baseline, setBaseline] = useState({ records, version: attendanceVersion });
  const [conflict, setConflict] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  function valueFor(memberId: string): Draft {
    const record = baseline.records.find((item) => item.memberId === memberId);
    return drafts[memberId] || { status: record?.status || "", reason: record?.reason || "" };
  }
  function change(memberId: string, value: Draft) {
    setDrafts((current) => ({ ...current, [memberId]: value }));
    setSuccess("");
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (loading || conflict) return;
    setError(""); setSuccess("");
    const input = attendanceBatchSchema.safeParse({ expectedVersion: baseline.version, records: members.map((member) => ({ memberId: member.id, ...valueFor(member.id) })) });
    if (!input.success) { setError(input.error.issues[0]?.message || "Data presensi tidak valid."); return; }
    setLoading(true);
    try {
      const response = await fetch(`/api/groups/${groupId}/sessions/${sessionId}/attendance`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input.data) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { if (response.status === 409 && data.code === "ATTENDANCE_VERSION_CONFLICT") setConflict(true); setError(data.error || "Gagal menyimpan presensi."); return; }
      setBaseline({ version: data.attendanceVersion, records: input.data.records.map((record) => ({ ...record, reason: record.reason || null })) });
      setDrafts({});
      setSuccess(data.changedCount === 0 ? "Tidak ada perubahan presensi." : "Presensi berhasil disimpan.");
      router.refresh();
    } catch {
      setError("Gagal menyimpan presensi. Periksa koneksi Anda dan coba kembali.");
    } finally {
      setLoading(false);
    }
  }
  return <form onSubmit={submit}>
    <fieldset disabled={loading} className="divide-y divide-line">
      {members.map((member) => {
        const value = valueFor(member.id);
        const reasonRequired = value.status === "IZIN" || value.status === "ALPA";
        return <div className="space-y-3 px-5 py-4" key={member.id}>
          <div className="flex items-center justify-between gap-3"><p className="min-w-0 break-words text-sm font-semibold">{member.name}</p><StatusBadge tone={member.isActive ? "green" : "amber"}>{member.isActive ? "Aktif" : "Nonaktif"}</StatusBadge></div>
          <div><label className="label" htmlFor={`status-${member.id}`}>Status presensi</label><select id={`status-${member.id}`} className="select" required value={value.status} onChange={(e) => change(member.id, { ...value, status: e.target.value as Draft["status"] })}><option value="" disabled>Belum diisi</option><option value="HADIR">Hadir</option><option value="IZIN">Izin</option><option value="SAKIT">Sakit</option><option value="ALPA">Alpa</option></select></div>
          {value.status && <div><label className="label" htmlFor={`reason-${member.id}`}>Alasan ({reasonRequired ? "wajib" : "opsional"})</label><textarea id={`reason-${member.id}`} className="input" rows={2} required={reasonRequired} value={value.reason} onChange={(e) => change(member.id, { ...value, reason: e.target.value })} /></div>}
        </div>;
      })}
      {!members.length && <div className="p-8 text-center text-sm text-muted">Belum ada anggota pada kelompok ini.</div>}
    </fieldset>
    <div className="space-y-3 border-t border-line p-5"><Alert message={error} /><Alert message={success} tone="success" />{conflict && <button className="btn-quiet" type="button" onClick={() => { if (window.confirm("Muat ulang data terbaru? Input yang belum disimpan akan dibuang.")) window.location.reload(); }}>Muat ulang data terbaru</button>}<button className="btn-primary" type="submit" disabled={loading || conflict || !members.length}>{loading ? "Menyimpan..." : "Simpan presensi"}</button></div>
  </form>;
}
