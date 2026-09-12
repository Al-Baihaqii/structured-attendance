import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CalendarDays, UsersRound } from "lucide-react";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertMeetingAccess, AuthorizationError } from "@/lib/authorization";
import { Card } from "@/components/ui";

import { AttendanceForm } from "@/components/attendance-form";

export default async function MeetingDetailPage({ params }: { params: Promise<{ id: string; sessionId: string }> }) {
  const user = await getSession();
  if (!user) redirect("/login");
  const { id: groupId, sessionId } = await params;
  const session = await prisma.attendanceSession.findFirst({
    where: { id: sessionId, groupId },
    include: {
      records: { select: { memberId: true, status: true, reason: true } },
      group: {
        include: {
          sector: { include: { mahalli: { include: { city: true } } } },
          userGroups: { select: { userId: true } },
          members: { orderBy: { name: "asc" }, select: { id: true, name: true, isActive: true } },
        },
      },
    },
  });
  if (!session) notFound();
  try {
    assertMeetingAccess(user, session.group);
  } catch (error) {
    if (error instanceof AuthorizationError) notFound();
    throw error;
  }
  const { group } = session;

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
        <div className="flex items-center gap-3 border-b border-line px-5 py-4"><div className="rounded-xl bg-brand-soft p-2.5 text-brand"><CalendarDays size={19} /></div><h2 className="font-bold">Informasi pertemuan</h2></div>
        <dl className="space-y-4 p-5">
          <div><dt className="text-xs text-muted">Tanggal pertemuan</dt><dd className="mt-1 text-sm font-semibold">{new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeZone: "UTC" }).format(session.date)}</dd></div>
          <div><dt className="text-xs text-muted">Catatan</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm">{session.notes || "Tidak ada catatan."}</dd></div>
        </dl>
      </Card>
      <Card className="overflow-hidden">
        <div className="flex items-center gap-3 border-b border-line px-5 py-4"><div className="rounded-xl bg-brand-soft p-2.5 text-brand"><UsersRound size={19} /></div><div><h2 className="font-bold">Daftar anggota kelompok</h2><p className="mt-1 text-xs text-muted">{group.members.length} anggota</p></div></div>
        <AttendanceForm key={session.id} groupId={group.id} sessionId={session.id} members={group.members} records={session.records} />
      </Card>
    </div>
  </div>;
}
