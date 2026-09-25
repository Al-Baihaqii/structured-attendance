import assert from "node:assert/strict";
import test from "node:test";
import { bootstrapProductionAdmin, assertSeedMode } from "../prisma/production-bootstrap";
const input = { username: "admin", name: "Admin", password: "safe-password" };
test("production explicitly refuses demo seed", () => {
  assert.throws(() => assertSeedMode({ NODE_ENV: "production", SEED_DEMO_DATA: "true" }));
  assert.doesNotThrow(() => assertSeedMode({ NODE_ENV: "production", SEED_DEMO_DATA: "false" }));
});
test("bootstrap never overwrites, reactivates, or resets existing accounts", async () => {
  for (const override of [{ role: "MUSYRIF" }, { isActive: false }, { cityId: "c1" }]) {
    const existing = { id: "u1", username: "admin", role: "SUPER_ADMIN", isActive: true, cityId: null, ...override };
    const before = structuredClone(existing);
    const db = { user: { findUnique: async () => existing } } as any;
    await assert.rejects(bootstrapProductionAdmin(db, input)); assert.deepEqual(existing, before);
  }
  const existing = { id: "u1", username: "admin", role: "SUPER_ADMIN", isActive: true, cityId: null, passwordHash: "unchanged", sessionVersion: 7 };
  const db = { user: { findUnique: async () => existing } } as any;
  assert.equal(await bootstrapProductionAdmin(db, input), existing);
  assert.equal(existing.passwordHash, "unchanged"); assert.equal(existing.sessionVersion, 7);
});
test("bootstrap creates a new global admin using create only", async () => {
  let created: any;
  const db = { user: { findUnique: async () => null, create: async ({ data }: any) => { created = data; return { id: "u1", username: data.username }; } } } as any;
  await bootstrapProductionAdmin(db, input);
  assert.equal(created.role, "SUPER_ADMIN"); assert.equal(created.cityId, null); assert.equal(created.mahalliId, null); assert.equal(created.sectorId, null);
  assert.notEqual(created.passwordHash, input.password);
});
test("bootstrap fails a concurrent username collision without an update fallback", async () => {
  const db = { user: { findUnique: async () => null, create: async () => { throw new Error("unique collision"); } } } as any;
  await assert.rejects(bootstrapProductionAdmin(db, input));
});
