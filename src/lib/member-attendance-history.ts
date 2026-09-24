import { getReportDateFilter, type ReportDateParameters } from "./report-date-filter";
import { createReportContext } from "./report-context";
import { prisma } from "./prisma";
import { getSessionAccessWhere, assertGroupAccess } from "./authorization";
import { summarizeAttendance } from "./attendance-summary";
import type { SessionUser } from "./types";

export async function getMemberAttendanceHistory(user: SessionUser, groupId: string, memberId: string, parameters: ReportDateParameters = {}) {
  const { filters, date } = getReportDateFilter(parameters);
  return prisma.$transaction(async tx => {
    const member = await tx.member.findFirst({
      where: { id: memberId, groupId },
      select: {
        id: true, name: true, isActive: true,
        group: { select: {
          id: true, name: true, status: true, sectorId: true,
          sector: { select: { name: true, mahalliId: true, mahalli: { select: { name: true, cityId: true, city: { select: { name: true } } } } } },
          assignments: { select: { id: true, musyrifId: true, endedAt: true } },
        } },
      },
    });
    if (!member) return null;
    assertGroupAccess(user, member.group, "view");
    const records = await tx.attendanceRecord.findMany({
      where: { memberId, session: { groupId, ...getSessionAccessWhere(user, filters.history ? "history" : "active"), ...(Object.keys(date).length ? { date } : {}) } },
      select: { id: true, status: true, session: { select: { meetingNumber: true, date: true } } },
      orderBy: [{ session: { date: "desc" } }, { id: "desc" }],
    });
    return { context: createReportContext(filters), filters, member, records, summary: summarizeAttendance(records) };
  }, { isolationLevel: "RepeatableRead" });
}
