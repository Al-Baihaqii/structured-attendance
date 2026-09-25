import { getReportDateFilter } from "./report-date-filter";
import { createReportContext } from "./report-context";
export { reportDateSchema } from "./report-date-filter";
import { prisma } from "./prisma";
import { getSessionAccessWhere, assertGroupAccess, getAccessibleGroupsWhere } from "./authorization";
import { summarizeAttendanceCounts } from "./attendance-summary";
import type { SessionUser } from "./types";

const emptyCounts = () => ({ HADIR: 0, IZIN: 0, SAKIT: 0, ALPA: 0 });

export async function getGroupAttendanceReport(user: SessionUser, groupId: string, parameters: { from?: unknown; to?: unknown }) {
  const { filters, date } = getReportDateFilter(parameters);
  return prisma.$transaction(async tx => {
    const group = await tx.group.findUnique({ where: { id: groupId }, select: {
      id: true, sectorId: true,
      sector: { select: { mahalliId: true, mahalli: { select: { cityId: true } } } },
      assignments: { select: { id: true, musyrifId: true, endedAt: true } },
    } });
    if (!group) return null;
    assertGroupAccess(user, group, "view");
    const where = { groupId, date, ...getSessionAccessWhere(user) };
    const sessions = await tx.attendanceSession.findMany({ where, select: { id: true, meetingNumber: true, date: true }, orderBy: [{ date: "asc" }, { id: "asc" }] });
    const rows = await tx.attendanceRecord.groupBy({ by: ["sessionId", "status"], where: { session: where }, _count: { _all: true } });
    const countsBySession = new Map(sessions.map(session => [session.id, emptyCounts()]));
    const counts = emptyCounts();
    for (const row of rows) {
      const sessionCounts = countsBySession.get(row.sessionId);
      if (!sessionCounts) continue;
      sessionCounts[row.status] += row._count._all;
      counts[row.status] += row._count._all;
    }
    return {
      context: createReportContext(filters), filters, totalMeetings: sessions.length, ...summarizeAttendanceCounts(counts),
      meetings: sessions.map(session => ({ ...session, ...summarizeAttendanceCounts(countsBySession.get(session.id)!) })),
    };
  }, { isolationLevel: "RepeatableRead" });
}
