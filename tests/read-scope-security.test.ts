import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { createRequire } from "node:module";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
(globalThis as any).React = React;
const require = createRequire(import.meta.url);
const navigationPath = require.resolve("next/navigation");
const navigation = require(navigationPath);
require.cache[navigationPath]!.exports = { ...navigation, useRouter: () => ({ refresh() {} }) };
let user: any, cities: any[], mahallis: any[], sectors: any[], groups: any[], users: any[];
let counts: Record<string, number>;
function matches(row: any, where: any): boolean {
  return Object.entries(where || {}).every(([key, value]: [string, any]) => {
    if (key === "not") return row !== value;
    if (row === undefined || row === null) return false;
    if (value && typeof value === "object") return value.some ? row[key].some((r: any) => matches(r, value.some)) : matches(row[key], value);
    return row[key] === value;
  });
}
const path = require.resolve("../src/lib/prisma"); require(path);
require.cache[path]!.exports = { prisma: {
  city: {
    findMany: async ({ where, include }: any) => cities.filter(c => matches(c, where)).map(c => ({ id: c.id, name: c.id, mahallis: c.mahallis.filter((h: any) => matches(h, include.mahallis.where)).map((h: any) => ({ id: h.id, name: h.id, sectors: h.sectors.filter((s: any) => matches(s, include.mahallis.include.sectors.where)).map((s: any) => ({ id: s.id, name: s.id, _count: { groups: s.groups.filter((g: any) => matches(g, include.mahallis.include.sectors.include?._count.select.groups.where)).length } })) })) })),
    count: async ({ where }: any) => counts.cities = cities.filter(c => matches(c, where)).length,
  },
  user: { count: async ({ where }: any) => counts.users = users.filter(u => matches(u, where)).length },
  group: { findMany: async () => [], count: async ({ where }: any) => counts.groups = groups.filter(g => matches(g, where)).length },
  member: { count: async () => 0 }, activityLog: { findMany: async () => [] },
} };
const auth = require.resolve("../src/lib/auth"); require(auth);
require.cache[auth]!.exports = { getSession: async () => user, requireAuth: async () => user };
const GET = require("../src/app/api/hierarchy/route").GET;
const Page = require("../src/app/dashboard/wilayah/page").default;
const Dashboard = require("../src/app/dashboard/page").default;
beforeEach(() => {
  user = { userId: "u1", name: "User", role: "SUPER_ADMIN", cityId: "c1", mahalliId: "h1", sectorId: "s1" };
  cities = ["c1", "c2"].map(id => ({ id, isActive: true }));
  mahallis = [1, 2, 3].map(i => ({ id: `h${i}`, cityId: i === 3 ? "c2" : "c1", isActive: true }));
  sectors = [1, 2, 3, 4].map(i => ({ id: `s${i}`, mahalliId: i < 3 ? "h1" : `h${i-1}`, isActive: true }));
  groups = sectors.map((s, i) => ({ id: `g${i}`, status: "ACTIVE", sectorId: s.id, sector: s, assignments: i < 2 ? [{ musyrifId: "u1", endedAt: i ? new Date() : null }] : [] }));
  for (const city of cities) city.mahallis = mahallis.filter(h => h.cityId === city.id);
  for (const h of mahallis) h.sectors = sectors.filter(s => s.mahalliId === h.id);
  for (const s of sectors) { s.mahalli = mahallis.find(h => h.id === s.mahalliId); s.groups = groups.filter(g => g.sectorId === s.id); }
  users = [{ id: "u1", cityId: "c1", mahalliId: null, sectorId: null }, ...sectors.map(s => ({ id: s.id, cityId: s.mahalli.cityId, mahalliId: s.mahalliId, sectorId: s.id }))];
  counts = {};
});
for (const [role, expected, userCount] of [["SUPER_ADMIN", ["s1", "s2", "s3", "s4"], 5], ["CITY_ADMIN", ["s1", "s2", "s3"], 4], ["MAHALLI_ADMIN", ["s1", "s2"], 2], ["SECTOR_ADMIN", ["s1"], 1], ["MUSYRIF", ["s1"], 1]] as const) {
  test(`${role}: hierarchy API/page and ancillary counts stay in actual scope`, async () => {
    user.role = role;
    const result = await (await GET()).json();
    assert.deepEqual(result.cities.flatMap((c: any) => c.mahallis.flatMap((h: any) => h.sectors.map((s: any) => s.id))), expected);
    const html = renderToStaticMarkup(await Page());
    for (const id of expected) assert.ok(html.includes(id));
    for (const s of sectors) if (!(expected as readonly string[]).includes(s.id)) assert.equal(html.includes(`>${s.id}<`), false);
    await Dashboard(); assert.equal(counts.users, userCount); assert.equal(counts.groups, expected.length);
    assert.equal(counts.cities, role === "SUPER_ADMIN" ? 2 : 1);
  });
}
test("former Musyrif sees no hierarchy/group counts; own account remains counted", async () => {
  user.role = "MUSYRIF"; groups[0].assignments[0].endedAt = new Date();
  assert.deepEqual((await (await GET()).json()).cities, []);
  await Dashboard(); assert.deepEqual(counts, { users: 1, cities: 0, groups: 0 });
});
test("missing administrative scope fails closed", async () => {
  for (const role of ["CITY_ADMIN", "MAHALLI_ADMIN", "SECTOR_ADMIN"]) {
    user = { ...user, role, cityId: null, mahalliId: null, sectorId: null };
    assert.deepEqual((await (await GET()).json()).cities, []);
    await Dashboard(); assert.equal(counts.users, 0); assert.equal(counts.groups, 0);
  }
});
