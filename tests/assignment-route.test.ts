import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let transactionOptions: any[];
let state: any;
let actor: any;
let fail: string;
let tail: Promise<void>;
let onUserLock: (() => void) | undefined;
let onLock: (() => void) | undefined;
const sector = (id: string) => ({ id, mahalliId: "h1", mahalli: { cityId: "c1", city: { id: "c1" } } });
// Model a transaction-scoped row mutex, with state read only after acquisition.
const prisma = { $transaction: async (fn: any, options: any) => {
  assert.equal(options.isolationLevel, "ReadCommitted");
  transactionOptions.push(options);
  let release: (() => void) | undefined;
  let draft: any;
  const checked = () => { assert.ok(draft, "database access must follow lock acquisition"); return draft; };
  try {
    const result = await fn({
      $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
        if (strings.join("?").includes('FROM "User"')) {
          checked(); onUserLock?.(); onUserLock = undefined;
          assert.match(strings.join("?"), /FOR UPDATE/);
          assert.match(strings.join("?"), /SELECT "id", "name", "role", "isActive", "cityId"/);
          if (fail === "missing-user") return [];
          return [{ id: values[0], name: values[0], role: fail === "role" ? "CITY_ADMIN" : "MUSYRIF", isActive: fail !== "inactive", cityId: fail === "city" ? "c2" : "c1" }];
        }
        assert.match(strings.join("?"), /SELECT "id" FROM "Group" WHERE "id" = \? FOR UPDATE/);
        assert.deepEqual(values, [state.group.id]);
        const previous = tail;
        tail = new Promise<void>((resolve) => { release = resolve; });
        await previous;
        onLock?.(); onLock = undefined;
        draft = structuredClone(state);
        return [{ id: state.group.id }];
      },
      group: {
        findUnique: async () => ({ ...checked().group, sector: sector(checked().group.sectorId) }),
        update: async ({ data }: any) => { Object.assign(checked().group, Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined))); return checked().group; },
      },
      sector: { findUnique: async ({ where }: any) => { checked(); return sector(where.id); } },
      user: { findUnique: async () => { throw new Error("Assignment must read the candidate from the locked row"); } },
      groupAssignment: {
        findMany: async ({ where }: any) => checked().tenures.filter((row: any) => row.groupId === where.groupId && row.endedAt === null),
        update: async ({ where, data }: any) => Object.assign(checked().tenures.find((row: any) => row.id === where.id), data),
        create: async ({ data }: any) => { const row = { id: `t${checked().tenures.length}`, endedAt: null, ...data }; checked().tenures.push(row); return row; },
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
const call = (handler = POST, body: any = { musyrifId: "m1" }, groupId = "g1") => handler(new Request("http://localhost/api/test", { method: handler === DELETE ? "DELETE" : "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ id: groupId }) });
beforeEach(() => {
  state = { group: { id: "g1", name: "Group", sectorId: "s1", status: "ACTIVE" }, rows: [], tenures: [], history: [], logs: [] };
  actor = { userId: "admin", role: "CITY_ADMIN", cityId: "c1" };
  transactionOptions = [];
  fail = ""; tail = Promise.resolve(); onLock = undefined; onUserLock = undefined;
});
test("concurrent POSTs serialize into normal replacement with accurate history", async () => {
  const responses = await Promise.all([call(), call(POST, { musyrifId: "m2" })]);
  assert.deepEqual(responses.map(r => r.status), [200, 200]);
  assert.equal(activeTenures().length, 1);
  assert.equal(activeTenures()[0].musyrifId, "m2");
  assert.equal(state.history[1].oldMusyrifId, "m1");
  assert.equal(state.logs.length, 2);
});
test("concurrent DELETEs revoke once and then return a no-op", async () => {
  await call();
  const responses = await Promise.all([call(DELETE), call(DELETE)]);
  assert.deepEqual(responses.map(r => r.status), [200, 200]);
  assert.equal(activeTenures().length, 0);
  assert.equal(state.history.length, 2);
  assert.equal(state.logs.length, 2);
});
test("POST and DELETE serialize without leaving an extra assignment", async () => {
  assert.deepEqual((await Promise.all([call(), call(DELETE)])).map(r => r.status), [200, 200]);
  assert.ok(activeTenures().length <= 1);
  const last = state.history.at(-1);
  assert.equal(activeTenures()[0]?.musyrifId, last.newMusyrifId);
  assert.equal(state.logs.length, state.history.length);
});
for (const handler of [POST, DELETE]) {
  test(`${handler.name}: duplicates rejected even for SUPER_ADMIN`, async () => {
    actor.role = "SUPER_ADMIN";
    state.tenures = [{ id: "t1", groupId: "g1", musyrifId: "m1", endedAt: null }, { id: "t2", groupId: "g1", musyrifId: "m2", endedAt: null }];
    const before = structuredClone(state);
    const response = await call(handler);
    assert.equal(response.status, 409);
    assert.equal((await response.json()).code, "GROUP_ASSIGNMENT_DUPLICATE");
    assert.deepEqual(state, before);
  });
  for (const failure of ["history", "log"]) {
    test(`${handler.name}: ${failure} failure rolls back all writes`, async () => {
      state.rows = [{ id: "old", userId: "old" }];
      state.tenures = [{ id: "old", groupId: "g1", musyrifId: "old", endedAt: null }];
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
test("assignment first allows same-city transfer retaining tenure", async () => {
  const responses = await Promise.all([call(), call(PATCH, { sectorId: "s2" })]);
  assert.deepEqual(responses.map(r => r.status), [200, 200]);
  assert.equal(state.group.sectorId, "s2");
  assert.equal(activeTenures().length, 1);
  assert.equal(state.logs.length, 2);
});
test("transfer first allows assignment in another sector of the same city", async () => {
  const responses = await Promise.all([call(PATCH, { sectorId: "s2" }), call()]);
  assert.deepEqual(responses.map(r => r.status), [200, 200]);
  assert.equal(state.group.sectorId, "s2");
  assert.equal(activeTenures().length, 1);
  assert.equal(state.logs.length, 2);
});
test("SUPER_ADMIN retains cross-sector assignment flexibility", async () => {
  actor.role = "SUPER_ADMIN"; state.group.sectorId = "s2";
  assert.equal((await call()).status, 200);
  assert.equal(activeTenures().length, 1);
});


test("same active Musyrif is a no-op; returning creates a distinct tenure", async () => {
  await call();
  const before = structuredClone(state);
  await call(); assert.deepEqual(state, before);
  await call(POST, { musyrifId: "m2" });
  await call();
  assert.equal(state.tenures.length, 3);
  assert.equal(state.tenures.filter((row: any) => row.endedAt === null).length, 1);
  assert.ok(state.tenures[0].endedAt instanceof Date);
  assert.equal(state.tenures[2].musyrifId, "m1");
});
test("SUPER_ADMIN cannot assign across cities", async () => {
  actor.role = "SUPER_ADMIN"; fail = "city";
  assert.equal((await call()).status, 400);
  assert.deepEqual(state.tenures, []); assert.deepEqual(state.logs, []);
});

test("one Musyrif retains simultaneous tenures in multiple same-city groups", async () => {
  assert.equal((await call()).status, 200);
  state.group.id = "g2";
  assert.equal((await call(POST, { musyrifId: "m1" }, "g2")).status, 200);
  assert.equal(state.tenures.filter((row: any) => row.musyrifId === "m1" && row.endedAt === null).length, 2);
  assert.deepEqual(activeTenures().map((row: any) => row.groupId).sort(), ["g1", "g2"]);
});

test("revocation without an active tenure leaves state unchanged", async () => {
  const before = structuredClone(state);
  assert.equal((await call(DELETE)).status, 200);
  assert.deepEqual(state, before);
});

test("city change committed before user lock is rechecked before assigning", async () => {
  onUserLock = () => { fail = "city"; };
  assert.equal((await call()).status, 400);
  assert.deepEqual(state.tenures, []); assert.deepEqual(state.logs, []);
});

function activeTenures() { return state.tenures.filter((row: any) => row.endedAt === null); }

for (const handler of [POST, DELETE]) {
  test(`${handler.name}: uses explicit 15 second transaction lifetime`, async () => {
    assert.equal((await call(handler)).status, 200);
    assert.equal(transactionOptions[0].timeout, 15_000);
  });
}
for (const failure of ["missing-user", "inactive", "role"]) {
  test(`locked candidate ${failure} rejects without writes`, async () => {
    fail = failure;
    const before = structuredClone(state);
    assert.equal((await call()).status, 400);
    assert.deepEqual(state, before);
  });
}
