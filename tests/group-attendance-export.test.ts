import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { createRequire } from "node:module";
import { createCsv, csvFilename } from "../src/lib/csv";
import { getSessionAccessWhere } from "../src/lib/authorization";
import { getReportDateFilter } from "../src/lib/report-date-filter";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GroupAttendanceDashboard } from "../src/components/group-attendance-dashboard";
(globalThis as any).React = React;
const require = createRequire(import.meta.url);
let user: any, group: any, sessions: any[], records: any[], calls: string[], selections: any[];
const within = (session: any, where: any) => session.groupId === where.groupId && (!where.date.gte || session.date >= where.date.gte) && (!where.date.lt || session.date < where.date.lt);
function check(where: any) {
  assert.deepEqual(where.group, getSessionAccessWhere(user).group);
  assert.equal(where.assignment, undefined, "predecessor sessions must remain visible");
}
const path = require.resolve("../src/lib/prisma"); require(path);
require.cache[path]!.exports = { prisma: { $transaction: async (fn: any, options: any) => {
  assert.equal(options.isolationLevel, "RepeatableRead");
  return fn({
    group: { findUnique: async () => { calls.push("group"); return group; } },
    attendanceSession: { findMany: async ({ where, select }: any) => {
      calls.push("sessions"); check(where); selections.push(select);
      assert.deepEqual(select.records, { select: { status: true } });
      return sessions.filter(s => within(s, where)).map(s => ({ ...s, records: records.filter(r => r.session === s) }));
    } },
    attendanceRecord: { findMany: async ({ where, select }: any) => {
      calls.push("records"); check(where.session); selections.push(select);
      assert.equal(where.member, undefined, "inactive members stay included");
      return records.filter(r => within(r.session, where.session));
    } },
  });
} } };
const auth = require.resolve("../src/lib/auth"); require(auth);
require.cache[auth]!.exports = { requireAuth: async () => { if (!user) throw new Error("Sesi tidak valid."); return user; } };
const { GET } = require("../src/app/api/groups/[id]/attendance-export/route");
const call = (query = "format=summary") => GET(new Request(`http://localhost/api/groups/g1/attendance-export?${query}`), { params: Promise.resolve({ id: "g1" }) });
beforeEach(() => {
  user = { userId: "current", role: "MUSYRIF", cityId: "c1", mahalliId: "h1", sectorId: "s1" };
  group = { id: "g1", name: "Kelompok Éka", status: "DELETED", sectorId: "s1", sector: { mahalliId: "h1", mahalli: { cityId: "c1" } }, assignments: [{ id: "old", musyrifId: "former", endedAt: new Date() }, { id: "new", musyrifId: "current", endedAt: null }] };
  sessions = ["2026-09-24", "2026-09-25", "2026-09-26"].map((date, i) => ({ id: `a${i}`, groupId: "g1", meetingNumber: i+1, date: new Date(`${date}T00:00:00Z`), notes: 'Materi, "satu"\nDua', assignment: { musyrif: { name: i ? "Current" : "Predecessor" } } }));
  records = [{ session: sessions[0], member: { name: "Inactive member", isActive: false }, status: "HADIR", reason: null }, { session: sessions[1], member: { name: "Active member" }, status: "IZIN", reason: 'Alasan, "penting"\nLanjutan' }];
  calls = []; selections = [];
});
for (const format of ["summary", "detail"]) {
  test(`${format}: active Musyrif exports predecessor and deleted-group history`, async () => {
    const response = await call(`format=${format}`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type")!, /text\/csv; charset=utf-8/);
    assert.match(response.headers.get("content-disposition")!, /Kelompok%20%C3%89ka/);
    assert.match(response.headers.get("content-disposition")!, /semua-tanggal/);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    const bytes = new Uint8Array(await response.arrayBuffer()); assert.deepEqual([...bytes.slice(0, 3)], [239, 187, 191]);
    const csv = new TextDecoder().decode(bytes);
    assert.match(csv, /Predecessor/); assert.doesNotMatch(csv, /"ALPA"/);
    if (format === "detail") { assert.match(csv, /Inactive member/); assert.doesNotMatch(csv, /2026-09-26/); }
    else { assert.match(csv, /100%/); assert.match(csv, /Belum ada data/); }
    assert.deepEqual(calls, ["group", format === "summary" ? "sessions" : "records"]);
    assert.doesNotMatch(JSON.stringify(selections), /metadata/);
  });
  test(`${format}: former Musyrif denied before attendance query`, async () => {
    user.userId = "former";
    assert.equal((await call(`format=${format}`)).status, 403); assert.deepEqual(calls, ["group"]);
  });
  test(`${format}: UTC inclusive filter matches shared report boundaries`, async () => {
    const response = await call(`format=${format}&from=2026-09-25&to=2026-09-25`);
    const csv = await response.text();
    assert.match(csv, /2026-09-25/); assert.doesNotMatch(csv, /2026-09-24|2026-09-26/);
    const { date } = getReportDateFilter({ from: "2026-09-25", to: "2026-09-25" });
    assert.deepEqual(sessions.filter(s => within(s, { groupId: "g1", date })).map(s => s.meetingNumber), [2]);
    assert.match(response.headers.get("content-disposition")!, /2026-09-25_2026-09-25/);
  });
}
for (const role of ["SUPER_ADMIN", "CITY_ADMIN", "MAHALLI_ADMIN", "SECTOR_ADMIN"]) {
  test(`${role}: scoped admin may export`, async () => { user.role = role; assert.equal((await call()).status, 200); });
  if (role !== "SUPER_ADMIN") test(`${role}: outside scope denied before querying attendance`, async () => {
    user = { ...user, role, cityId: "other", mahalliId: "other", sectorId: "other" };
    assert.equal((await call("format=detail")).status, 403); assert.deepEqual(calls, ["group"]);
  });
}
test("invalid and repeated filters rejected, missing group and unauthenticated requests rejected", async () => {
  for (const query of ["format=invalid", "format=summary&from=no", "format=detail&from=2026-09-25&from=2026-09-24", "format=summary&from=2026-09-26&to=2026-09-25"]) {
    assert.equal((await call(query)).status, 400); assert.deepEqual(calls, []);
  }
  user = null; assert.notEqual((await call()).status, 200); assert.deepEqual(calls, []);
  user = { role: "SUPER_ADMIN" }; group = null; assert.equal((await call()).status, 404);
});
test("CSV handles quotes, commas, multiline text and neutralizes spreadsheet formulas", () => {
  assert.equal(createCsv([['a,b', 'say "yes"', 'line1\r\nline2', null, 12]]), '\uFEFF"a,b","say ""yes""","line1\r\nline2","","12"\r\n');
  for (const value of ["=1+1", "+SUM(A1)", "-1+2", "@SUM(A1)", "\t=1+1"]) assert.ok(createCsv([[value]]).startsWith('\uFEFF"\''));
  assert.doesNotMatch(csvFilename('Group\r\n"/bad', "detail", {}), /[\r\n"/]/);
});
test("export control submits live date inputs with selected format to authorized endpoint", () => {
  const html = renderToStaticMarkup(React.createElement(GroupAttendanceDashboard, { groupId: "g1", report: null }));
  assert.match(html, /name="from"/); assert.match(html, /name="to"/);
  assert.match(html, /name="format"/); assert.match(html, /value="summary"/); assert.match(html, /value="detail"/);
  assert.match(html, /formAction="\/api\/groups\/g1\/attendance-export"/);
});
