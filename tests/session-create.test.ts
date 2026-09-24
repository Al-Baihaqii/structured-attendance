import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { createRequire } from "node:module";
import { Prisma } from "@prisma/client";

const require = createRequire(import.meta.url);
let user: any, group: any;
let sessions: any[], logs: any[], calls: string[];
let failLog: boolean;
let afterLock: (() => void) | undefined;
let tail: Promise<void>;
const duplicate = (target: string[]) => new Prisma.PrismaClientKnownRequestError("private database details", { code: "P2002", clientVersion: "6", meta: { target } });
const prismaPath = require.resolve("../src/lib/prisma"); require(prismaPath);
require.cache[prismaPath]!.exports = { prisma: { $transaction: async (fn: any, options: any) => {
  assert.equal(options.isolationLevel, "ReadCommitted");
  let release: (() => void) | undefined;
  const pendingSessions: any[] = [], pendingLogs: any[] = [];
  try {
    const result = await fn({
      $queryRaw: async (_sql: any, id: string) => {
        assert.equal(id, "g1"); const previous = tail;
        tail = new Promise<void>(resolve => { release = resolve; }); await previous;
        calls.push("lock"); afterLock?.(); return [];
      },
      group: { findUnique: async () => { assert.ok(release); calls.push("group"); return group; } },
      user: { findUnique: async () => ({ role: "MUSYRIF", isActive: true, cityId: "c1" }) },
      attendanceSession: {
        aggregate: async ({ where }: any) => { calls.push("number"); assert.equal(where.groupId, "g1"); return { _max: { meetingNumber: sessions.length ? Math.max(...sessions.map(s => s.meetingNumber)) : null } }; },
        create: async ({ data }: any) => {
        calls.push("session");
        if (sessions.some(s => s.groupId === data.groupId && s.meetingNumber === data.meetingNumber)) throw duplicate(["groupId", "meetingNumber"]);
        const session = { id: "a1", ...data }; pendingSessions.push(session); return session;
      } },
      activityLog: { create: async ({ data }: any) => { calls.push("log"); if (failLog) throw duplicate(["id"]); pendingLogs.push(data); return data; } },
    });
    sessions.push(...pendingSessions); logs.push(...pendingLogs); return result;
  } finally { release?.(); }
} } };
const authPath = require.resolve("../src/lib/auth"); require(authPath);
require.cache[authPath]!.exports = { requireAuth: async () => { if (!user) throw new Error("Unauthorized"); return user; } };
const { POST } = require("../src/app/api/groups/[id]/sessions/route");
const call = () => POST(new Request("http://localhost/test", { method: "POST", body: JSON.stringify({ meetingNumber: 1, date: "2026-09-16" }) }), { params: Promise.resolve({ id: "g1" }) });
beforeEach(() => {
  user = { userId: "u1", role: "SUPER_ADMIN", cityId: "c1", mahalliId: "h1", sectorId: "s1" };
  group = { id: "g1", name: "Group", status: "ACTIVE", sectorId: "s1", sector: { mahalliId: "h1", mahalli: { cityId: "c1" } }, assignments: [{ id: "t1", musyrifId: "u1", endedAt: null }] };
  sessions = []; logs = []; calls = []; failLog = false; afterLock = undefined; tail = Promise.resolve();
});
for (const role of ["SUPER_ADMIN", "CITY_ADMIN", "MAHALLI_ADMIN", "SECTOR_ADMIN", "MUSYRIF"]) {
  for (const status of ["ACTIVE", "INACTIVE"]) {
    test(`${role} can create for ${status} group with matching audit log`, async () => {
      user.role = role; group.status = status;
      assert.equal((await call()).status, 201); assert.equal(sessions.length, 1); assert.equal(logs.length, 1);
      assert.equal(sessions[0].date.toISOString(), "2026-09-16T00:00:00.000Z");
      assert.equal(sessions[0].notes, null);
      assert.deepEqual(logs[0], { actorId: "u1", action: "CREATE", entityType: "ATTENDANCE_SESSION", entityId: "a1", description: "Menambahkan pertemuan 1 pada kelompok Group." });
      assert.deepEqual(calls, ["lock", "group", "number", "session", "log"]);
    });
  }
  test(`${role} cannot create after group becomes DELETED before lock acquisition`, async () => {
    user.role = role; afterLock = () => { group.status = "DELETED"; };
    const response = await call(); assert.equal(response.status, 409);
    assert.equal((await response.json()).code, "GROUP_DELETED"); assert.deepEqual(sessions, []); assert.deepEqual(logs, []);
  });
}
test("log failure rolls back session and is not misreported as duplicate meeting", async () => {
  failLog = true; const response = await call(); assert.equal(response.status, 500);
  assert.equal((await response.json()).error, "Gagal menyimpan pertemuan. Silakan coba kembali.");
  assert.deepEqual(sessions, []); assert.deepEqual(logs, []);
});
test("concurrent meeting creation allocates consecutive group numbers", async () => {
  const responses = await Promise.all([call(), call()]);
  assert.deepEqual(responses.map(r => r.status), [201, 201]);
  assert.deepEqual(sessions.map(s => s.meetingNumber), [1, 2]);
  assert.ok(sessions.every(s => s.assignmentId === "t1"));
  assert.equal(logs.length, 2);
});
test("new tenure continues numbering across old and unattributed sessions", async () => {
  sessions = [{ groupId: "g1", meetingNumber: 17, assignmentId: null }];
  assert.equal((await call()).status, 201);
  assert.equal(sessions[1].meetingNumber, 18);
  assert.equal(sessions[1].assignmentId, "t1");
});
test("no active assignment prevents creation even for SUPER_ADMIN", async () => {
  group.assignments = [];
  const response = await call();
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, "ACTIVE_ASSIGNMENT_REQUIRED");
  assert.deepEqual(sessions, []); assert.deepEqual(logs, []);
});

for (const role of ["CITY_ADMIN", "MAHALLI_ADMIN", "SECTOR_ADMIN", "MUSYRIF"]) {
  test(`${role} unauthorized after lock is rejected before writes`, async () => {
    user = { ...user, role, userId: "other", cityId: "other", mahalliId: "other", sectorId: "other" };
    assert.equal((await call()).status, 403); assert.deepEqual(sessions, []); assert.deepEqual(logs, []);
  });
}
test("authentication failure occurs before any database query", async () => {
  user = null; assert.equal((await call()).ok, false); assert.deepEqual(calls, []);
});
test("missing group returns 404 without writes", async () => {
  group = null; assert.equal((await call()).status, 404); assert.deepEqual(sessions, []); assert.deepEqual(logs, []);
});

test("legacy mirror cannot grant meeting creation when the active tenure belongs to another Musyrif", async () => {
  user.role = "MUSYRIF";
  group.userGroups = [{ userId: "u1" }];
  group.assignments[0].musyrifId = "replacement";
  assert.equal((await call()).status, 403);
  assert.deepEqual(sessions, []); assert.deepEqual(logs, []);
});
test("revocation while waiting for group lock prevents session creation", async () => {
  afterLock = () => { group.assignments = []; };
  assert.equal((await call()).status, 409);
  assert.deepEqual(sessions, []); assert.deepEqual(logs, []);
});
