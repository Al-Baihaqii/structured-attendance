import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { createRequire } from "node:module";
import { summarizeAttendanceCounts } from "../src/lib/attendance-summary";
import type { SessionUser } from "../src/lib/types";

const require = createRequire(import.meta.url);
let user: SessionUser;
let group: any;
let sessions: any[];
let records: any[];
let calls: string[];
let seenWhere: any;
const matches = (session: any, where: any) => session.groupId === where.groupId && (!where.date.gte || session.date >= where.date.gte) && (!where.date.lt || session.date < where.date.lt);
const tx = {
  group: { findUnique: async () => { calls.push("group"); return group; } },
  attendanceSession: { findMany: async (args: any) => {
    calls.push("sessions"); seenWhere = args.where;
    assert.deepEqual(args.select, { id: true, meetingNumber: true, date: true });
    return sessions.filter(s => matches(s, args.where));
  } },
  attendanceRecord: { groupBy: async (args: any) => {
    calls.push("aggregate");
    assert.deepEqual(args, { by: ["sessionId", "status"], where: { session: seenWhere }, _count: { _all: true } });
    const result = new Map<string, any>();
    for (const record of records) {
      const session = sessions.find(s => s.id === record.sessionId);
      if (!session || !matches(session, args.where.session)) continue;
      const key = `${record.sessionId}:${record.status}`;
      const row = result.get(key) || { sessionId: record.sessionId, status: record.status, _count: { _all: 0 } };
      row._count._all++; result.set(key, row);
    }
    return [...result.values()];
  } },
};
const path = require.resolve("../src/lib/prisma"); require(path);
require.cache[path]!.exports = { prisma: { $transaction: async (fn: any, options: any) => {
  assert.equal(options.isolationLevel, "RepeatableRead"); return fn(tx);
} } };
const { getGroupAttendanceReport, reportDateSchema } = require("../src/lib/group-attendance-report") as typeof import("../src/lib/group-attendance-report");
const report = (parameters = {}) => getGroupAttendanceReport(user, "g1", parameters);
beforeEach(() => {
  user = { userId: "u1", role: "SUPER_ADMIN", name: "Admin", username: "admin", cityId: "c1", mahalliId: "h1", sectorId: "s1", sessionVersion: 0 };
  group = { id: "g1", sectorId: "s1", sector: { mahalliId: "h1", mahalli: { cityId: "c1" } }, userGroups: [{ userId: "u1" }] };
  sessions = []; records = []; calls = [];
});
const session = (id: string, date = "2026-09-16", groupId = "g1") => ({ id, groupId, meetingNumber: 1, date: new Date(`${date}T00:00:00.000Z`) });
test("count-based utility handles empty counts and weighted percentage", () => {
  assert.equal(summarizeAttendanceCounts({ HADIR: 0, IZIN: 0, SAKIT: 0, ALPA: 0 }).percentage, null);
  assert.equal(summarizeAttendanceCounts({ HADIR: 1, IZIN: 3, SAKIT: 3, ALPA: 3 }).percentage, 10);
});
test("empty report returns no percentage", async () => {
  const result = (await report())!;
  assert.equal(result.totalMeetings, 0); assert.equal(result.totalRecorded, 0);
  assert.equal(result.percentage, null); assert.deepEqual(result.meetings, []);
});
test("mixed meetings use weighted totals, retain inactive history, and keep empty meetings", async () => {
  sessions = [session("a"), session("b"), session("empty"), session("outside", "2026-09-16", "other")];
  records = [{ sessionId: "a", status: "HADIR", memberActive: false }, ...Array.from({ length: 9 }, () => ({ sessionId: "b", status: "IZIN" })), { sessionId: "outside", status: "HADIR" }];
  const result = (await report())!;
  assert.equal(result.totalMeetings, 3); assert.equal(result.totalRecorded, 10);
  assert.equal(result.percentage, 10); assert.equal(result.counts.ALPA, 0);
  assert.deepEqual(result.meetings.map(m => m.percentage), [100, 0, null]);
  assert.deepEqual(calls, ["group", "sessions", "aggregate"]);
});
test("inclusive date boundaries use UTC and filter sessions and records together", async () => {
  sessions = [session("before", "2026-09-14"), session("start", "2026-09-15"), session("end", "2026-09-16"), session("after", "2026-09-17")];
  records = sessions.map(s => ({ sessionId: s.id, status: "HADIR" }));
  const result = (await report({ from: "2026-09-15", to: "2026-09-16" }))!;
  assert.equal(result.totalMeetings, 2); assert.equal(result.totalRecorded, 2);
  assert.equal(seenWhere.date.gte.toISOString(), "2026-09-15T00:00:00.000Z");
  assert.equal(seenWhere.date.lt.toISOString(), "2026-09-17T00:00:00.000Z");
  assert.equal((await report({ from: "2026-09-16", to: "2026-09-16" }))!.totalMeetings, 1);
});
test("invalid, repeated, and reversed dates fail before queries", async () => {
  for (const filters of [{ from: "bad" }, { from: ["2026-09-16"] }, { from: "2026-02-30" }, { from: "2026-09-17", to: "2026-09-16" }]) await assert.rejects(report(filters));
  assert.deepEqual(calls, []);
  assert.deepEqual(reportDateSchema.parse({ from: "", to: "" }), { from: undefined, to: undefined });
});
for (const role of ["CITY_ADMIN", "MAHALLI_ADMIN", "SECTOR_ADMIN", "MUSYRIF"] as const) {
  test(`${role}: unauthorized users fail before report queries`, async () => {
    user = { ...user, role, userId: "other", cityId: "other", mahalliId: "other", sectorId: "other" };
    await assert.rejects(report()); assert.deepEqual(calls, ["group"]);
  });
}
for (const role of ["SUPER_ADMIN", "CITY_ADMIN", "MAHALLI_ADMIN", "SECTOR_ADMIN", "MUSYRIF"] as const) {
  test(`${role}: deleted group remains readable`, async () => {
    user.role = role; group.status = "DELETED"; sessions = [session("a")];
    assert.equal((await report())!.totalMeetings, 1);
    assert.equal(calls.length, 3);
  });
}
test("query count does not grow with meetings", async () => {
  sessions = Array.from({ length: 100 }, (_, i) => session(String(i)));
  const result = (await report())!;
  assert.equal(result.totalMeetings, 100); assert.equal(result.percentage, null);
  assert.deepEqual(calls, ["group", "sessions", "aggregate"]);
});
test("missing group has no aggregation", async () => {
  group = null; assert.equal(await report(), null); assert.deepEqual(calls, ["group"]);
});
