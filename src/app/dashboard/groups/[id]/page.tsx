import { ZodError } from "zod";
import { getGroupAttendanceReport } from "@/lib/group-attendance-report";
import { GroupAttendanceDashboard } from "@/components/group-attendance-dashboard";
import { AuthorizationError } from "@/lib/authorization";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertGroupAccess, canManageMeeting, getSessionAccessWhere } from "@/lib/authorization";
import { GroupDetailClient } from "@/components/group-detail-client";

export default async function GroupDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const user = await getSession();
  if (!user) return null;
  const { id } = await params;
  const filters = await searchParams;
  const history = filters.history === "1";
  const group = await prisma.group.findUnique({ where: { id }, include: { sector: { include: { mahalli: { include: { city: true } } } }, attendanceSessions: { where: getSessionAccessWhere(user, history ? "history" : "active"), orderBy: { meetingNumber: "asc" } }, members: { orderBy: { name: "asc" } }, assignments: { include: { musyrif: { select: { id: true, name: true, username: true } } } }, assignmentHistory: { orderBy: { createdAt: "desc" }, take: 10, where: user.role === "MUSYRIF" ? { id: "__none__" } : {}, include: { changedBy: { select: { name: true } } } } } });
  if (!group) notFound();
  try { assertGroupAccess(user, group); } catch { notFound(); }
  let report: Awaited<ReturnType<typeof getGroupAttendanceReport>> = null;
  let reportError: string | undefined;
  try {
    report = await getGroupAttendanceReport(user, id, { from: filters.from, to: filters.to, history: filters.history });
    if (!report) notFound();
  } catch (error) {
    if (error instanceof AuthorizationError) notFound();
    if (error instanceof ZodError) reportError = error.issues[0]?.message || "Filter tanggal tidak valid.";
    else throw error;
  }
  const musyrifs = user.role === "MUSYRIF" ? [] : await prisma.user.findMany({ where: { role: "MUSYRIF", isActive: true, cityId: group.sector.mahalli.cityId }, select: { id: true, name: true, username: true, cityId: true }, orderBy: { name: "asc" } });
  return <GroupDetailClient attendanceDashboard={<GroupAttendanceDashboard groupId={id} report={report} error={reportError} />} group={group} musyrifs={musyrifs} canManage={user.role !== "MUSYRIF" && group.status !== "DELETED"} canCreateMeeting={!history && group.status !== "DELETED" && group.assignments.some(a => a.endedAt === null) && canManageMeeting(user, group)} isMusyrif={user.role === "MUSYRIF"} history={history} />;
}