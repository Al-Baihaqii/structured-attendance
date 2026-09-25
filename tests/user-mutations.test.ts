import { mutationRequest } from "./helpers/request";
import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { createRequire } from "node:module";
import { Prisma } from "@prisma/client";

const require = createRequire(import.meta.url);
let users: any[];
let logs: any[];
let mode: string;
let transactions: number;
let hashes: string[];
let activeAssignments: number;
let actorRole: string;
let afterUserLock: (() => void) | undefined;
let lockEvents: string[];
const unexpected = async () => { throw new Error("Mutation must use tx"); };
const duplicate = (field: string) => new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
  code: "P2002", clientVersion: "6.19.0", meta: { target: [field] },
});
const prisma = {
  user: { create: unexpected, update: unexpected, findUnique: async ({ where }: any) => users.find(user => user.id === where.id) ?? null },
  activityLog: { create: unexpected },
  city: { findUnique: async ({ where }: any) => ({ id: where.id }) },
  sector: { findUnique: async ({ where }: any) => ({ id: where.id, mahalliId: "m1", mahalli: { cityId: where.id === "outside" ? "c2" : "c1" } }) },
  $transaction: async (run: any) => {
    transactions++;
    const draftUsers = structuredClone(users);
    const draftLogs = structuredClone(logs);
    const result = await run({
      $queryRaw: async (sql: TemplateStringsArray, id: string) => {
        assert.match(sql.join("?"), /FROM "User" WHERE "id" = \? FOR UPDATE/);
        assert.equal(id, "target"); lockEvents.push("user.lock"); afterUserLock?.(); return [];
      },
      groupAssignment: { count: async ({ where }: any) => {
        assert.deepEqual(where, { musyrifId: "target", endedAt: null });
        assert.ok(lockEvents.includes("user.lock")); return activeAssignments;
      } },
      user: {
        findUnique: async ({ where }: any) => where.id ? draftUsers.find(user => user.id === where.id) ?? null : mode === "existing" ? { id: "existing" } : null,
        update: async ({ where, data, select }: any) => {
          const user = draftUsers.find(user => user.id === where.id);
          assert.ok(user);
          for (const field of ["role", "cityId", "mahalliId", "sectorId"]) {
            if (field in where) assert.equal(where[field], user[field]);
          }
          for (const [key, value] of Object.entries(data)) {
            if (key === "sessionVersion") user.sessionVersion += (value as { increment: number }).increment;
            else if (value !== undefined) user[key] = value;
          }
          return Object.fromEntries(Object.entries(user).filter(([key]) => (!select || select[key])));
        },
        create: async ({ data, select }: any) => {
          if (mode === "race") throw duplicate("username");
          draftUsers.push({ id: "new", ...data });
          return Object.fromEntries(Object.entries(draftUsers.at(-1)).filter(([key]) => (!select || select[key])));
        },
      },
      activityLog: { create: async ({ data }: any) => {
        if (mode === "log") throw new Error("ActivityLog failure");
        if (mode === "other-unique") throw duplicate("id");
        draftLogs.push(data);
      } },
    });
    users = draftUsers;
    logs = draftLogs;
    return result;
  },
};
const prismaPath = require.resolve("../src/lib/prisma"); require(prismaPath);
require.cache[prismaPath]!.exports = { prisma };
const authPath = require.resolve("../src/lib/auth"); require(authPath);
require.cache[authPath]!.exports = {
  requireAuth: async () => ({ userId: "admin", role: actorRole, cityId: "c1" }),
  hashPassword: async (password: string) => { hashes.push(password); return "hashed-password"; },
};
const { POST } = require("../src/app/api/users/route");
const create = (overrides = {}) => POST(mutationRequest("http://localhost/api/users", {
  method: "POST", body: JSON.stringify({ username: "newuser", name: "New User", password: "password123", role: "MUSYRIF", cityId: "c1", sectorId: "s1", ...overrides }),
}));
beforeEach(() => { activeAssignments = 0; actorRole = "CITY_ADMIN"; afterUserLock = undefined; lockEvents = []; users = []; logs = []; mode = ""; transactions = 0; hashes = []; });

test("user creation commits the user and corresponding activity log", async () => {
  const response = await create();
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { user: { id: "new", username: "newuser", name: "New User", role: "MUSYRIF" } });
  assert.equal(transactions, 1);
  assert.deepEqual(hashes, ["password123"]);
  assert.equal(users[0].passwordHash, "hashed-password");
  assert.equal(users[0].cityId, "c1");
  assert.equal(users[0].mahalliId, null);
  assert.deepEqual(logs, [{ actorId: "admin", action: "CREATE", entityType: "USER", entityId: "new", description: "Membuat pengguna New User (MUSYRIF)." }]);
});
test("ActivityLog failure rolls back the created user", async () => {
  mode = "log";
  assert.equal((await create()).status, 500);
  assert.deepEqual(users, []);
  assert.deepEqual(logs, []);
});
for (const scenario of ["existing", "race"]) {
  test(`${scenario} duplicate username returns 409 without committed writes`, async () => {
    mode = scenario;
    const response = await create();
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { error: "Username sudah digunakan." });
    assert.deepEqual(users, []);
    assert.deepEqual(logs, []);
  });
}
test("unrelated unique failure is not reported as a duplicate username", async () => {
  mode = "other-unique";
  assert.notEqual((await create()).status, 409);
  assert.deepEqual(users, []);
  assert.deepEqual(logs, []);
});
test("unauthorized scope is rejected before hashing or transaction", async () => {
  assert.equal((await create({ cityId: "outside" })).status, 403);
  assert.equal(transactions, 0);
  assert.deepEqual(hashes, []);
  assert.deepEqual(users, []);
  assert.deepEqual(logs, []);
});

