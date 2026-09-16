import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { createRequire } from "node:module";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { summarizeAttendance } from "../src/lib/attendance-summary";
import type { AttendanceStatus } from "@prisma/client";

test("empty attendance has zero counts and no percentage", () => {
  assert.deepEqual(summarizeAttendance([]), { totalRecorded: 0, counts: { HADIR: 0, IZIN: 0, SAKIT: 0, ALPA: 0 }, percentage: null });
});
test("all status combinations count only recorded entries", () => {
  const statuses: AttendanceStatus[] = ["HADIR", "IZIN", "SAKIT", "ALPA"];
  for (let mask = 1; mask < 16; mask++) {
    const records = statuses.filter((_, i) => mask & (1 << i)).map(status => ({ status }));
    const summary = summarizeAttendance(records);
    assert.equal(summary.totalRecorded, records.length);
    statuses.forEach(status => assert.equal(summary.counts[status], records.some(r => r.status === status) ? 1 : 0));
    assert.equal(summary.percentage, summary.counts.HADIR / records.length * 100);
  }
});
test("percentage weights entries and retains precision", () => {
  const summary = summarizeAttendance([{ status: "HADIR" }, { status: "HADIR" }, { status: "IZIN" }]);
  assert.equal(summary.percentage, 2 / 3 * 100);
  assert.equal(summary.counts.ALPA, 0);
});

(globalThis as typeof globalThis & { React: typeof React }).React = React;
const require = createRequire(import.meta.url);
let user: any;
let status: string;
let records: { status: AttendanceStatus }[];
let queries: number;
let missing: boolean;
const prismaPath = require.resolve("../src/lib/prisma"); require(prismaPath);
require.cache[prismaPath]!.exports = { prisma: {
  attendanceSession: { findFirst: async ({ where }: any) => {
    assert.deepEqual(where, { id: "a1", groupId: "g1" });
    if (missing) return null;
    return { id: "a1", meetingNumber: 1, attendanceVersion: 0, date: new Date("2026-09-16"), records: [], group: {
      id: "g1", name: "Group", status, sectorId: "s1", members: [], userGroups: [{ userId: "u1" }],
      sector: { name: "Sector", mahalliId: "h1", mahalli: { name: "Mahalli", cityId: "c1", city: { name: "City" } } },
    } };
  } },
  attendanceRecord: { findMany: async (args: any) => {
    queries++;
    assert.deepEqual(args, { where: { sessionId: "a1", session: { groupId: "g1" } }, select: { status: true } });
    return records;
  } },
} };
const authPath = require.resolve("../src/lib/auth"); require(authPath);
require.cache[authPath]!.exports = { getSession: async () => user };
const formPath = require.resolve("../src/components/attendance-form"); require(formPath);
require.cache[formPath]!.exports = { AttendanceForm: () => null };
const Page = require("../src/app/dashboard/groups/[id]/sessions/[sessionId]/page").default;
const page = () => Page({ params: Promise.resolve({ id: "g1", sessionId: "a1" }) });
beforeEach(() => {
  user = { userId: "u1", role: "SUPER_ADMIN", cityId: "c1", mahalliId: "h1", sectorId: "s1" };
  status = "ACTIVE"; queries = 0; records = []; missing = false;
});
test("empty summary renders Indonesian empty state", async () => {
  assert.match(renderToStaticMarkup(await page()), /Belum ada data/);
  assert.equal(queries, 1);
});
for (const role of ["SUPER_ADMIN", "CITY_ADMIN", "MAHALLI_ADMIN", "SECTOR_ADMIN", "MUSYRIF"]) {
  test(`${role} can read deleted group historical summary`, async () => {
    user.role = role; status = "DELETED";
    records = [{ status: "HADIR" }, { status: "IZIN" }, { status: "SAKIT" }];
    assert.match(renderToStaticMarkup(await page()), /33,33%/);
    assert.equal(queries, 1);
  });
}
for (const role of ["CITY_ADMIN", "MAHALLI_ADMIN", "SECTOR_ADMIN", "MUSYRIF"]) {
  test(`${role} outside scope cannot query summary`, async () => {
    user = { role, userId: "other", cityId: "other", mahalliId: "other", sectorId: "other" };
    await assert.rejects(page());
    assert.equal(queries, 0);
  });
}
test("missing or mismatched session cannot query summary", async () => {
  missing = true;
  await assert.rejects(page());
  assert.equal(queries, 0);
});
test("unauthenticated request cannot query summary", async () => {
  user = null;
  await assert.rejects(page());
  assert.equal(queries, 0);
});
