import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let state: any;
let actor: any;
let fail: string;
let tail: Promise<void>;
let onLock: (() => void) | undefined;
const sector = (id: string) => ({ id, mahalliId: "h1", mahalli: { cityId: "c1", city: { id: "c1" } } });
// Model a transaction-scoped row mutex, with state read only after acquisition.
const prisma = { $transaction: async (fn: any, options: any) => {
  assert.equal(options.isolationLevel, "ReadCommitted");
  let release: (() => void) | undefined;
  let draft: any;
  const checked = () => { assert.ok(draft, "database access must follow lock acquisition"); return draft; };
  try {
    const result = await fn({
      $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
        assert.match(strings.join("?"), /SELECT "id" FROM "Group" WHERE "id" = \? FOR UPDATE/);
        assert.deepEqual(values, ["g1"]);
        const previous = tail;
        tail = new Promise<void>((resolve) => { release = resolve; });
        await previous;
        onLock?.(); onLock = undefined;
        draft = structuredClone(state);
        return [{ id: "g1" }];
      },
      group: {
        findUnique: async () => ({ ...checked().group, sector: sector(checked().group.sectorId) }),
        update: async ({ data }: any) => { Object.assign(checked().group, Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined))); return checked().group; },
      },
      sector: { findUnique: async ({ where }: any) => { checked(); return sector(where.id); } },
      user: { findUnique: async ({ where }: any) => { checked(); return { id: where.id, name: where.id, role: "MUSYRIF", isActive: true, sectorId: "s1" }; } },
      userGroup: {
        findMany: async () => checked().rows.map((row: any) => ({ ...row, user: { sectorId: "s1" } })),
        delete: async ({ where }: any) => { checked().rows = checked().rows.filter((r: any) => r.id !== where.id); },
        create: async ({ data }: any) => { checked().rows.push({ id: data.userId, ...data }); },
      },
      groupAssignmentHistory: { create: async ({ data }: any) => { if (fail === "history") throw new Error("History failure"); checked().history.push(data); } },
      activityLog: { create: async ({ data }: any) => { if (fail === "log") throw new Error("Log failure"); checked().logs.push(data); } },
    });
    state = draft;
    return result;
  } finally { release?.(); }
} };
const prismaPath = require.resolve("../src/lib/prisma"); require(prismaPath);
require.cache[prismaPath]!.exports = { prisma };
const authPath = require.resolve("../src/lib/auth"); require(authPath);
require.cache[authPath]!.exports = { requireAuth: async () => actor };
const { POST, DELETE } = require("../src/app/api/groups/[id]/assignment/route");
const { PATCH } = require("../src/app/api/groups/[id]/route");
const call = (handler = POST, body: any = { musyrifId: "m1" }) => handler(new Request("http://localhost/api/test", { method: handler === DELETE ? "DELETE" : "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ id: "g1" }) });
beforeEach(() => {
  state = { group: { id: "g1", name: "Group", sectorId: "s1", status: "ACTIVE" }, rows: [], history: [], logs: [] };
  actor = { userId: "admin", role: "CITY_ADMIN", cityId: "c1" };
  fail = ""; tail = Promise.resolve(); onLock = undefined;
});
test("concurrent POSTs serialize into normal replacement with accurate history", async () => {
  const responses = await Promise.all([call(), call(POST, { musyrifId: "m2" })]);
  assert.deepEqual(responses.map(r => r.status), [200, 200]);
  assert.equal(state.rows.length, 1);
  assert.equal(state.rows[0].userId, "m2");
  assert.equal(state.history[1].oldMusyrifId, "m1");
  assert.equal(state.logs.length, 2);
});
test("concurrent DELETEs revoke once and then return a no-op", async () => {
  await call();
  const responses = await Promise.all([call(DELETE), call(DELETE)]);
  assert.deepEqual(responses.map(r => r.status), [200, 200]);
  assert.equal(state.rows.length, 0);
  assert.equal(state.history.length, 2);
  assert.equal(state.logs.length, 2);
});
test("POST and DELETE serialize without leaving an extra assignment", async () => {
  assert.deepEqual((await Promise.all([call(), call(DELETE)])).map(r => r.status), [200, 200]);
  assert.ok(state.rows.length <= 1);
  const last = state.history.at(-1);
  assert.equal(state.rows[0]?.userId, last.newMusyrifId);
  assert.equal(state.logs.length, state.history.length);
});
for (const handler of [POST, DELETE]) {
  test(`${handler.name}: duplicates rejected even for SUPER_ADMIN`, async () => {
    actor.role = "SUPER_ADMIN";
    state.rows = [{ id: "m1", userId: "m1" }, { id: "m2", userId: "m2" }];
    const before = structuredClone(state);
    const response = await call(handler);
    assert.equal(response.status, 409);
    assert.equal((await response.json()).code, "GROUP_ASSIGNMENT_DUPLICATE");
    assert.deepEqual(state, before);
  });
  for (const failure of ["history", "log"]) {
    test(`${handler.name}: ${failure} failure rolls back all writes`, async () => {
      state.rows = [{ id: "old", userId: "old" }];
      const before = structuredClone(state); fail = failure;
      assert.equal((await call(handler)).ok, false);
      assert.deepEqual(state, before);
    });
  }
  test(`${handler.name}: deleted state is checked after lock`, async () => {
    onLock = () => { state.group.status = "DELETED"; };
    const response = await call(handler);
    assert.equal(response.status, 409);
    assert.equal((await response.json()).code, "GROUP_DELETED");
    assert.deepEqual(state.logs, []);
    assert.deepEqual(state.rows, []);
  });
  test(`${handler.name}: unauthorized scope rejects without writes`, async () => {
    actor.cityId = "other";
    assert.equal((await call(handler)).status, 403);
    assert.deepEqual(state.logs, []);
    assert.deepEqual(state.rows, []);
  });
}
test("assignment first makes conflicting transfer fail", async () => {
  const responses = await Promise.all([call(), call(PATCH, { sectorId: "s2" })]);
  assert.deepEqual(responses.map(r => r.status), [200, 409]);
  assert.equal(state.group.sectorId, "s1");
  assert.equal(state.rows.length, 1);
  assert.equal(state.logs.length, 1);
});
test("transfer first makes assignment validate the new sector", async () => {
  const responses = await Promise.all([call(PATCH, { sectorId: "s2" }), call()]);
  assert.deepEqual(responses.map(r => r.status), [200, 400]);
  assert.equal(state.group.sectorId, "s2");
  assert.equal(state.rows.length, 0);
  assert.equal(state.logs.length, 1);
});
test("SUPER_ADMIN retains cross-sector assignment flexibility", async () => {
  actor.role = "SUPER_ADMIN"; state.group.sectorId = "s2";
  assert.equal((await call()).status, 200);
  assert.equal(state.rows.length, 1);
});
