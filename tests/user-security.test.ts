import assert from "node:assert/strict";
import test, { beforeEach, afterEach, mock } from "node:test";
import { createRequire } from "node:module";
import { canCreateUserRole } from "../src/lib/authorization";
import type { SessionUser } from "../src/lib/types";

const require = createRequire(import.meta.url);
const prismaPath = require.resolve("../src/lib/prisma");
require(prismaPath);
const unexpected = async () => { throw new Error("Unexpected database call in test"); };
const prismaMethods = {
  $queryRaw: async () => [],
  groupAssignment: { count: async () => 0 },
  user: { findUnique: unexpected, update: unexpected, create: unexpected },
  activityLog: { create: unexpected },
  sector: { findUnique: unexpected },
  mahalli: { findUnique: unexpected },
  city: { findUnique: unexpected },
};
const prisma = {
  ...prismaMethods,
  $transaction: async <T>(callback: (tx: typeof prismaMethods) => Promise<T>): Promise<T> => callback(prisma),
};
require.cache[prismaPath]!.exports = { prisma };
const authPath = require.resolve("../src/lib/auth");
require(authPath);
let actor: SessionUser;
require.cache[authPath]!.exports = { ...require.cache[authPath]!.exports, requireAuth: async () => actor, hashPassword: async () => "test-hash" };
const { PATCH } = require("../src/app/api/users/[id]/route") as typeof import("../src/app/api/users/[id]/route");
const { POST } = require("../src/app/api/users/route") as typeof import("../src/app/api/users/route");
let target: any;
let writes: any[];
const base = { id: "target", username: "tester", name: "Tester", role: "MUSYRIF", cityId: "c1", mahalliId: "m1", sectorId: "s1", isActive: true };
beforeEach(() => {
  actor = { userId: "admin", username: "admin", name: "Admin", role: "CITY_ADMIN", cityId: "c1", mahalliId: null, sectorId: null, sessionVersion: 0 };
  target = { ...base }; writes = [];
  mock.method(prisma.user, "findUnique", async ({ where }: any) => where.username ? null : target);
  mock.method(prisma.user, "update", async (args: any) => { writes.push(args); return { ...target, ...args.data }; });
  mock.method(prisma.user, "create", async (args: any) => { writes.push(args); return { id: "new", ...args.data }; });
  mock.method(prisma.activityLog, "create", async (args: any) => { writes.push({ log: args }); return {}; });
  mock.method(prisma.sector, "findUnique", async ({ where }: any) => ["s1", "s2"].includes(where.id) ? { id: where.id, mahalliId: where.id === "s1" ? "m1" : "m2", mahalli: { cityId: where.id === "s1" ? "c1" : "c2" } } : null);
  mock.method(prisma.mahalli, "findUnique", async ({ where }: any) => ["m1", "m2"].includes(where.id) ? { id: where.id, cityId: where.id === "m1" ? "c1" : "c2" } : null);
  mock.method(prisma.city, "findUnique", async ({ where }: any) => ["c1", "c2"].includes(where.id) ? { id: where.id } : null);
});
afterEach(() => mock.restoreAll());
const patch = (body: unknown) => PATCH(new Request("http://localhost/api/users/target", { method: "PATCH", body: JSON.stringify(body) }), { params: Promise.resolve({ id: target.id }) });
const create = (overrides: object = {}) => POST(new Request("http://localhost/api/users", { method: "POST", body: JSON.stringify({ username: "newuser", name: "New User", password: "password123", role: "MUSYRIF", cityId: "c1", mahalliId: "m1", sectorId: "s1", ...overrides }) }));

test("self role and scope changes are denied before any mutation", async () => {
  target = { ...base, id: actor.userId, role: actor.role, mahalliId: null, sectorId: null };
  for (const body of [{ role: "SUPER_ADMIN" }, { cityId: "c2" }, { cityId: null }, { mahalliId: "m1" }, { sectorId: "s1" }]) {
    assert.equal((await patch(body)).status, 403);
    assert.equal(writes.length, 0);
  }
});

test("current target outside scope cannot be pulled into scope or have password changed", async () => {
  target = { ...base, cityId: "c2", mahalliId: "m2", sectorId: "s2" };
  assert.equal((await patch({ cityId: "c1", mahalliId: "m1", sectorId: "s1", password: "newpassword" })).status, 403);
  assert.equal(writes.length, 0);
});

