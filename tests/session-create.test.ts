import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { createRequire } from "node:module";
import { Prisma } from "@prisma/client";

const require = createRequire(import.meta.url);
let user: any, group: any;
let sessions: any[], logs: any[], calls: string[];
let failLog: boolean;
let failAttendance: boolean;
let attendance: any[], members: any[];
let afterLock: (() => void) | undefined;
let tail: Promise<void>;
const duplicate = (target: string[]) => new Prisma.PrismaClientKnownRequestError("private database details", { code: "P2002", clientVersion: "6", meta: { target } });
const prismaPath = require.resolve("../src/lib/prisma"); require(prismaPath);
require.cache[prismaPath]!.exports = { prisma: { $transaction: async (fn: any, options: any) => {
  assert.equal(options.isolationLevel, "ReadCommitted");
  assert.equal(options.timeout, 15_000);
  let release: (() => void) | undefined;
  const pendingSessions: any[] = [], pendingLogs: any[] = [], pendingAttendance: any[] = [];
  try {
    const result = await fn({
      $queryRaw: async (_sql: any, id: string) => {
        assert.equal(id, "g1"); const previous = tail;
        tail = new Promise<void>(resolve => { release = resolve; }); await previous;
        calls.push("lock"); afterLock?.(); return [];
      },
      group: { findUnique: async () => { assert.ok(release); calls.push("group"); return group; } },
      user: { findUnique: async () => ({ role: "MUSYRIF", isActive: true, cityId: "c1" }) },
      member: { findMany: async ({ where }: any) => { calls.push("members"); assert.equal(where.groupId, "g1"); assert.equal(where.isActive, true); return members.filter(m => m.groupId === where.groupId && m.isActive && where.id.in.includes(m.id)); } },
      attendanceRecord: { createMany: async ({ data }: any) => { calls.push("attendance"); if (failAttendance) throw duplicate(["sessionId", "memberId"]); pendingAttendance.push(...data); return { count: data.length }; } },
      attendanceSession: {
        aggregate: async ({ where }: any) => { calls.push("number"); assert.equal(where.groupId, "g1"); return { _max: { meetingNumber: sessions.length ? Math.max(...sessions.map(s => s.meetingNumber)) : null } }; },
        create: async ({ data }: any) => {
        calls.push("session");
        if (sessions.some(s => s.groupId === data.groupId && s.meetingNumber === data.meetingNumber)) throw duplicate(["groupId", "meetingNumber"]);
        const session = { id: "a1", ...data }; pendingSessions.push(session); return session;
      } },
      activityLog: { create: async ({ data }: any) => { calls.push("log"); if (failLog) throw duplicate(["id"]); pendingLogs.push(data); return data; } },
    });
    sessions.push(...pendingSessions); logs.push(...pendingLogs); attendance.push(...pendingAttendance); return result;
  } finally { release?.(); }
} } };
const authPath = require.resolve("../src/lib/auth"); require(authPath);
require.cache[authPath]!.exports = { requireAuth: async () => { if (!user) throw new Error("Unauthorized"); return user; } };
const { POST } = require("../src/app/api/groups/[id]/sessions/route");
const call = (records: any = [{ memberId: "m1", status: "HADIR" }]) => POST(new Request("http://localhost/test", { method: "POST", body: JSON.stringify({ meetingNumber: 999, date: "2026-09-16", records }) }), { params: Promise.resolve({ id: "g1" }) });
beforeEach(() => {
  user = { userId: "u1", role: "SUPER_ADMIN", cityId: "c1", mahalliId: "h1", sectorId: "s1" };
  group = { id: "g1", name: "Group", status: "ACTIVE", sectorId: "s1", sector: { mahalliId: "h1", mahalli: { cityId: "c1" } }, assignments: [{ id: "t1", musyrifId: "u1", endedAt: null }] };
  members = [{ id: "m1", groupId: "g1", isActive: true }, { id: "m2", groupId: "g1", isActive: true }];
  attendance = []; failAttendance = false;
  sessions = []; logs = []; calls = []; failLog = false; afterLock = undefined; tail = Promise.resolve();
});
for (const role of ["SUPER_ADMIN", "CITY_ADMIN", "MAHALLI_ADMIN", "SECTOR_ADMIN", "MUSYRIF"]) {
  for (const status of ["ACTIVE", "INACTIVE"]) {
    test(`${role} can create for ${status} group with matching audit log`, async () => {
      user.role = role; group.status = status;
      assert.equal((await call()).status, 201); assert.equal(sessions.length, 1); assert.equal(logs.length, 1);
      assert.equal(sessions[0].date.toISOString(), "2026-09-16T00:00:00.000Z");
      assert.equal(sessions[0].notes, null);
      assert.deepEqual(logs[0], { actorId: "u1", action: "CREATE", entityType: "ATTENDANCE_SESSION", entityId: "a1", description: "Menambahkan pertemuan 1 pada kelompok Group.", metadata: { groupId: "g1", assignmentId: "t1", versionBefore: 0, versionAfter: 1, changes: [{ memberId: "m1", before: null, after: { status: "HADIR" }, reasonChanged: false }] } });
      assert.deepEqual(calls, ["lock", "group", "members", "number", "session", "attendance", "log"]);
    });
  }
  test(`${role} cannot create after group becomes DELETED before lock acquisition`, async () => {
    user.role = role; afterLock = () => { group.status = "DELETED"; };
    const response = await call(); assert.equal(response.status, 409);
    assert.equal((await response.json()).code, "GROUP_DELETED"); assert.deepEqual(sessions, []); assert.deepEqual(logs, []); assert.deepEqual(attendance, []);
  });
}
test("log failure rolls back session and is not misreported as duplicate meeting", async () => {
  failLog = true; const response = await call(); assert.equal(response.status, 500);
  assert.equal((await response.json()).error, "Gagal menyimpan pertemuan. Silakan coba kembali.");
  assert.deepEqual(sessions, []); assert.deepEqual(logs, []); assert.deepEqual(attendance, []);
});
test("concurrent meeting creation allocates consecutive group numbers", async () => {
  const responses = await Promise.all([call(), call()]);
  assert.deepEqual(responses.map(r => r.status), [201, 201]);
  assert.deepEqual(sessions.map(s => s.meetingNumber), [1, 2]);
  assert.ok(sessions.every(s => s.assignmentId === "t1"));
  assert.equal(logs.length, 2);
});
test("new tenure continues numbering across previous tenure sessions", async () => {
  sessions = [{ groupId: "g1", meetingNumber: 17, assignmentId: "previous-tenure" }];
  assert.equal((await call()).status, 201);
  assert.equal(sessions[1].meetingNumber, 18);
  assert.equal(sessions[1].assignmentId, "t1");
});
test("no active assignment prevents creation even for SUPER_ADMIN", async () => {
  group.assignments = [];
  const response = await call();
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, "ACTIVE_ASSIGNMENT_REQUIRED");
  assert.deepEqual(sessions, []); assert.deepEqual(logs, []); assert.deepEqual(attendance, []);
});

