import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
(globalThis as any).React = require("react");
let user: any, group: any, candidateQuery: any, groupQuery: any;
const prismaPath = require.resolve("../src/lib/prisma"); require(prismaPath);
require.cache[prismaPath]!.exports = { prisma: {
  group: { findUnique: async (args: any) => { groupQuery = args; return group; } },
  user: { findMany: async (args: any) => { candidateQuery = args; return []; } },
} };
const authPath = require.resolve("../src/lib/auth"); require(authPath);
require.cache[authPath]!.exports = { getSession: async () => user };
const reportPath = require.resolve("../src/lib/group-attendance-report"); require(reportPath);
require.cache[reportPath]!.exports = { getGroupAttendanceReport: async () => ({ filters: {}, meetings: [] }) };
const Page = require("../src/app/dashboard/groups/[id]/page").default;
const page = (query = {}) => Page({ params: Promise.resolve({ id: "g1" }), searchParams: Promise.resolve(query) });
beforeEach(() => {
  candidateQuery = undefined;
  user = { userId: "u1", role: "MAHALLI_ADMIN", cityId: "c1", mahalliId: "h1", sectorId: "s1" };
  group = { id: "g1", status: "ACTIVE", sectorId: "s1", sector: { mahalliId: "h1", mahalli: { cityId: "c1" } }, assignments: [{ id: "t1", musyrifId: "u1", endedAt: null }] };
});
for (const role of ["MAHALLI_ADMIN", "SECTOR_ADMIN", "SUPER_ADMIN"]) {
  test(`${role} picker requests active city Musyrifs without lower scope restrictions`, async () => {
    user.role = role; await page();
    assert.deepEqual(candidateQuery.where, { role: "MUSYRIF", isActive: true, cityId: "c1" });
    assert.ok(groupQuery.include.assignments);
  });
}
test("active Musyrif reads full group history even with obsolete history query parameter", async () => {
  user.role = "MUSYRIF";
  const tree = await page({ history: "1" });
  const where = groupQuery.include.attendanceSessions.where;
  assert.equal(where.assignment, undefined);
  assert.deepEqual(where.group.assignments.some, { musyrifId: "u1", endedAt: null });
  assert.equal(candidateQuery, undefined);
  assert.equal(tree.props.canCreateMeeting, true);
  assert.equal(tree.props.canManage, false);
  assert.equal(tree.props.history, undefined);
});
test("former Musyrif direct group URL is rejected including obsolete history mode", async () => {
  user.role = "MUSYRIF";
  group.assignments[0].endedAt = new Date();
  for (const query of [{}, { history: "1" }]) await assert.rejects(page(query));
  assert.equal(candidateQuery, undefined);
});

test("outside-scope admin cannot query assignment candidates", async () => {
  user.mahalliId = "outside";
  await assert.rejects(page());
  assert.equal(candidateQuery, undefined);
});
