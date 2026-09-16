import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { createRequire } from "node:module";
import type { SessionUser } from "../src/lib/types";

const require = createRequire(import.meta.url);
let user: SessionUser;
let calls: string[];
let groups: any[];
let cities: any[];
let mahallis: any[];
let sectors: any[];
let sessions: any[];
let records: any[];
let members: any[];
function matches(row: any, where: any): boolean {
  return Object.entries(where || {}).every(([key, value]: [string, any]) => {
    if (key === "gte") return row >= value;
    if (key === "lt") return row < value;
    if (key === "AND") return value.every((part: any) => matches(row, part));
    if (value === undefined) return true;
    if (value && typeof value === "object") {
      if (value.some) return row[key].some((child: any) => matches(child, value.some));
      return matches(row[key], value);
    }
    return row[key] === value;
  });
}
function project(row: any, select: any): any {
  if (Array.isArray(row)) return row.map(item => project(item, select));
  return Object.fromEntries(Object.entries(select).map(([key, value]: [string, any]) => [key, value === true ? row[key] : project(row[key], value.select)]));
}
function delegate(name: string, data: () => any[]) {
  return {
    findUnique: async ({ where, select }: any) => { const row = data().find(r => matches(r, where)); return row ? project(row, select) : null; },
    findFirst: async ({ where, select }: any) => { calls.push(name + ".first"); const row = data().find(r => matches(r, where)); return row ? project(row, select) : null; },
    findMany: async ({ where, select }: any) => {
      calls.push(name + ".many");
      assert.doesNotMatch(JSON.stringify(select), /reason|notes|metadata|members/);
      return data().filter(r => matches(r, where)).map(r => project(r, select));
    },
  };
}
const tx = {
  city: delegate("city", () => cities), mahalli: delegate("mahalli", () => mahallis), sector: delegate("sector", () => sectors),
  member: delegate("member", () => members),
  group: delegate("group", () => groups), attendanceSession: delegate("session", () => sessions),
  attendanceRecord: { findMany: async ({ where, select }: any) => records.filter(r => matches(r, where)).map(r => project(r, select)), groupBy: async (args: any) => {
    calls.push("aggregate");
    assert.deepEqual(args.by, ["sessionId", "status"]); assert.deepEqual(args._count, { _all: true });
    assert.equal(args.include, undefined); assert.equal(args.select, undefined);
    const result = new Map<string, any>();
    for (const record of records.filter(r => matches(r, args.where))) {
      const key = record.sessionId + record.status;
      const row = result.get(key) || { sessionId: record.sessionId, status: record.status, _count: { _all: 0 } };
      row._count._all++; result.set(key, row);
    }
    return [...result.values()];
  } },
};
const path = require.resolve("../src/lib/prisma"); require(path);
require.cache[path]!.exports = { prisma: { $transaction: async (fn: any, options: any) => { assert.equal(options.isolationLevel, "RepeatableRead"); return fn(tx); } } };
const { getHierarchicalAttendanceReport } = require("../src/lib/hierarchical-attendance-report") as typeof import("../src/lib/hierarchical-attendance-report");
const { getGroupAttendanceReport } = require("../src/lib/group-attendance-report");
const { getMemberAttendanceHistory } = require("../src/lib/member-attendance-history");
const report = (selection = {}) => getHierarchicalAttendanceReport(user, selection);
function attach() {
  for (const city of cities) city.mahallis = mahallis.filter(m => m.cityId === city.id);
  for (const mahalli of mahallis) {
    mahalli.sectors = sectors.filter(s => s.mahalliId === mahalli.id);
    mahalli.city = cities.find(city => city.id === mahalli.cityId);
  }
  for (const sector of sectors) { sector.mahalli = mahallis.find(m => m.id === sector.mahalliId); sector.groups = groups.filter(g => g.sectorId === sector.id); }
  for (const group of groups) group.sector = sectors.find(s => s.id === group.sectorId);
}
beforeEach(() => {
  user = { userId: "u1", name: "Admin", username: "admin", role: "SUPER_ADMIN", cityId: "c1", mahalliId: "h1", sectorId: "s1", sessionVersion: 0 };
  cities = [1, 2].map(i => ({ id: `c${i}`, name: `City ${i}` }));
  mahallis = [1, 2, 3].map(i => ({ id: `h${i}`, name: `Mahalli ${i}`, cityId: i === 3 ? "c2" : "c1" }));
  sectors = [1, 2, 3].map(i => ({ id: `s${i}`, name: `Sector ${i}`, mahalliId: `h${i}` }));
  groups = [1, 2, 3].map(i => ({ id: `g${i}`, name: `Group ${i}`, status: i === 1 ? "DELETED" : "ACTIVE", sectorId: `s${i}`, userGroups: i === 1 ? [{ userId: "u1" }] : [] }));
  attach();
  sessions = groups.map((group, i) => ({ id: `a${i+1}`, groupId: group.id, group }));
  records = sessions.flatMap((session, i) => Array.from({ length: i === 1 ? 9 : 1 }, () => ({ sessionId: session.id, session, status: i === 0 ? "HADIR" : "IZIN" })));
  members = [];
  calls = [];
});
test("city rows contain weighted totals, deleted groups, and no descendant tree", async () => {
  const result = await report();
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].percentage, 10); assert.equal(result.rows[0].totalMeetings, 2);
  assert.equal(result.rows[0].totalGroups, 2);
  assert.deepEqual(Object.keys(result.rows[0]).sort(), ["id", "name", "totalGroups", "totalMeetings", "counts", "totalRecorded", "percentage"].sort());
  assert.deepEqual(calls, ["city.many", "group.many", "session.many", "aggregate"]);
});
test("drill-down returns only immediate children and group report identities", async () => {
  assert.deepEqual((await report({ cityId: "c1" })).rows.map(r => r.id), ["h1", "h2"]);
  assert.deepEqual((await report({ cityId: "c1", mahalliId: "h1" })).rows.map(r => r.id), ["s1"]);
  assert.deepEqual((await report({ cityId: "c1", mahalliId: "h1", sectorId: "s1" })).rows.map(r => r.id), ["g1"]);
});
for (const role of ["CITY_ADMIN", "MAHALLI_ADMIN", "SECTOR_ADMIN", "MUSYRIF"] as const) {
  test(`${role}: scope limits ancestor totals and rejects another city before aggregation`, async () => {
    user.role = role;
    const result = await report();
    assert.deepEqual(result.rows.map(r => r.id), ["c1"]);
    assert.equal(result.rows[0].totalGroups, role === "CITY_ADMIN" ? 2 : 1);
    calls = [];
    await assert.rejects(report({ cityId: "c2" }));
    assert.deepEqual(calls, ["city.first"]);
  });
}
test("assigned MUSYRIF follows assignments outside their own sector", async () => {
  user.role = "MUSYRIF"; groups[0].userGroups = []; groups[2].userGroups = [{ userId: "u1" }];
  assert.deepEqual((await report()).rows.map(r => r.id), ["c2"]);
});
test("empty groups and empty authorized cities remain visible", async () => {
  records = []; sessions = []; cities.push({ id: "empty", name: "Empty", mahallis: [] });
  const result = await report();
  assert.equal(result.rows.length, 3); assert.equal(result.rows[0].percentage, null);
  assert.equal(result.rows[2].totalGroups, 0); assert.equal(result.rows[2].totalMeetings, 0);
});
test("transfers attribute all history exactly once to the current hierarchy", async () => {
  groups[0].sectorId = "s3"; attach();
  const result = await report();
  assert.equal(result.rows[0].counts.HADIR, 0); assert.equal(result.rows[1].counts.HADIR, 1);
  assert.equal(result.rows.reduce((n, r) => n + r.totalRecorded, 0), 11);
});
test("inconsistent ancestry and malformed selections fail before aggregation", async () => {
  await assert.rejects(report({ cityId: "c1", mahalliId: "h3" }));
  assert.equal(calls.includes("aggregate"), false);
  calls = []; await assert.rejects(report({ sectorId: "s1" })); assert.deepEqual(calls, []);
});
test("unscoped administrators fail closed", async () => {
  user.role = "CITY_ADMIN"; user.cityId = null;
  assert.deepEqual((await report()).rows, []);
});
test("bulk query count is independent of group and session count", async () => {
  for (let i = 4; i < 104; i++) {
    const group = { id: `g${i}`, name: "Group", sectorId: "s1", status: "INACTIVE", userGroups: [] };
    groups.push(group); sessions.push({ id: `a${i}`, groupId: group.id, group });
  }
  attach(); await report();
  assert.deepEqual(calls, ["city.many", "group.many", "session.many", "aggregate"]);
});

