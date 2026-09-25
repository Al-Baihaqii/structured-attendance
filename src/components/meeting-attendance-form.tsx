"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { meetingAttendanceSchema } from "@/lib/validators";
import { Alert } from "./ui";

export function MeetingAttendanceForm({ groupId, nextMeetingNumber, members }: {
  groupId: string; nextMeetingNumber: number; members: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [drafts, setDrafts] = useState<Record<string, { status: string; reason: string }>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (loading) return;
    setError(""); setSuccess("");
    const input = meetingAttendanceSchema.safeParse({ date, notes, records: members.flatMap(member =>
      drafts[member.id]?.status ? [{ memberId: member.id, ...drafts[member.id] }] : []) });
    if (!input.success) { setError(input.error.issues[0]?.message || "Data pertemuan dan presensi tidak valid."); return; }
    setLoading(true);
    try {
      const response = await fetch(`/api/groups/${groupId}/sessions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input.data) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { setError(data.error || "Gagal menyimpan pertemuan dan presensi."); return; }
      setDate(""); setNotes(""); setDrafts({});
      setSuccess(`Pertemuan ${data.session.meetingNumber} dan presensi berhasil disimpan.`);
      router.refresh();
    } catch {
      setError("Gagal menyimpan pertemuan dan presensi. Periksa koneksi Anda dan coba kembali.");
    } finally { setLoading(false); }
  }
  return <form onSubmit={submit} className="space-y-3">
    <fieldset disabled={loading} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="label" htmlFor="meeting-number">Nomor pertemuan berikutnya</label><input id="meeting-number" className="input" readOnly value={nextMeetingNumber} /><p className="mt-1 text-xs text-muted">Nomor akhir ditentukan otomatis saat disimpan.</p></div>
        <div><label className="label" htmlFor="meeting-date">Tanggal pertemuan</label><input id="meeting-date" className="input" type="date" required value={date} onChange={event => setDate(event.target.value)} /></div>
      </div>
      <div><label className="label" htmlFor="meeting-notes">Catatan / materi (opsional)</label><textarea id="meeting-notes" className="input" rows={3} maxLength={1000} value={notes} onChange={event => setNotes(event.target.value)} /></div>
      <p className="text-xs text-muted">Presensi yang belum diisi tetap tidak tercatat, bukan Alpa.</p>
      {members.map(member => {
        const draft = drafts[member.id] || { status: "", reason: "" };
        const required = draft.status === "IZIN" || draft.status === "ALPA";
        return <div key={member.id} className="space-y-2 border-t border-line pt-3">
          <label className="label" htmlFor={`new-status-${member.id}`}>{member.name}</label>
          <select id={`new-status-${member.id}`} className="select" value={draft.status} onChange={event => setDrafts(current => ({ ...current, [member.id]: { ...draft, status: event.target.value } }))}>
            <option value="">Belum diisi</option><option value="HADIR">Hadir</option><option value="IZIN">Izin</option><option value="SAKIT">Sakit</option><option value="ALPA">Alpa</option>
          </select>
          {draft.status && <div><label className="label" htmlFor={`new-reason-${member.id}`}>Alasan ({required ? "wajib" : "opsional"})</label><textarea id={`new-reason-${member.id}`} className="input" rows={2} required={required} value={draft.reason} onChange={event => setDrafts(current => ({ ...current, [member.id]: { ...draft, reason: event.target.value } }))} /></div>}
        </div>;
      })}
      {!members.length && <p className="text-sm text-muted">Belum ada anggota aktif.</p>}
      <button className="btn-primary" type="submit" disabled={loading}>{loading ? "Menyimpan..." : "Simpan pertemuan & presensi"}</button>
    </fieldset>
    <Alert message={error} /><Alert message={success} tone="success" />
  </form>;
}
