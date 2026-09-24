import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { createRequire } from "node:module";
import type { SessionUser } from "../src/lib/types";

const require = createRequire(import.meta.url);
const sector = (id: string, mahalliId = "h1", cityId = "c1") => ({ id, mahalliId, mahalli: { cityId, city: { id: cityId } } });
let user: SessionUser;
let group: { id: string; name: string; status: string; sectorId: string; sector: ReturnType<typeof sector> };
let destination: ReturnType<typeof sector> | null;
let assignments: { user: { sectorId: string | null } }[];
let logs: any[];
let writes: string[];
let failLog: boolean;
let sectorQueries: number;
const db = {
  group: { findUnique: async () => group },
  sector: { findUnique: async (args: any) => {
    sectorQueries++;
    assert.equal(args.include.mahalli.include.city, true);
    return destination;
  } },
  groupAssignment: { findMany: async (args: any) => {
    assert.deepEqual(args.where, { groupId: "g1", endedAt: null });
    return assignments;
  } },
  // Stage writes until the callback succeeds, modelling Prisma transaction commit/rollback.
  $transaction: async (fn: any) => {
    let pendingGroup = { ...group };
    const pendingLogs: any[] = [];
    const result = await fn({
      $queryRaw: async () => [],
      sector: db.sector,
      groupAssignment: db.groupAssignment,
      group: { findUnique: db.group.findUnique, update: async ({ data }: any) => {
        writes.push("group");
        pendingGroup = { ...pendingGroup, ...Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)) };
        return pendingGroup;
      } },
      activityLog: { create: async ({ data }: any) => {
        writes.push("log");
        if (failLog) throw new Error("Log failed");
        pendingLogs.push(data);
        return data;
      } },
    });
    group = pendingGroup;
    logs.push(...pendingLogs);
    return result;
  },
};
const prismaPath = require.resolve("../src/lib/prisma"); require(prismaPath);
require.cache[prismaPath]!.exports = { prisma: db };
const authPath = require.resolve("../src/lib/auth"); require(authPath);
require.cache[authPath]!.exports = { requireAuth: async () => user };
const { PATCH } = require("../src/app/api/groups/[id]/route");
const call = (body: object = { sectorId: "s2" }) => PATCH(new Request("http://localhost/api/groups/g1", { method: "PATCH", body: JSON.stringify(body) }), { params: Promise.resolve({ id: "g1" }) });

beforeEach(() => {
  user = { userId: "u1", username: "admin", name: "Admin", role: "CITY_ADMIN", cityId: "c1", mahalliId: "h1", sectorId: "s1", sessionVersion: 0 };
  group = { id: "g1", name: "Group", status: "ACTIVE", sectorId: "s1", sector: sector("s1") };
  destination = sector("s2");
  assignments = []; logs = []; writes = []; failLog = false; sectorQueries = 0;
});

for (const role of ["CITY_ADMIN", "MAHALLI_ADMIN", "SECTOR_ADMIN"] as const) {
  test(`${role}: unauthorized destination rejected without writes`, async () => {
    user.role = role;
    destination = sector("s2", "h2", "c2");
    assert.equal((await call()).status, 403);
    assert.deepEqual(writes, []);
    assert.deepEqual(logs, []);
    assert.equal(group.sectorId, "s1");
  });
}
for (const role of ["CITY_ADMIN", "MAHALLI_ADMIN"] as const) {
  test(`${role}: valid transfer logs both scopes`, async () => {
    user.role = role;
    assignments = [{ user: { sectorId: "s2" } }];
    assert.equal((await call()).status, 200);
    assert.equal(group.sectorId, "s2");
    assert.equal(logs.length, 1);
    assert.deepEqual(logs[0].metadata, {
      previousScope: { cityId: "c1", mahalliId: "h1", sectorId: "s1" },
      destinationScope: { cityId: "c1", mahalliId: "h1", sectorId: "s2" },
    });
  });
}
test("SUPER_ADMIN cannot transfer across cities with active tenure", async () => {
  user.role = "SUPER_ADMIN"; destination = sector("s2", "h2", "c2");
  assignments = [{ user: { sectorId: "s1" } }];
  const response = await call();
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, "GROUP_ASSIGNMENT_SCOPE_CONFLICT");
  assert.deepEqual(writes, []); assert.deepEqual(logs, []);
});
test("SUPER_ADMIN can transfer across cities without active tenure", async () => {
  user.role = "SUPER_ADMIN"; destination = sector("s2", "h2", "c2");
  assert.equal((await call()).status, 200);
  assert.equal(group.sectorId, "s2");
});
test("missing destination rejected without writes", async () => {
  destination = null;
  assert.equal((await call()).status, 404);
  assert.deepEqual(writes, []);
});
test("source outside scope rejected before destination query", async () => {
  user.cityId = "c2";
  assert.equal((await call()).status, 403);
  assert.equal(sectorQueries, 0);
  assert.deepEqual(writes, []);
});
test("MUSYRIF cannot transfer groups", async () => {
  user.role = "MUSYRIF";
  assert.equal((await call()).status, 403);
  assert.deepEqual(writes, []);
});
test("deleted group rejected before destination query", async () => {
  group.status = "DELETED";
  const response = await call();
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, "GROUP_DELETED");
  assert.equal(sectorQueries, 0);
  assert.deepEqual(writes, []);
});
test("ActivityLog failure prevents transaction commit", async () => {
  failLog = true;
  assert.equal((await call()).ok, false);
  assert.deepEqual(writes, ["group", "log"]);
  assert.equal(group.sectorId, "s1");
  assert.deepEqual(logs, []);
});
for (const body of [{ name: "Renamed" }, { name: "Renamed", sectorId: "s1" }]) {
  test(`name update works without transfer (${JSON.stringify(body)})`, async () => {
    assignments = [{ user: { sectorId: "other" } }];
    assert.equal((await call(body)).status, 200);
    assert.equal(group.name, "Renamed");
    assert.equal(group.sectorId, "s1");
    assert.equal(sectorQueries, 0);
    assert.equal(logs.length, 1);
    assert.equal(logs[0].metadata, undefined);
  });
}
