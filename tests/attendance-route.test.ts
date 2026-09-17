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
let writeQueries: number;
let events: string[];
let groupStatus: string;
let cityId: string;
let user: any;
let onLock: (() => void) | undefined;
let onCommit: (() => void) | undefined;
const tx = {
  $queryRaw: async (_sql: any, id: string) => { assert.equal(id, "g1"); events.push("group.lock"); onLock?.(); return []; },
  attendanceSession: {
    findFirst: async () => { events.push("session.read"); assert.equal(events.at(-2), "group.lock"); return sessionExists ? { meetingNumber: 1, group: { id: "g1", name: "Group", status: groupStatus, sectorId: "s1", sector: { mahalliId: "h1", mahalli: { cityId } }, userGroups: allowed ? [{ userId: "u1" }] : [] } } : null; },
    updateMany: async ({ where }: any) => { events.push("session.lock"); assert.ok(events.indexOf("group.lock") < events.indexOf("session.lock")); return { count: where.attendanceVersion === version ? 1 : 0 }; },
    findUnique: async () => ({ attendanceVersion: version }),
    update: async ({ data }: any) => { version = data.attendanceVersion; },
  },
  member: { findMany: async ({ where }: any) => memberExists ? where.id.in.map((id: string) => ({ id })) : [] },
  attendanceRecord: {
    findMany: async ({ where }: any) => {
      assert.equal(where.sessionId, "a1");
      assert.ok(Array.isArray(where.memberId.in));
      return structuredClone(rows.filter(row => where.memberId.in.includes(row.memberId)));
    },
    createMany: async ({ data }: any) => {
      writeQueries++;
      if (failWrite) throw new Error("test write failed");
      for (const record of data) {
        assert.equal(record.sessionId, "a1");
        assert.ok(!rows.some(row => row.memberId === record.memberId));
        rows.push({ memberId: record.memberId, status: record.status, reason: record.reason });
        writes++;
      }
      return { count: data.length };
    },
    updateMany: async ({ where, data }: any) => {
      writeQueries++;
      if (failWrite) throw new Error("test write failed");
      assert.equal(where.sessionId, "a1");
      const matching = rows.filter(row => where.memberId.in.includes(row.memberId));
      for (const row of matching) { Object.assign(row, data); writes++; }
      return { count: matching.length };
    },
  },
  activityLog: { create: async ({ data }: any) => { if (failLog) throw new Error("test log failed"); logs.push(data); } },
};
const prismaPath = require.resolve("../src/lib/prisma");
require(prismaPath);
require.cache[prismaPath]!.exports = { prisma: { $transaction: async (fn: any, options: any) => {
  assert.equal(options.isolationLevel, "ReadCommitted");
  assert.equal(options.timeout, 15_000);
  const snapshot = structuredClone({ version, rows, logs });
  try { const result = await fn(tx); events.push("commit"); onCommit?.(); return result; } catch (error) { ({ version, rows, logs } = snapshot); throw error; }
} } };
const authPath = require.resolve("../src/lib/auth");
require(authPath);
require.cache[authPath]!.exports = { requireAuth: async () => user };
const { PATCH } = require("../src/app/api/groups/[id]/sessions/[sessionId]/attendance/route") as typeof import("../src/app/api/groups/[id]/sessions/[sessionId]/attendance/route");
beforeEach(() => { events = []; groupStatus = "ACTIVE"; cityId = "c1"; user = { userId: "u1", role: "MUSYRIF" }; onLock = undefined; onCommit = undefined; version = 0; rows = []; logs = []; writes = 0; writeQueries = 0; failLog = false; failWrite = false; allowed = true; sessionExists = true; memberExists = true; });
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

for (const change of ["delete", "transfer", "revoke"] as const) {
  function mutateGroup() {
    if (change === "delete") groupStatus = "DELETED";
    if (change === "transfer") cityId = "other";
    if (change === "revoke") allowed = false;
  }
  test(`${change} commits before group lock: attendance reloads state and rejects without writes`, async () => {
    if (change === "transfer") user = { userId: "u1", role: "CITY_ADMIN", cityId: "c1" };
    onLock = mutateGroup;
    const response = await save(0);
    assert.equal(response.status, change === "delete" ? 409 : 403);
    if (change === "delete") assert.equal((await response.json()).code, "GROUP_DELETED");
    assert.equal(events.includes("session.lock"), false);
    assert.equal(writes, 0); assert.deepEqual(logs, []); assert.equal(version, 0);
  });
  test(`attendance commits before ${change}: save succeeds, subsequent save rejects`, async () => {
    if (change === "transfer") user = { userId: "u1", role: "CITY_ADMIN", cityId: "c1" };
    onCommit = mutateGroup;
    assert.equal((await save(0)).status, 200);
    assert.deepEqual(events, ["group.lock", "session.read", "session.lock", "commit"]);
    assert.equal(version, 1); assert.equal(logs.length, 1);
    assert.equal((await save(1)).status, change === "delete" ? 409 : 403);
    assert.equal(version, 1); assert.equal(logs.length, 1); assert.equal(writes, 1);
  });
}


test("large first save uses one bulk insert and one version/log change", async () => {
  const records = Array.from({ length: 100 }, (_, i) => ({ memberId: `m${i}`, status: "HADIR", reason: "" }));
  assert.equal((await save(0, records)).status, 200);
  assert.equal(rows.length, 100); assert.equal(writeQueries, 1);
  assert.equal(version, 1); assert.equal(logs.length, 1);
  assert.equal(logs[0].metadata.changes.length, 100);
});

test("partial mixed batch groups equal updates and preserves distinct reasons and omitted records", async () => {
  rows = ["m1", "m2", "m3", "m4", "omitted"].map(memberId => ({ memberId, status: "HADIR", reason: null }));
  const records = [
    { memberId: "m1", status: "IZIN", reason: "same reason" },
    { memberId: "m2", status: "IZIN", reason: "same reason" },
    { memberId: "m3", status: "IZIN", reason: "different reason" },
    { memberId: "m4", status: "HADIR", reason: "" },
    { memberId: "new", status: "SAKIT", reason: "" },
  ];
  const response = await save(0, records);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).changedCount, 4);
  assert.equal(writeQueries, 3); // One insert, two distinct update payloads.
  assert.deepEqual(rows.find(row => row.memberId === "omitted"), { memberId: "omitted", status: "HADIR", reason: null });
  assert.equal(rows.find(row => row.memberId === "m3")?.reason, "different reason");
  assert.equal(JSON.stringify(logs).includes("same reason"), false);
  assert.equal(JSON.stringify(logs).includes("different reason"), false);
});

test("log failure rolls back both bulk inserts and grouped updates", async () => {
  rows = [{ memberId: "m1", status: "HADIR", reason: null }];
  const before = structuredClone(rows);
  failLog = true;
  assert.notEqual((await save(0, [
    { memberId: "m1", status: "IZIN", reason: "private" },
    { memberId: "new", status: "HADIR", reason: "" },
  ])).status, 200);
  assert.equal(writeQueries, 2);
  assert.deepEqual(rows, before); assert.equal(version, 0); assert.deepEqual(logs, []);
});
