import type { AttendanceStatus } from "@prisma/client";

export function summarizeAttendance(records: readonly { status: AttendanceStatus }[]) {
  const counts: Record<AttendanceStatus, number> = { HADIR: 0, IZIN: 0, SAKIT: 0, ALPA: 0 };
  for (const record of records) counts[record.status]++;
  return summarizeAttendanceCounts(counts);
}

export function summarizeAttendanceCounts(counts: Record<AttendanceStatus, number>) {
  const totalRecorded = counts.HADIR + counts.IZIN + counts.SAKIT + counts.ALPA;
  return {
    totalRecorded,
    counts: { ...counts },
    percentage: totalRecorded ? counts.HADIR / totalRecorded * 100 : null,
  };
}