const { PATCH, DELETE } = require("../src/app/api/users/[id]/route");
const update = (body: object) => PATCH(mutationRequest("http://localhost/api/users/target", {
  method: "PATCH", body: JSON.stringify(body),
}), { params: Promise.resolve({ id: "target" }) });
const existingUser = () => ({ id: "target", username: "existing", name: "Existing User", email: null,
  role: "MUSYRIF", cityId: "c1", mahalliId: "m1", sectorId: "s1", isActive: true,
  passwordHash: "old-hash", sessionVersion: 3 });

for (const password of [undefined, "replacement123"]) {
  test(`user update commits one log and preserves password behavior (${password ? "password" : "profile"})`, async () => {
    users = [existingUser()];
    const response = await update({ name: "Updated User", password });
    assert.equal(response.status, 200);
    assert.equal(transactions, 1);
    assert.deepEqual(await response.json(), { user: { id: "target", username: "existing", name: "Updated User", role: "MUSYRIF", isActive: true } });
    assert.equal(users[0].passwordHash, password ? "hashed-password" : "old-hash");
    assert.equal(users[0].sessionVersion, password ? 4 : 3);
    assert.deepEqual(hashes, password ? [password] : []);
    assert.deepEqual(logs, [{ actorId: "admin", action: "UPDATE", entityType: "USER", entityId: "target", description: "Memperbarui pengguna Updated User." }]);
  });
}

test("update log failure rolls back profile, password, and sessionVersion", async () => {
  users = [existingUser()];
  const before = structuredClone(users);
  mode = "log";
  assert.equal((await update({ name: "Updated User", password: "replacement123" })).status, 500);
  assert.equal(transactions, 1);
  assert.deepEqual(users, before);
  assert.deepEqual(logs, []);
});


const deactivate = () => DELETE(mutationRequest("http://localhost/api/users/target", { method: "DELETE" }), { params: Promise.resolve({ id: "target" }) });
for (const input of [{ cityId: "c2" }, { role: "CITY_ADMIN" }]) {
  test(`active assignments block Musyrif change ${JSON.stringify(input)}`, async () => {
    actorRole = "SUPER_ADMIN"; activeAssignments = 2; users = [existingUser()];
    const before = structuredClone(users);
    const response = await update(input);
    assert.equal(response.status, 409);
    assert.equal((await response.json()).code, "USER_ACTIVE_ASSIGNMENTS");
    assert.deepEqual(users, before); assert.deepEqual(logs, []);
  });
}
test("active assignments block deactivation even for SUPER_ADMIN", async () => {
  actorRole = "SUPER_ADMIN"; activeAssignments = 1; users = [existingUser()];
  const before = structuredClone(users);
  assert.equal((await deactivate()).status, 409);
  assert.deepEqual(users, before); assert.deepEqual(logs, []);
});
test("profile/password updates remain available with active tenures and clear legacy lower scope", async () => {
  activeAssignments = 1; users = [existingUser()];
  assert.equal((await update({ name: "Changed", password: "password456" })).status, 200);
  assert.equal(users[0].mahalliId, null); assert.equal(users[0].sectorId, null);
  assert.equal(users[0].sessionVersion, 4); assert.equal(logs.length, 1);
});
test("assignment committed before user lock blocks a stale city change", async () => {
  actorRole = "SUPER_ADMIN"; users = [existingUser()];
  afterUserLock = () => { activeAssignments = 1; };
  assert.equal((await update({ cityId: "c2" })).status, 409);
  assert.equal(users[0].cityId, "c1"); assert.deepEqual(logs, []);
});
test("closed-only history permits city changes and deactivation without deleting history", async () => {
  actorRole = "SUPER_ADMIN"; users = [existingUser()];
  assert.equal((await update({ cityId: "c2" })).status, 200);
  assert.equal((await deactivate()).status, 200);
  assert.equal(users[0].isActive, false); assert.equal(users[0].sessionVersion, 4);
  const logCount = logs.length;
  assert.equal((await deactivate()).status, 200); assert.equal(logs.length, logCount);
});
test("deactivation log failure rolls back active state and session version", async () => {
  users = [existingUser()]; mode = "log";
  const before = structuredClone(users);
  assert.equal((await deactivate()).ok, false);
  assert.deepEqual(users, before); assert.deepEqual(logs, []);
});