test("same period reconciles member, group, and hierarchy totals including inactive and deleted history", async () => {
  const group = groups[0]; // DELETED, still readable.
  members = ["m1", "m2"].map((id, i) => ({ id, name: id, isActive: i === 0, groupId: group.id, group }));
  sessions = ["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17"].map((date, i) => ({ id: `a${i}`, meetingNumber: i, groupId: group.id, group, date: new Date(`${date}T00:00:00Z`) }));
  records = [
    { id: "before", memberId: "m1", sessionId: "a0", session: sessions[0], status: "ALPA" },
    { id: "r1", memberId: "m1", sessionId: "a1", session: sessions[1], status: "HADIR" },
    { id: "r2", memberId: "m2", sessionId: "a1", session: sessions[1], status: "IZIN" },
    { id: "r3", memberId: "m2", sessionId: "a2", session: sessions[2], status: "SAKIT" },
    { id: "after", memberId: "m1", sessionId: "a3", session: sessions[3], status: "ALPA" },
  ];
  const period = { from: "2026-09-15", to: "2026-09-16" };
  const groupReport = await getGroupAttendanceReport(user, "g1", period);
  const memberReports = await Promise.all(members.map(m => getMemberAttendanceHistory(user, "g1", m.id, period)));
  const combined = { HADIR: 0, IZIN: 0, SAKIT: 0, ALPA: 0 };
  for (const memberReport of memberReports) for (const status of Object.keys(combined) as (keyof typeof combined)[]) combined[status] += memberReport.summary.counts[status];
  assert.deepEqual(combined, { HADIR: 1, IZIN: 1, SAKIT: 1, ALPA: 0 });
  assert.deepEqual(groupReport.counts, combined);
  assert.equal(groupReport.totalMeetings, 2);
  assert.equal(groupReport.percentage, 1 / 3 * 100);
  const hierarchy = await report(period);
  assert.deepEqual(hierarchy.rows[0].counts, combined);
  for (const result of [groupReport, ...memberReports, hierarchy]) {
    assert.equal(result.context.denominator, "RECORDED_ENTRIES");
    assert.equal(result.context.attribution, "CURRENT_HIERARCHY");
    assert.deepEqual(result.context.period, period);
    assert.ok(Number.isFinite(Date.parse(result.context.generatedAt)));
  }
  // Moving the group moves its whole recorded history, without changing member/group totals.
  group.sectorId = "s3"; attach();
  const transferred = await report(period);
  assert.equal(transferred.rows[0].totalRecorded, 0);
  assert.deepEqual(transferred.rows[1].counts, combined);
  assert.deepEqual((await getGroupAttendanceReport(user, "g1", period)).counts, combined);
  assert.deepEqual((await getMemberAttendanceHistory(user, "g1", "m2", period)).summary.counts, memberReports[1].summary.counts);
});
