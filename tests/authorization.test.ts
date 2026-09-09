import assert from "node:assert/strict";
import test from "node:test";
import { canManageGroup, canViewGroup, getAccessibleGroupsWhere } from "../src/lib/authorization";
import type { SessionUser } from "../src/lib/types";

const user = (overrides: Partial<SessionUser>): SessionUser => ({
  userId: "u-1",
  username: "tester",
  name: "Tester",
  role: "MUSYRIF",
  cityId: "city-1",
  mahalliId: "mahalli-1",
  sectorId: "sector-1",
  sessionVersion: 0,
  ...overrides,
});

const group = (overrides: Record<string, unknown> = {}) => ({
  id: "g-1",
  sectorId: "sector-1",
  sector: { mahalliId: "mahalli-1", mahalli: { cityId: "city-1" } },
  ...overrides,
});

test("MUSYRIF cannot create or manage a group", () => {
  assert.equal(canManageGroup(user({ role: "MUSYRIF" }), group()), false);
});

test("SECTOR_ADMIN can manage a group only inside their sector", () => {
  const admin = user({ role: "SECTOR_ADMIN", sectorId: "sector-1" });
  assert.equal(canManageGroup(admin, group()), true);
  assert.equal(canManageGroup(admin, group({ sectorId: "sector-2" })), false);
});

test("CITY_ADMIN cannot access another city", () => {
  const admin = user({ role: "CITY_ADMIN", cityId: "city-1" });
  assert.equal(canViewGroup(admin, group()), true);
  assert.equal(canViewGroup(admin, group({ sector: { mahalliId: "mahalli-2", mahalli: { cityId: "city-2" } } })), false);
});

test("SUPER_ADMIN can access and manage all groups", () => {
  const admin = user({ role: "SUPER_ADMIN", cityId: null, mahalliId: null, sectorId: null });
  assert.equal(canViewGroup(admin, group({ sectorId: "other" })), true);
  assert.equal(canManageGroup(admin, group({ sectorId: "other" })), true);
  assert.deepEqual(getAccessibleGroupsWhere(admin), {});
});

test("MUSYRIF group query is limited to assigned groups", () => {
  const musyrif = user({ role: "MUSYRIF", userId: "musyrif-1" });
  assert.deepEqual(getAccessibleGroupsWhere(musyrif), { userGroups: { some: { userId: "musyrif-1" } } });
});