for (const role of ["CITY_ADMIN", "MAHALLI_ADMIN", "SECTOR_ADMIN", "MUSYRIF"]) {
  test(`${role} unauthorized after lock is rejected before writes`, async () => {
    user = { ...user, role, userId: "other", cityId: "other", mahalliId: "other", sectorId: "other" };
    assert.equal((await call()).status, 403); assert.deepEqual(sessions, []); assert.deepEqual(logs, []); assert.deepEqual(attendance, []);
  });
}
test("authentication failure occurs before any database query", async () => {
  user = null; assert.equal((await call()).ok, false); assert.deepEqual(calls, []);
});
test("missing group returns 404 without writes", async () => {
  group = null; assert.equal((await call()).status, 404); assert.deepEqual(sessions, []); assert.deepEqual(logs, []); assert.deepEqual(attendance, []);
});

test("meeting creation is rejected when the active tenure belongs to another Musyrif", async () => {
  user.role = "MUSYRIF";
  group.assignments[0].musyrifId = "replacement";
  assert.equal((await call()).status, 403);
  assert.deepEqual(sessions, []); assert.deepEqual(logs, []); assert.deepEqual(attendance, []);
});
test("revocation while waiting for group lock prevents session creation", async () => {
  afterLock = () => { group.assignments = []; };
  assert.equal((await call()).status, 409);
  assert.deepEqual(sessions, []); assert.deepEqual(logs, []); assert.deepEqual(attendance, []);
});

test("combined creation records all statuses and reasons with one initial version and private audit metadata", async () => {
  members = [1, 2, 3, 4].map(i => ({ id: `m${i}`, groupId: "g1", isActive: true }));
  const records = ["HADIR", "IZIN", "SAKIT", "ALPA"].map((status, i) => ({ memberId: `m${i+1}`, status, reason: "private reason" }));
  assert.equal((await call(records)).status, 201);
  assert.equal(sessions[0].attendanceVersion, 1); assert.equal(sessions[0].assignmentId, "t1");
  assert.equal(attendance.length, 4); assert.ok(attendance.every(r => r.sessionId === sessions[0].id && r.reason === "private reason"));
  assert.equal(logs.length, 1); assert.equal(logs[0].metadata.changes.length, 4);
  assert.doesNotMatch(JSON.stringify(logs[0]), /private reason/);
});
test("attendance insert failure rolls back the new meeting and audit", async () => {
  failAttendance = true;
  assert.equal((await call()).status, 500);
  assert.deepEqual(sessions, []); assert.deepEqual(attendance, []); assert.deepEqual(logs, []);
});
for (const records of [undefined, [{ memberId: "m1", status: "HADIR" }, { memberId: "m1", status: "SAKIT" }], [{ memberId: "m1", status: "IZIN" }], [{ memberId: "m1", status: "ALPA", reason: "  " }]]) {
  test(`invalid combined input is rejected before locking: ${JSON.stringify(records)}`, async () => {
    const response = records === undefined ? await POST(new Request("http://localhost/test", { method: "POST", body: JSON.stringify({ date: "2026-09-16" }) }), { params: Promise.resolve({ id: "g1" }) }) : await call(records);
    assert.equal(response.status, 400); assert.deepEqual(calls, []);
  });
}
for (const invalid of ["inactive", "foreign", "missing"]) {
  test(`batch containing ${invalid} member rejects every record before writing`, async () => {
    members.push({ id: "invalid", groupId: invalid === "foreign" ? "g2" : "g1", isActive: invalid !== "inactive" });
    const response = await call([{ memberId: "m1", status: "HADIR" }, { memberId: invalid === "missing" ? "absent" : "invalid", status: "SAKIT" }]);
    assert.equal(response.status, 400); assert.deepEqual(sessions, []); assert.deepEqual(attendance, []); assert.deepEqual(logs, []);
  });
}
test("empty attendance stays unrecorded with version zero", async () => {
  assert.equal((await call([])).status, 201);
  assert.equal(sessions[0].attendanceVersion, 0); assert.deepEqual(attendance, []);
});
