import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { createRequire } from "node:module";
import { assertGroupAccess, assertMeetingAccess, assertGroupMutable } from "../src/lib/authorization";
import type { SessionUser } from "../src/lib/types";
import type { GroupStatus } from "@prisma/client";
const require = createRequire(import.meta.url);
let status: GroupStatus;
let user: SessionUser;
let mutations: string[];
const group = () => ({ id: "g1", name: "Group", status, sectorId: "s1", sector: { mahalliId: "h1", mahalli: { cityId: "c1" } }, userGroups: [{ userId: "u1" }], assignmentHistory: [{ id: "history1" }] });
const write = (name: string) => async ({ data }: any = {}) => { mutations.push(name); return { id: "result", ...data }; };
const db = {
  group: { findUnique: async () => group(), update: write("group") },
  member: { findUnique: async () => ({ id: "m1", name: "Member", group: group() }), findMany: async () => [{ id: "m1" }], create: write("member.create"), update: write("member.update") },
  user: { findUnique: async () => ({ id: "musyrif", name: "Musyrif", role: "MUSYRIF", isActive: true, sectorId: "s1" }) },
  userGroup: { findFirst: async () => ({ id: "assignment", userId: "musyrif" }), create: write("assignment.create"), delete: write("assignment.delete") },
  groupAssignmentHistory: { create: write("history") },
  attendanceSession: { findFirst: async () => ({ id: "a1", meetingNumber: 1, group: group() }), create: write("session.create"), updateMany: async () => { mutations.push("session.lock"); return { count: 1 }; }, update: write("session.update") },
  attendanceRecord: { findMany: async () => [], upsert: write("record") },
  activityLog: { create: write("log") },
};
const prismaPath = require.resolve("../src/lib/prisma"); require(prismaPath);
require.cache[prismaPath]!.exports = { prisma: { ...db, $transaction: async (fn: any) => fn(db) } };
const authPath = require.resolve("../src/lib/auth"); require(authPath);
require.cache[authPath]!.exports = { requireAuth: async () => user };
const groupRoute = require("../src/app/api/groups/[id]/route");
const sessions = require("../src/app/api/groups/[id]/sessions/route");
const attendance = require("../src/app/api/groups/[id]/sessions/[sessionId]/attendance/route");
const members = require("../src/app/api/groups/[id]/members/route");
const member = require("../src/app/api/members/[id]/route");
const assignment = require("../src/app/api/groups/[id]/assignment/route");
const cases = [
  { name: "group PATCH", handler: groupRoute.PATCH, method: "PATCH", body: { name: "Changed" } },
  { name: "session POST", handler: sessions.POST, method: "POST", body: { meetingNumber: 1, date: "2026-09-15" }, musyrif: true },
  { name: "attendance PATCH", handler: attendance.PATCH, method: "PATCH", body: { expectedVersion: 0, records: [{ memberId: "m1", status: "HADIR" }] }, musyrif: true },
  { name: "member POST", handler: members.POST, method: "POST", body: { name: "Member" } },
  { name: "member PATCH", handler: member.PATCH, method: "PATCH", body: { name: "Member" } },
  { name: "member DELETE", handler: member.DELETE, method: "DELETE" },
  { name: "assignment POST", handler: assignment.POST, method: "POST", body: { musyrifId: "musyrif" } },
  { name: "assignment DELETE", handler: assignment.DELETE, method: "DELETE" },
];
beforeEach(() => { status = "ACTIVE"; mutations = []; user = { userId: "u1", username: "tester", name: "Tester", role: "SUPER_ADMIN", cityId: "c1", mahalliId: "h1", sectorId: "s1", sessionVersion: 0 }; });
const call = (item: typeof cases[number]) => item.handler(new Request("http://localhost/api/test", { method: item.method, body: item.body ? JSON.stringify(item.body) : undefined }), { params: Promise.resolve({ id: "g1", sessionId: "a1" }) });
for (const item of cases) {
  for (const state of ["ACTIVE", "INACTIVE"] as const) {
    test(`${item.name}: ${state} still permits authorized mutation`, async () => {
      status = state;
      const response = await call(item);
      assert.ok(response.ok, await response.text());
      assert.ok(mutations.includes("log"));
    });
  }
  test(`${item.name}: DELETED rejects authorized roles before any data or log mutation`, async () => {
    status = "DELETED";
    const roles: SessionUser["role"][] = ["SUPER_ADMIN", "CITY_ADMIN", "MAHALLI_ADMIN", "SECTOR_ADMIN", ...(item.musyrif ? ["MUSYRIF" as const] : [])];
    for (const role of roles) {
      user.role = role;
      const response = await call(item);
      assert.equal(response.status, 409, role);
      assert.deepEqual(await response.json(), { error: "Kelompok telah dihapus dan tidak dapat diubah.", code: "GROUP_DELETED" });
      assert.deepEqual(mutations, []);
    }
  });
  test(`${item.name}: out-of-scope users cannot learn deleted state`, async () => {
    status = "DELETED"; user.role = "CITY_ADMIN"; user.cityId = "other";
    const response = await call(item);
    assert.ok([403, 404].includes(response.status));
    assert.deepEqual(mutations, []);
  });
}
test("authorized users can still read deleted group history and pass meeting read authorization", async () => {
  status = "DELETED";
  for (const role of ["SUPER_ADMIN", "CITY_ADMIN", "MAHALLI_ADMIN", "SECTOR_ADMIN", "MUSYRIF"] as const) {
    user.role = role;
    assert.doesNotThrow(() => assertGroupAccess(user, group()));
    assert.doesNotThrow(() => assertMeetingAccess(user, group()));
    const response = await groupRoute.GET(new Request("http://localhost/api/groups/g1"), { params: Promise.resolve({ id: "g1" }) });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).group.assignmentHistory[0].id, "history1");
  }
  assert.deepEqual(mutations, []);
});
test("mutability guard only rejects DELETED", () => {
  assert.doesNotThrow(() => assertGroupMutable({ status: "ACTIVE" }));
  assert.doesNotThrow(() => assertGroupMutable({ status: "INACTIVE" }));
  assert.throws(() => assertGroupMutable({ status: "DELETED" }));
});