test("higher privileged target cannot be demoted to bypass authorization", async () => {
  target = { ...base, role: "SUPER_ADMIN", cityId: null, mahalliId: null, sectorId: null };
  assert.equal((await patch({ role: "MUSYRIF", cityId: "c1", mahalliId: "m1", sectorId: "s1" })).status, 403);
  assert.equal(writes.length, 0);
});

test("final target scope and role must also be authorized", async () => {
  assert.equal((await patch({ cityId: "c2", mahalliId: "m2", sectorId: "s2" })).status, 403);
  assert.equal((await patch({ role: "CITY_ADMIN" })).status, 403);
  assert.equal(writes.length, 0);
});

test("inconsistent or missing hierarchy is rejected by create and update without mutation", async () => {
  target.role = "SECTOR_ADMIN";
  for (const input of [{ mahalliId: "m2" }, { cityId: "c2" }, { sectorId: "missing" }]) {
    assert.equal((await create({ ...input, role: "SECTOR_ADMIN" })).status, 400);
    assert.equal((await patch(input)).status, 400);
    assert.equal(writes.length, 0);
  }
  assert.equal((await create({ role: "MAHALLI_ADMIN", sectorId: null, mahalliId: "m2" })).status, 400);
  assert.equal(writes.length, 0);
});

test("valid hierarchy is accepted on create and profile update", async () => {
  assert.equal((await create()).status, 201);
  assert.equal(writes.length, 2);
  writes = [];
  assert.equal((await patch({ name: "Updated Name" })).status, 200);
  assert.equal(writes[0].data.name, "Updated Name");
  assert.equal(writes[0].where.sectorId, "s1");
  assert.equal(writes.length, 2);
});

test("self profile and password updates work without writing role or scope", async () => {
  target = { ...base, id: actor.userId, role: actor.role, mahalliId: null, sectorId: null };
  assert.equal((await patch({ name: "Updated Admin", password: "newpassword", cityId: "c1" })).status, 200);
  assert.equal(writes[0].data.passwordHash, "test-hash");
  assert.deepEqual(writes[0].data.sessionVersion, { increment: 1 });
  assert.equal("role" in writes[0].data, false);
  assert.equal("cityId" in writes[0].data, false);
});

test("explicit null can clear scope during an authorized role change", async () => {
  actor.role = "SUPER_ADMIN"; actor.cityId = null;
  assert.equal((await patch({ role: "SUPER_ADMIN", cityId: null, mahalliId: null, sectorId: null })).status, 200);
  assert.equal(writes[0].data.cityId, null);
  assert.equal(writes[0].data.sectorId, null);
});

test("derived parent scope cannot conceal an out-of-scope sector", async () => {
  assert.equal((await create({ role: "SECTOR_ADMIN", cityId: null, mahalliId: null, sectorId: "s2" })).status, 403);
  assert.equal(writes.length, 0);
});

test("unscoped admins never gain access through null equality", () => {
  for (const role of ["CITY_ADMIN", "MAHALLI_ADMIN", "SECTOR_ADMIN"] as const) {
    assert.equal(canCreateUserRole({ ...actor, role, cityId: null, mahalliId: null, sectorId: null }, "MUSYRIF", { cityId: null, mahalliId: null, sectorId: null }), false);
  }
});


test("Musyrif requires explicit city and clears legacy lower scope", async () => {
  assert.equal((await create({ cityId: null })).status, 400);
  assert.equal(writes.length, 0);
  assert.equal((await create({ cityId: "c1", mahalliId: "m2", sectorId: "s2" })).status, 201);
  assert.equal(writes[0].data.cityId, "c1");
  assert.equal(writes[0].data.mahalliId, null);
  assert.equal(writes[0].data.sectorId, null);
});
test("Musyrif outside city rejected and lower admins do not gain city-wide user management", async () => {
  assert.equal((await create({ cityId: "c2" })).status, 403);
  for (const role of ["MAHALLI_ADMIN", "SECTOR_ADMIN"] as const) {
    actor = { ...actor, role, mahalliId: "m1", sectorId: "s1" };
    assert.equal((await create()).status, 403);
  }
  assert.equal(writes.length, 0);
});

test("legacy lower scope cannot grant management of a city-owned Musyrif account", () => {
  for (const role of ["MAHALLI_ADMIN", "SECTOR_ADMIN"] as const) {
    assert.equal(canCreateUserRole({ ...actor, role, mahalliId: "m1", sectorId: "s1" }, "MUSYRIF", { cityId: "c1", mahalliId: "m1", sectorId: "s1" }), false);
  }
});
