import Link from "next/link";
import { Alert, Card } from "./ui";
import type { getGroupAttendanceReport } from "@/lib/group-attendance-report";

type Report = NonNullable<Awaited<ReturnType<typeof getGroupAttendanceReport>>>;
const percentage = (value: number | null) => value === null ? "Belum ada data" : `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(value)}%`;
export function GroupAttendanceDashboard({ groupId, report, error }: { groupId: string; report: Report | null; error?: string }) {
  return <Card className="overflow-hidden">
    <h2 className="border-b border-line px-5 py-4 font-bold">Ringkasan presensi kelompok</h2>
    <div className="space-y-4 p-5">
      <form method="get" action={`/dashboard/groups/${groupId}`} className="flex flex-wrap items-end gap-3">
        {report?.filters.history && <input type="hidden" name="history" value="1" />}
        <div><label className="label" htmlFor="report-from">Dari tanggal</label><input className="input" id="report-from" name="from" type="date" defaultValue={report?.filters.from} /></div>
        <div><label className="label" htmlFor="report-to">Sampai tanggal</label><input className="input" id="report-to" name="to" type="date" defaultValue={report?.filters.to} /></div>
        <button className="btn-primary" type="submit">Terapkan</button><Link className="btn-quiet" href={`/dashboard/groups/${groupId}${report?.filters.history ? "?history=1" : ""}`}>Semua tanggal</Link>
      </form>
      <Alert message={error || ""} />
      {report && <>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div><dt className="text-xs text-muted">Total pertemuan</dt><dd>{report.totalMeetings}</dd></div>
          <div><dt className="text-xs text-muted">Total presensi tercatat</dt><dd>{report.totalRecorded}</dd></div>
          {(["HADIR", "IZIN", "SAKIT", "ALPA"] as const).map(status => <div key={status}><dt className="text-xs text-muted">{status}</dt><dd>{report.counts[status]}</dd></div>)}
          <div><dt className="text-xs text-muted">Persentase hadir dari presensi tercatat</dt><dd>{percentage(report.percentage)}</dd></div>
        </dl>
        <p className="text-xs text-muted">Presensi yang belum tercatat tidak dihitung sebagai Alpa. Riwayat anggota nonaktif tetap dihitung.</p>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{["Pertemuan", "Tanggal", "Tercatat", "HADIR", "IZIN", "SAKIT", "ALPA", "Persentase hadir"].map(label => <th className="p-2" key={label}>{label}</th>)}</tr></thead><tbody>
          {report.meetings.map(meeting => <tr className="border-t border-line" key={meeting.id}><td className="p-2"><Link className="text-brand" href={`/dashboard/groups/${groupId}/sessions/${meeting.id}`}>{meeting.meetingNumber}</Link></td><td className="p-2">{new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "UTC" }).format(meeting.date)}</td><td className="p-2">{meeting.totalRecorded}</td>{(["HADIR", "IZIN", "SAKIT", "ALPA"] as const).map(status => <td className="p-2" key={status}>{meeting.counts[status]}</td>)}<td className="p-2">{percentage(meeting.percentage)}</td></tr>)}
          {!report.meetings.length && <tr><td className="p-4 text-muted" colSpan={8}>Belum ada data</td></tr>}
        </tbody></table></div>
      </>}
    </div>
  </Card>;
}
