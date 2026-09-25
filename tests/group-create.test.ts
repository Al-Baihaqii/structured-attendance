import { mutationRequest } from "./helpers/request";
import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let user: any;
let sector: any;
let groups: any[];
let logs: any[];
let calls: string[];
let failure: string;
const prismaPath = require.resolve("../src/lib/prisma"); require(prismaPath);
// Only tx exposes queries: using prisma inside the callback fails these tests.
require.cache[prismaPath]!.exports = { prisma: { $transaction: async (fn: any) => {
  calls.push("transaction");
  const pendingGroups: any[] = []; const pendingLogs: any[] = [];
  const result = await fn({
    sector: { findUnique: async (args: any) => { calls.push("sector"); assert.deepEqual(args, { where: { id: "s1" }, include: { mahalli: true } }); return sector; } },
    group: { create: async ({ data }: any) => { calls.push("group"); if (failure === "group") throw new Error("Group failure"); const group = { id: "g1", ...data }; pendingGroups.push(group); return group; } },
    activityLog: { create: async ({ data }: any) => { calls.push("log"); if (failure === "log") throw new Error("Log failure"); pendingLogs.push(data); return data; } },
  });
  groups.push(...pendingGroups); logs.push(...pendingLogs); return result;
} } };
const authPath = require.resolve("../src/lib/auth"); require(authPath);
require.cache[authPath]!.exports = { requireAuth: async () => { if (!user) throw new Error("Unauthorized"); return user; } };
const { POST } = require("../src/app/api/groups/route");
const call = () => POST(mutationRequest("http://localhost/api/groups", { method: "POST", body: JSON.stringify({ name: "Kelompok baru", sectorId: "s1" }) }));
beforeEach(() => {
  user = { userId: "u1", role: "SUPER_ADMIN", cityId: "c1", mahalliId: "h1", sectorId: "s1" };
  sector = { id: "s1", isActive: true, mahalliId: "h1", mahalli: { cityId: "c1" } };
  groups = []; logs = []; calls = []; failure = "";
});
for (const role of ["SUPER_ADMIN", "CITY_ADMIN", "MAHALLI_ADMIN", "SECTOR_ADMIN"]) {
  test(`${role} creates group and log atomically in active authorized sector`, async () => {
    user.role = role; const response = await call();
    assert.equal(response.status, 201);
    assert.deepEqual((await response.json()).group, groups[0]);
    assert.equal(groups.length, 1); assert.equal(logs.length, 1);
    assert.equal(logs[0].entityId, groups[0].id);
    assert.equal(logs[0].actorId, "u1"); assert.equal(logs[0].action, "CREATE");
    assert.deepEqual(calls, ["transaction", "sector", "group", "log"]);
  });
  test(`${role} rejects inactive sector without writes`, async () => {
    user.role = role; sector.isActive = false;
    const response = await call(); assert.equal(response.status, 409);
    assert.equal((await response.json()).error, "Sektor tidak aktif.");
    assert.deepEqual(groups, []); assert.deepEqual(logs, []);
  });
}
for (const role of ["CITY_ADMIN", "MAHALLI_ADMIN", "SECTOR_ADMIN"]) {
  test(`${role} rejects out-of-scope sector before revealing inactive state`, async () => {
    user = { ...user, role, cityId: "other", mahalliId: "other", sectorId: "other" }; sector.isActive = false;
    assert.equal((await call()).status, 403); assert.deepEqual(groups, []); assert.deepEqual(logs, []);
  });
}
for (const stage of ["group", "log"]) {
  test(`${stage} failure rolls back group and log`, async () => {
    failure = stage; assert.equal((await call()).ok, false);
    assert.ok(calls.includes(stage)); assert.deepEqual(groups, []); assert.deepEqual(logs, []);
  });
}
test("missing sector is rejected without writes", async () => {
  sector = null; assert.equal((await call()).status, 404); assert.deepEqual(groups, []); assert.deepEqual(logs, []);
});
test("MUSYRIF and unauthenticated requests never start a transaction", async () => {
  user.role = "MUSYRIF"; assert.equal((await call()).status, 403);
  user = null; assert.equal((await call()).ok, false); assert.deepEqual(calls, []);
});
