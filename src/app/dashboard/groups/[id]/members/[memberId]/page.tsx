import { ZodError } from "zod";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { AuthorizationError } from "@/lib/authorization";
import { getMemberAttendanceHistory } from "@/lib/member-attendance-history";
import { Card, StatusBadge } from "@/components/ui";
import { GROUP_STATUS_LABELS } from "@/lib/types";

export default async function MemberAttendanceHistoryPage({ params, searchParams }: { params: Promise<{ id: string; memberId: string }>; searchParams?: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const user = await getSession();
  if (!user) redirect("/login");
  const { id, memberId } = await params;
  let history;
  try {
    history = await getMemberAttendanceHistory(user, id, memberId, await searchParams || {});
  } catch (error) {
    if (error instanceof AuthorizationError || error instanceof ZodError) notFound();
    throw error;
  }
  if (!history) notFound();
  const { member, records, summary } = history;
  const { group } = member;
  return <div>
    <div className="mb-7">
      <Link className="text-xs font-semibold text-brand" href={`/dashboard/groups/${id}`}>Kembali ke kelompok</Link>
      <p className="mt-4 text-xs font-bold uppercase tracking-[0.16em] text-brand">Riwayat presensi</p>
      <h1 className="mt-1 text-3xl font-bold">{member.name}</h1>
      <div className="mt-2"><StatusBadge tone={member.isActive ? "green" : "amber"}>{member.isActive ? "Aktif" : "Nonaktif"}</StatusBadge></div>
      <p className="mt-2 text-sm font-semibold">{group.name} · {GROUP_STATUS_LABELS[group.status]}</p>
      <p className="mt-1 text-xs text-muted">{group.sector.mahalli.city.name} · {group.sector.mahalli.name} · {group.sector.name}</p>
    </div>
    <p className="mb-4 text-xs text-muted">Periode: {history.filters.from || "Awal riwayat"} ? {history.filters.to || "Semua tanggal"}</p>
    <div className="space-y-6">
      <Card className="p-5">
        <h2 className="font-bold">Ringkasan presensi</h2>
        <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div><dt className="text-xs text-muted">Total presensi tercatat</dt><dd>{summary.totalRecorded}</dd></div>
          {(["HADIR", "IZIN", "SAKIT", "ALPA"] as const).map(status => <div key={status}><dt className="text-xs text-muted">{status}</dt><dd>{summary.counts[status]}</dd></div>)}
          <div><dt className="text-xs text-muted">Persentase hadir dari presensi tercatat</dt><dd>{summary.percentage === null ? "Belum ada data" : `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(summary.percentage)}%`}</dd></div>
        </dl>
        <p className="mt-4 text-xs text-muted">Presensi yang belum tercatat tidak dihitung sebagai Alpa.</p>
      </Card>
      <Card className="overflow-hidden">
        <h2 className="border-b border-line px-5 py-4 font-bold">Riwayat pertemuan</h2>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-4">Pertemuan</th><th className="p-4">Tanggal</th><th className="p-4">Status</th></tr></thead><tbody>
          {records.map(record => <tr className="border-t border-line" key={record.id}><td className="p-4">{record.session.meetingNumber}</td><td className="p-4">{new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "UTC" }).format(record.session.date)}</td><td className="p-4">{record.status}</td></tr>)}
          {!records.length && <tr><td className="p-5 text-muted" colSpan={3}>Belum ada data</td></tr>}
        </tbody></table></div>
      </Card>
    </div>
  </div>;
}
