import { getSessionAccessWhere } from "../src/lib/authorization";
import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { createRequire } from "node:module";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

(globalThis as typeof globalThis & { React: typeof React }).React = React;
const require = createRequire(import.meta.url);
let user: any;
let member: any;
let records: any[];
let calls: string[];
const tx = {
  member: { findFirst: async (args: any) => {
    calls.push("member");
    assert.ok(args.select); assert.equal(args.include, undefined);
    assert.equal(JSON.stringify(args.select).includes("attendanceRecords"), false);
    return args.where.id === "m1" && args.where.groupId === "g1" ? member : null;
  } },
  attendanceRecord: { findMany: async (args: any) => {
    calls.push("records");
    assert.deepEqual(args, {
      where: { memberId: "m1", session: { groupId: "g1", ...getSessionAccessWhere(user) } },
      select: { id: true, status: true, session: { select: { meetingNumber: true, date: true } } },
      orderBy: [{ session: { date: "desc" } }, { id: "desc" }],
    });
    return records;
  } },
};
const prismaPath = require.resolve("../src/lib/prisma"); require(prismaPath);
require.cache[prismaPath]!.exports = { prisma: { $transaction: async (fn: any, options: any) => {
  assert.equal(options.isolationLevel, "RepeatableRead"); return fn(tx);
} } };
const authPath = require.resolve("../src/lib/auth"); require(authPath);
require.cache[authPath]!.exports = { getSession: async () => user };
const { getMemberAttendanceHistory } = require("../src/lib/member-attendance-history");
const Page = require("../src/app/dashboard/groups/[id]/members/[memberId]/page").default;
const history = (groupId = "g1", memberId = "m1") => getMemberAttendanceHistory(user, groupId, memberId);
const page = () => Page({ params: Promise.resolve({ id: "g1", memberId: "m1" }) });
beforeEach(() => {
  user = { userId: "u1", role: "SUPER_ADMIN", cityId: "c1", mahalliId: "h1", sectorId: "s1" };
  member = { id: "m1", name: "Member", isActive: true, group: {
    id: "g1", name: "Group", status: "ACTIVE", sectorId: "s1", assignments: [{ id: "t1", musyrifId: "u1", endedAt: null }],
    sector: { name: "Sector", mahalliId: "h1", mahalli: { name: "Mahalli", cityId: "c1", city: { name: "City" } } },
  } };
  records = ["HADIR", "IZIN", "SAKIT", "ALPA"].map((status, i) => ({ id: String(i), status, session: { meetingNumber: 4-i, date: new Date(`2026-09-${20-i}`) } }));
  calls = [];
});
for (const active of [true, false]) {
  test(`${active ? "active" : "inactive"} member retains all statuses and recorded-only percentage`, async () => {
    member.isActive = active;
    const result = await history();
    assert.equal(result.summary.totalRecorded, 4);
    assert.equal(result.summary.percentage, 25);
    assert.deepEqual(result.summary.counts, { HADIR: 1, IZIN: 1, SAKIT: 1, ALPA: 1 });
    assert.equal(result.records.length, 4);
    assert.deepEqual(calls, ["member", "records"]);
  });
}
for (const role of ["SUPER_ADMIN", "CITY_ADMIN", "MAHALLI_ADMIN", "SECTOR_ADMIN", "MUSYRIF"]) {
  test(`${role} can read deleted group history`, async () => {
    user.role = role; member.group.status = "DELETED";
    assert.equal((await history()).summary.totalRecorded, 4);
  });
}
for (const role of ["CITY_ADMIN", "MAHALLI_ADMIN", "SECTOR_ADMIN", "MUSYRIF"]) {
  test(`${role} outside scope fails before records query`, async () => {
    user = { role, userId: "other", cityId: "other", mahalliId: "other", sectorId: "other" };
    await assert.rejects(history()); assert.deepEqual(calls, ["member"]);
  });
}
test("wrong group/member combinations return no history", async () => {
  assert.equal(await history("other"), null);
  assert.equal(await history("g1", "other"), null);
  assert.deepEqual(calls, ["member", "member"]);
});
test("empty history renders Indonesian empty state without mutation controls", async () => {
  records = []; member.isActive = false;
  const html = renderToStaticMarkup(await page());
  assert.match(html, /Belum ada data/); assert.match(html, /Nonaktif/);
  assert.doesNotMatch(html, /<form|<button|<input|<textarea|<select/);
});
test("page shows all statuses, percentage and newest first history", async () => {
  const html = renderToStaticMarkup(await page());
  assert.match(html, /25%/);
  for (const status of ["HADIR", "IZIN", "SAKIT", "ALPA"]) assert.match(html, new RegExp(status));
  assert.ok(html.indexOf("20 Sep") < html.indexOf("17 Sep"));
});
test("authentication precedes database reads", async () => {
  user = null; await assert.rejects(page()); assert.deepEqual(calls, []);
});
test("query count is independent of history size and selections omit private fields", async () => {
  records = Array.from({ length: 500 }, (_, i) => ({ id: String(i), status: "HADIR", session: { meetingNumber: i, date: new Date() } }));
  assert.equal((await history()).summary.totalRecorded, 500);
  assert.deepEqual(calls, ["member", "records"]);
});
