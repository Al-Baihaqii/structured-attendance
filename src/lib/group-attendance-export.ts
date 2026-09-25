import { prisma } from "./prisma";
import { assertGroupAccess, getSessionAccessWhere } from "./authorization";
import { getReportDateFilter, type ReportDateParameters } from "./report-date-filter";
import { summarizeAttendance } from "./attendance-summary";
import { createCsv, csvFilename } from "./csv";
import type { SessionUser } from "./types";

export async function getGroupAttendanceExport(user: SessionUser, groupId: string, format: "summary" | "detail", parameters: ReportDateParameters) {
  const { filters, date } = getReportDateFilter(parameters);
  return prisma.$transaction(async tx => {
    const group = await tx.group.findUnique({ where: { id: groupId }, select: {
      id: true, name: true, sectorId: true,
      sector: { select: { mahalliId: true, mahalli: { select: { cityId: true } } } },
      assignments: { select: { id: true, musyrifId: true, endedAt: true } },
    } });
    if (!group) return null;
    assertGroupAccess(user, group, "view");
    const where = { groupId, date, ...getSessionAccessWhere(user) };
    let rows: (string | number | null)[][];
    if (format === "summary") {
      const sessions = await tx.attendanceSession.findMany({ where, select: {
        meetingNumber: true, date: true, notes: true,
        assignment: { select: { musyrif: { select: { name: true } } } },
        records: { select: { status: true } },
      }, orderBy: [{ date: "asc" }, { id: "asc" }] });
      rows = [["Pertemuan", "Tanggal", "Materi/Catatan", "Musyrif", "Tercatat", "Hadir", "Izin", "Sakit", "Alpa", "Persentase Hadir"],
        ...sessions.map(session => {
          const summary = summarizeAttendance(session.records);
          return [session.meetingNumber, session.date.toISOString().slice(0, 10), session.notes, session.assignment.musyrif.name,
            summary.totalRecorded, summary.counts.HADIR, summary.counts.IZIN, summary.counts.SAKIT, summary.counts.ALPA,
            summary.percentage === null ? "Belum ada data" : `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(summary.percentage)}%`];
        })];
    } else {
      const records = await tx.attendanceRecord.findMany({ where: { session: where }, select: {
        status: true, reason: true, member: { select: { name: true } },
        session: { select: { meetingNumber: true, date: true, assignment: { select: { musyrif: { select: { name: true } } } } } },
      }, orderBy: [{ session: { date: "asc" } }, { session: { meetingNumber: "asc" } }, { member: { name: "asc" } }, { id: "asc" }] });
      rows = [["Pertemuan", "Tanggal", "Musyrif", "Anggota", "Status", "Alasan"],
        ...records.map(record => [record.session.meetingNumber, record.session.date.toISOString().slice(0, 10), record.session.assignment.musyrif.name, record.member.name, record.status, record.reason])];
    }
    return { csv: createCsv(rows), filename: csvFilename(group.name, format === "summary" ? "ringkasan-pertemuan" : "detail-presensi", filters) };
  }, { isolationLevel: "RepeatableRead", timeout: 15_000 });
}
