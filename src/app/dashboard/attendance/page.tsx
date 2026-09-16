import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ZodError } from "zod";
import { getSession } from "@/lib/auth";
import { AuthorizationError } from "@/lib/authorization";
import { getHierarchicalAttendanceReport } from "@/lib/hierarchical-attendance-report";
import { Card } from "@/components/ui";

function href(selection: { cityId?: string; mahalliId?: string; sectorId?: string; from?: string; to?: string }) {
  const query = new URLSearchParams(Object.entries(selection).filter((entry): entry is [string, string] => entry[1] !== undefined));
  return `/dashboard/attendance?${query}`;
}
export default async function AttendanceDashboardPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const user = await getSession();
  if (!user) redirect("/login");
  const parameters = await searchParams;
  let report;
  try {
    report = await getHierarchicalAttendanceReport(user, parameters);
  } catch (error) {
    if (error instanceof AuthorizationError || error instanceof ZodError) notFound();
    throw error;
  }
  const labels = { city: "Kota", mahalli: "Mahalli", sector: "Sektor", group: "Kelompok" };
  return <div>
    <h1 className="text-3xl font-bold">Dashboard presensi</h1>
    <p className="mt-2 text-sm text-muted">Rekap berdasarkan wilayah kelompok saat ini. Termasuk kelompok aktif, nonaktif, dan dihapus.</p>
    <p className="mt-1 text-xs text-muted">{user.role === "MUSYRIF" ? "Hanya kelompok yang ditugaskan kepada Anda." : "Hanya wilayah dalam scope akses Anda."} Presensi yang belum tercatat tidak dihitung sebagai Alpa.</p>
    <p className="mt-2 text-xs text-muted">Periode: {report.filters.from || "Awal riwayat"} ? {report.filters.to || "Semua tanggal"}</p>
    <nav className="my-5 flex flex-wrap gap-3 text-sm"><Link className="text-brand" href={href(report.filters)}>Daftar kota</Link>{report.breadcrumbs.map(crumb => <Link className="text-brand" key={href(crumb.selection)} href={href({ ...crumb.selection, ...report.filters })}> / {crumb.name}</Link>)}</nav>
    <Card className="overflow-hidden">
      <h2 className="border-b border-line p-5 font-bold">Daftar {labels[report.level]}</h2>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{[labels[report.level], "Kelompok", "Pertemuan", "Tercatat", "HADIR", "IZIN", "SAKIT", "ALPA", "Persentase hadir"].map((label, i) => <th className="p-3" key={i}>{label}</th>)}</tr></thead><tbody>
        {report.rows.map(row => {
          const next = report.level === "group" ? `/dashboard/groups/${row.id}?${new URLSearchParams(Object.entries(report.filters).filter((entry): entry is [string, string] => entry[1] !== undefined))}` : href({ ...report.selection, ...report.filters, [report.level === "city" ? "cityId" : report.level === "mahalli" ? "mahalliId" : "sectorId"]: row.id });
          return <tr key={row.id} className="border-t border-line"><td className="p-3"><Link className="font-semibold text-brand" href={next}>{row.name}</Link></td><td className="p-3">{row.totalGroups}</td><td className="p-3">{row.totalMeetings}</td><td className="p-3">{row.totalRecorded}</td>{(["HADIR", "IZIN", "SAKIT", "ALPA"] as const).map(status => <td className="p-3" key={status}>{row.counts[status]}</td>)}<td className="p-3">{row.percentage === null ? "Belum ada data" : `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(row.percentage)}%`}</td></tr>;
        })}
        {!report.rows.length && <tr><td colSpan={9} className="p-5 text-muted">Belum ada data</td></tr>}
      </tbody></table></div>
    </Card>
  </div>;
}
