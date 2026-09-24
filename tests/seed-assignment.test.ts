import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { ensureSeedAssignment } from "../prisma/seed-assignment";
let tenures: any[];
let user: any;
let group: any;
let locks: string[];
let creates: number;
const tx: any = {
  $queryRaw: async (sql: TemplateStringsArray, id: string) => {
    const table = sql.join("?").includes('FROM "Group"') ? "Group" : "User";
    assert.match(sql.join("?"), /FOR UPDATE/);
    locks.push(table);
    assert.equal(id, table === "Group" ? "g1" : "u1");
    return [];
  },
  group: { findUnique: async () => { assert.deepEqual(locks.slice(-2), ["Group", "User"]); return group; } },
  user: { findUnique: async () => user },
  groupAssignment: {
    findMany: async ({ where }: any) => tenures.filter(t => t.groupId === where.groupId && t.endedAt === null),
    create: async ({ data }: any) => { creates++; const row = { id: `t${creates}`, endedAt: null, ...data }; tenures.push(row); return row; },
  },
};
beforeEach(() => {
  tenures = []; locks = []; creates = 0;
  user = { id: "u1", role: "MUSYRIF", isActive: true, cityId: "c1", mahalliId: null, sectorId: null };
  group = { id: "g1", status: "ACTIVE", sector: { mahalli: { cityId: "c1" } } };
});
test("seed creates an authoritative tenure and is idempotent on rerun", async () => {
  const first = await ensureSeedAssignment(tx, "g1", "u1");
  const second = await ensureSeedAssignment(tx, "g1", "u1");
  assert.equal(first.id, second.id); assert.equal(creates, 1); assert.equal(tenures.length, 1);
});
test("seed retains closed tenures when creating a new assignment", async () => {
  const old = { id: "closed", groupId: "g1", musyrifId: "u1", endedAt: new Date() };
  tenures = [old];
  await ensureSeedAssignment(tx, "g1", "u1");
  assert.deepEqual(tenures[0], old); assert.equal(tenures.length, 2);
});
test("seed never replaces another active Musyrif", async () => {
  tenures = [{ id: "other", groupId: "g1", musyrifId: "u2", endedAt: null }];
  await assert.rejects(ensureSeedAssignment(tx, "g1", "u1"));
  assert.equal(creates, 0); assert.equal(tenures[0].musyrifId, "u2");
});
for (const invalid of [{ cityId: null }, { cityId: "other" }, { mahalliId: "h1" }, { sectorId: "s1" }, { isActive: false }, { role: "CITY_ADMIN" }]) {
  test(`seed rejects invalid Musyrif ${JSON.stringify(invalid)}`, async () => {
    Object.assign(user, invalid);
    await assert.rejects(ensureSeedAssignment(tx, "g1", "u1"));
    assert.equal(creates, 0);
  });
}
