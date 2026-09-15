import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
let version: number;
let rows: { memberId: string; status: string; reason: string | null }[];
let logs: any[];
let failLog: boolean;
let failWrite: boolean;
let allowed: boolean;
let sessionExists: boolean;
let memberExists: boolean;
let writes: number;
const tx = {
  attendanceSession: {
    findFirst: async () => sessionExists ? { meetingNumber: 1, group: { id: "g1", name: "Group", sectorId: "s1", userGroups: allowed ? [{ userId: "u1" }] : [] } } : null,
    updateMany: async ({ where }: any) => ({ count: where.attendanceVersion === version ? 1 : 0 }),
    findUnique: async () => ({ attendanceVersion: version }),
    update: async ({ data }: any) => { version = data.attendanceVersion; },
  },
  member: { findMany: async ({ where }: any) => memberExists ? where.id.in.map((id: string) => ({ id })) : [] },
  attendanceRecord: {
    findMany: async () => structuredClone(rows),
    upsert: async ({ create, update }: any) => {
      writes++;
      if (failWrite) throw new Error("test write failed");
      const found = rows.find((row) => row.memberId === create.memberId);
      if (found) Object.assign(found, update); else rows.push({ memberId: create.memberId, status: create.status, reason: create.reason });
    },
  },
  activityLog: { create: async ({ data }: any) => { if (failLog) throw new Error("test log failed"); logs.push(data); } },
};
const prismaPath = require.resolve("../src/lib/prisma");
require(prismaPath);
require.cache[prismaPath]!.exports = { prisma: { $transaction: async (fn: any) => {
  const snapshot = structuredClone({ version, rows, logs });
  try { return await fn(tx); } catch (error) { ({ version, rows, logs } = snapshot); throw error; }
} } };
const authPath = require.resolve("../src/lib/auth");
require(authPath);
require.cache[authPath]!.exports = { requireAuth: async () => ({ userId: "u1", role: "MUSYRIF" }) };
const { PATCH } = require("../src/app/api/groups/[id]/sessions/[sessionId]/attendance/route") as typeof import("../src/app/api/groups/[id]/sessions/[sessionId]/attendance/route");
beforeEach(() => { version = 0; rows = []; logs = []; writes = 0; failLog = false; failWrite = false; allowed = true; sessionExists = true; memberExists = true; });
const save = (expectedVersion: number, records = [{ memberId: "m1", status: "HADIR", reason: "" }]) => PATCH(new Request("http://localhost/api/groups/g1/sessions/a1/attendance", { method: "PATCH", body: JSON.stringify({ expectedVersion, records }) }), { params: Promise.resolve({ id: "g1", sessionId: "a1" }) });

test("changed batch increments version once and records only actual changes without reason text", async () => {
  rows = [{ memberId: "m1", status: "HADIR", reason: null }];
  const result = await save(0, [{ memberId: "m1", status: "HADIR", reason: "" }, { memberId: "m2", status: "IZIN", reason: "private reason" }]);
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { success: true, attendanceVersion: 1, changedCount: 1 });
  assert.equal(writes, 1); assert.equal(logs.length, 1);
  assert.deepEqual(logs[0].metadata.changes, [{ memberId: "m2", before: null, after: { status: "IZIN" }, reasonChanged: true }]);
  assert.equal(JSON.stringify(logs).includes("private reason"), false);
});
test("stale batch returns structured conflict without writes or logs", async () => {
  version = 2;
  const result = await save(1);
  assert.equal(result.status, 409);
  const body = await result.json();
  assert.equal(body.code, "ATTENDANCE_VERSION_CONFLICT"); assert.equal(body.expectedVersion, 1); assert.equal(body.currentVersion, 2);
  assert.equal(writes, 0); assert.equal(logs.length, 0); assert.equal(version, 2);
});
test("identical submission is a no-op and stale identical submission still conflicts", async () => {
  rows = [{ memberId: "m1", status: "HADIR", reason: null }];
  assert.equal((await save(0)).status, 200);
  assert.equal(version, 0); assert.equal(writes, 0); assert.equal(logs.length, 0);
  version = 1;
  assert.equal((await save(0)).status, 409);
});
test("reason-only changes and clearing reasons are traced without storing old or new text", async () => {
  rows = [{ memberId: "m1", status: "HADIR", reason: "old secret" }];
  assert.equal((await save(0, [{ memberId: "m1", status: "HADIR", reason: "new secret" }])).status, 200);
  assert.equal((await save(1)).status, 200);
  assert.equal(version, 2); assert.equal(logs.length, 2);
  for (const log of logs) {
    assert.equal(log.metadata.changes[0].reasonChanged, true);
    assert.equal(JSON.stringify(log).includes("secret"), false);
  }
});
test("old version cannot overwrite a successful batch", async () => {
  assert.equal((await save(0)).status, 200);
  assert.equal((await save(0, [{ memberId: "m1", status: "ALPA", reason: "Missing" }])).status, 409);
  assert.equal(rows[0].status, "HADIR"); assert.equal(logs.length, 1);
});
test("route propagates transaction failures and mock transaction restores data", async () => {
  failLog = true;
  assert.notEqual((await save(0)).status, 200);
  assert.equal(version, 0); assert.deepEqual(rows, []); assert.deepEqual(logs, []);
  failLog = false; failWrite = true;
  assert.notEqual((await save(0)).status, 200);
  assert.equal(version, 0); assert.deepEqual(rows, []);
});
test("authorization and group membership failures happen before writes", async () => {
  allowed = false; assert.equal((await save(0)).status, 403);
  allowed = true; memberExists = false; assert.equal((await save(0)).status, 400);
  memberExists = true; sessionExists = false; assert.equal((await save(0)).status, 404);
  assert.equal(writes, 0); assert.equal(logs.length, 0); assert.equal(version, 0);
});
