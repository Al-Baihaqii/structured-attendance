import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CalendarDays, UsersRound } from "lucide-react";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSessionAccessWhere, assertSessionAccess, canEditSession, AuthorizationError } from "@/lib/authorization";
import { Card } from "@/components/ui";
import { summarizeAttendance } from "@/lib/attendance-summary";

import { AttendanceForm } from "@/components/attendance-form";

export default async function MeetingDetailPage({ params }: { params: Promise<{ id: string; sessionId: string }> }) {
  const user = await getSession();
  if (!user) redirect("/login");
  const { id: groupId, sessionId } = await params;
  const session = await prisma.attendanceSession.findFirst({
    where: { id: sessionId, groupId, ...getSessionAccessWhere(user, "all") },
    include: {
      assignment: true,
      records: { select: { memberId: true, status: true, reason: true } },
      group: {
        include: {
          sector: { include: { mahalli: { include: { city: true } } } },
          assignments: { select: { id: true, musyrifId: true, endedAt: true } },
          members: { orderBy: { name: "asc" }, select: { id: true, name: true, isActive: true } },
        },
      },
    },
  });
  if (!session) notFound();
  try {
    assertSessionAccess(user, session);
  } catch (error) {
    if (error instanceof AuthorizationError) notFound();
    throw error;
  }
  const { group } = session;
  const summaryRecords = await prisma.attendanceRecord.findMany({
    where: { sessionId: session.id, session: { groupId } },
    select: { status: true },
  });
  const summary = summarizeAttendance(summaryRecords);

  return <div>
    <div className="mb-7">
      <Link href={`/dashboard/groups/${group.id}`} className="mb-4 inline-flex items-center gap-2 text-xs font-semibold text-muted hover:text-brand"><ArrowLeft size={15} /> Kembali ke kelompok</Link>
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">Detail pertemuan</p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight">Pertemuan {session.meetingNumber}</h1>
      <p className="mt-2 text-sm font-semibold">{group.name}</p>
      <p className="mt-1 text-sm text-muted">{group.sector.mahalli.city.name} · {group.sector.mahalli.name} · {group.sector.name}</p>
    </div>
    <div className="space-y-6">
      <Card className="overflow-hidden">
        <h2 className="border-b border-line px-5 py-4 font-bold">Ringkasan presensi</h2>
        <dl className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-3">
          <div><dt className="text-xs text-muted">Total presensi tercatat</dt><dd className="mt-1 text-sm font-semibold">{summary.totalRecorded}</dd></div>
          {(["HADIR", "IZIN", "SAKIT", "ALPA"] as const).map((status) => <div key={status}><dt className="text-xs text-muted">{status}</dt><dd className="mt-1 text-sm font-semibold">{summary.counts[status]}</dd></div>)}
          <div><dt className="text-xs text-muted">Persentase hadir dari presensi tercatat</dt><dd className="mt-1 text-sm font-semibold">{summary.percentage === null ? "Belum ada data" : `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(summary.percentage)}%`}</dd></div>
        </dl>
        <p className="px-5 pb-5 text-xs text-muted">Presensi yang belum tercatat tidak dihitung sebagai Alpa.</p>
      </Card>
      <Card className="overflow-hidden">
        <div className="flex items-center gap-3 border-b border-line px-5 py-4"><div className="rounded-xl bg-brand-soft p-2.5 text-brand"><CalendarDays size={19} /></div><h2 className="font-bold">Informasi pertemuan</h2></div>
        <dl className="space-y-4 p-5">
          <div><dt className="text-xs text-muted">Tanggal pertemuan</dt><dd className="mt-1 text-sm font-semibold">{new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeZone: "UTC" }).format(session.date)}</dd></div>
          <div><dt className="text-xs text-muted">Catatan</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm">{session.notes || "Tidak ada catatan."}</dd></div>
        </dl>
      </Card>
      <Card className="overflow-hidden">
        <div className="flex items-center gap-3 border-b border-line px-5 py-4"><div className="rounded-xl bg-brand-soft p-2.5 text-brand"><UsersRound size={19} /></div><div><h2 className="font-bold">Daftar anggota kelompok</h2><p className="mt-1 text-xs text-muted">{group.members.length} anggota</p></div></div>
        {canEditSession(user, session) ? <AttendanceForm key={session.id} groupId={group.id} sessionId={session.id} members={group.members} records={session.records} attendanceVersion={session.attendanceVersion} /> : <div className="divide-y divide-line">
          <p className="p-5 text-sm text-muted">Riwayat presensi ? hanya baca.</p>
          {group.members.map(member => <div className="p-5" key={member.id}><p>{member.name} ? {member.isActive ? "Aktif" : "Nonaktif"}</p><p>{session.records.find(record => record.memberId === member.id)?.status || "Belum ada data"}</p></div>)}
        </div>}
      </Card>
    </div>
  </div>;
}
