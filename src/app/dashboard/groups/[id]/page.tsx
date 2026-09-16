import { ZodError } from "zod";
import { getGroupAttendanceReport } from "@/lib/group-attendance-report";
import { GroupAttendanceDashboard } from "@/components/group-attendance-dashboard";
import { AuthorizationError } from "@/lib/authorization";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertGroupAccess, canManageMeeting } from "@/lib/authorization";
import { GroupDetailClient } from "@/components/group-detail-client";

export default async function GroupDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const user = await getSession();
  if (!user) return null;
  const { id } = await params;
  const group = await prisma.group.findUnique({ where: { id }, include: { sector: { include: { mahalli: { include: { city: true } } } }, attendanceSessions: { orderBy: { meetingNumber: "asc" } }, members: { orderBy: { name: "asc" } }, userGroups: { where: { user: { role: "MUSYRIF", isActive: true } }, include: { user: { select: { id: true, name: true, username: true } } } }, assignmentHistory: { orderBy: { createdAt: "desc" }, take: 10, include: { changedBy: { select: { name: true } } } } } });
  if (!group) notFound();
  try { assertGroupAccess(user, group); } catch { notFound(); }
  let report: Awaited<ReturnType<typeof getGroupAttendanceReport>> = null;
  let reportError: string | undefined;
  const filters = await searchParams;
  try {
    report = await getGroupAttendanceReport(user, id, { from: filters.from, to: filters.to });
    if (!report) notFound();
  } catch (error) {
    if (error instanceof AuthorizationError) notFound();
    if (error instanceof ZodError) reportError = error.issues[0]?.message || "Filter tanggal tidak valid.";
    else throw error;
  }
  const musyrifs = await prisma.user.findMany({ where: { role: "MUSYRIF", isActive: true, ...(user.role === "SUPER_ADMIN" ? {} : { sectorId: group.sectorId }) }, select: { id: true, name: true, username: true, sectorId: true }, orderBy: { name: "asc" } });
  return <GroupDetailClient attendanceDashboard={<GroupAttendanceDashboard groupId={id} report={report} error={reportError} />} group={group} musyrifs={musyrifs} canManage={user.role !== "MUSYRIF"} canCreateMeeting={canManageMeeting(user, group)} />;
}