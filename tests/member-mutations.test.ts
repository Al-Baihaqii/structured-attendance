import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let user: any, group: any, member: any;
let logs: any[], attendance: any[], failLog: boolean, tail: Promise<void>;
const prismaPath = require.resolve("../src/lib/prisma"); require(prismaPath);
require.cache[prismaPath]!.exports = { prisma: { $transaction: async (fn: any) => {
  let release: (() => void) | undefined;
  let draft: any;
  const pending: any[] = [];
  try {
    const result = await fn({
      $queryRaw: async (_sql: any, id: string) => {
        assert.equal(id, "g1"); const previous = tail;
        tail = new Promise<void>(resolve => { release = resolve; }); await previous;
        draft = structuredClone(member); return [{ id }];
      },
      group: { findUnique: async () => { assert.ok(release); return group; } },
      member: {
        findUnique: async ({ select }: any) => select ? (member ? { groupId: member.groupId } : null) : (draft ? { ...draft, group } : null),
        create: async ({ data }: any) => { assert.ok(release); draft = { id: "m1", isActive: true, ...data }; return draft; },
        update: async ({ data }: any) => { assert.ok(release); Object.assign(draft, data); return draft; },
        updateMany: async ({ where, data }: any) => {
          assert.deepEqual(where, { id: "m1", groupId: "g1", isActive: true });
          if (!draft.isActive) return { count: 0 }; Object.assign(draft, data); return { count: 1 };
        },
      },
      activityLog: { create: async ({ data }: any) => { if (failLog) throw new Error("Log failed"); pending.push(data); return data; } },
    });
    if (release) member = draft;
    logs.push(...pending); return result;
  } finally { release?.(); }
} } };
const authPath = require.resolve("../src/lib/auth"); require(authPath);
require.cache[authPath]!.exports = { requireAuth: async () => user };
const { POST } = require("../src/app/api/groups/[id]/members/route");
const { PATCH, DELETE } = require("../src/app/api/members/[id]/route");
const call = (handler: any, body = { name: "Changed" }) => handler(new Request("http://localhost/test", { method: handler === DELETE ? "DELETE" : "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ id: handler === POST ? "g1" : "m1" }) });
beforeEach(() => {
  user = { userId: "u1", role: "SUPER_ADMIN", cityId: "c1", mahalliId: "h1", sectorId: "s1" };
  group = { id: "g1", status: "ACTIVE", sectorId: "s1", sector: { mahalliId: "h1", mahalli: { cityId: "c1" } } };
  member = { id: "m1", groupId: "g1", name: "Original", isActive: true };
  logs = []; attendance = [{ memberId: "m1", status: "HADIR" }]; failLog = false; tail = Promise.resolve();
});
for (const handler of [POST, PATCH, DELETE]) {
  test(`${handler.name} writes member and one log`, async () => {
    if (handler === POST) member = null;
    assert.equal((await call(handler)).status, handler === POST ? 201 : 200);
    assert.equal(logs.length, 1); assert.equal(logs[0].entityId, "m1");
    assert.equal(handler === DELETE ? member.isActive : member.name, handler === DELETE ? false : "Changed");
  });
  test(`${handler.name} rolls back if log fails`, async () => {
    if (handler === POST) member = null;
    const before = structuredClone(member); failLog = true;
    assert.equal((await call(handler)).ok, false);
    assert.deepEqual(member, before); assert.deepEqual(logs, []);
  });
  test(`${handler.name} rejects deleted group without writes`, async () => {
    group.status = "DELETED"; const before = structuredClone(member);
    const response = await call(handler); assert.equal(response.status, 409);
    assert.equal((await response.json()).code, "GROUP_DELETED");
    assert.deepEqual(member, before); assert.deepEqual(logs, []);
  });
  for (const role of ["CITY_ADMIN", "MAHALLI_ADMIN", "SECTOR_ADMIN", "MUSYRIF"]) {
    test(`${handler.name} rejects unauthorized ${role}`, async () => {
      user = { ...user, role, cityId: "other", mahalliId: "other", sectorId: "other" };
      const before = structuredClone(member);
      assert.ok([403, 404].includes((await call(handler)).status));
      assert.deepEqual(member, before); assert.deepEqual(logs, []);
    });
  }
}
test("concurrent and repeated deactivation logs once and retains member and attendance", async () => {
  const before = structuredClone(attendance);
  const responses = await Promise.all([call(DELETE), call(DELETE)]);
  assert.ok(responses.every(r => r.ok)); assert.equal((await call(DELETE)).status, 200);
  assert.equal(logs.length, 1); assert.equal(member.id, "m1"); assert.equal(member.isActive, false);
  assert.deepEqual(attendance, before);
});
test("identical concurrent name updates log only the actual change", async () => {
  assert.ok((await Promise.all([call(PATCH), call(PATCH)])).every(r => r.ok));
  assert.equal(logs.length, 1);
  assert.equal((await call(PATCH, {} as any)).status, 200); assert.equal(logs.length, 1);
});
