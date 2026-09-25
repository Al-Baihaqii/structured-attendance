import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { createRequire } from "node:module";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

(globalThis as any).React = React;
const require = createRequire(import.meta.url);
let groups: any[], user: any, queries: any[];
function scoped(where: any) {
  queries.push(where);
  assert.deepEqual(where.assignments.some, { musyrifId: "u1", endedAt: null });
  assert.equal(where.sector.mahalli.cityId, "c1");
  return groups.filter(g => g.status !== where.status?.not && g.sector.mahalli.cityId === where.sector.mahalli.cityId
    && g.assignments.some((a: any) => a.musyrifId === where.assignments.some.musyrifId && a.endedAt === where.assignments.some.endedAt));
}
const path = require.resolve("../src/lib/prisma"); require(path);
require.cache[path]!.exports = { prisma: {
  group: {
    findMany: async ({ where, take }: any) => scoped(where).slice(0, take),
    count: async ({ where }: any) => scoped(where).length,
    findUnique: async ({ where }: any) => groups.find(g => g.id === where.id),
  },
  member: { count: async ({ where }: any) => scoped(where.group).reduce((n, g) => n + g.members.length, 0) },
  user: { count: async () => 1 }, city: { count: async () => 1 },
  sector: { findMany: async () => [] },
} };
const auth = require.resolve("../src/lib/auth"); require(auth);
require.cache[auth]!.exports = { getSession: async () => user, requireAuth: async () => user };
const Dashboard = require("../src/app/dashboard/page").default;
const GroupsPage = require("../src/app/dashboard/groups/page").default;
const groupList = require("../src/app/api/groups/route").GET;
const groupDetail = require("../src/app/api/groups/[id]/route").GET;
beforeEach(() => {
  user = { userId: "u1", role: "MUSYRIF", name: "Musyrif", cityId: "c1" };
  queries = [];
  groups = Array.from({ length: 7 }, (_, i) => ({ id: `g${i}`, name: `Group ${i}`, status: "ACTIVE", sectorId: "s1", members: [{ id: `m${i}` }],
    sector: { name: "Sektor", mahalliId: "h1", mahalli: { name: "Mahalli", cityId: "c1", city: { name: "Kota" } } },
    assignments: [{ id: `t${i}`, musyrifId: "u1", endedAt: null, musyrif: { name: "Musyrif" } }],
  }));
});
function findMetric(tree: any, label: string): any {
  if (!tree || typeof tree !== "object") return undefined;
  if (Array.isArray(tree)) return tree.map(t => findMetric(t, label)).find(Boolean);
  return tree.props?.label === label ? tree : findMetric(tree.props?.children, label);
}
test("dashboard count is not capped by its five-group preview", async () => {
  const tree = await Dashboard();
  assert.equal(findMetric(tree, "Total kelompok").props.value, 7);
  assert.equal(findMetric(tree, "Anggota aktif").props.value, 7);
  assert.equal((renderToStaticMarkup(tree).match(/href="\/dashboard\/groups\/g/g) || []).length, 5);
});
test("reassignment removes old group from dashboard, lists, counts, and direct API", async () => {
  groups[0].assignments[0].endedAt = new Date();
  groups[0].assignments.push({ id: "replacement", musyrifId: "u2", endedAt: null, musyrif: { name: "Replacement" } });
  const tree = await Dashboard();
  assert.equal(findMetric(tree, "Total kelompok").props.value, 6);
  assert.equal(findMetric(tree, "Anggota aktif").props.value, 6);
  assert.doesNotMatch(renderToStaticMarkup(tree), /Group 0/);
  assert.doesNotMatch(renderToStaticMarkup(await GroupsPage()), /Group 0/);
  assert.equal((await (await groupList()).json()).groups.some((g: any) => g.id === "g0"), false);
  const response = await groupDetail(new Request("http://localhost/api/groups/g0"), { params: Promise.resolve({ id: "g0" }) });
  assert.equal(response.status, 403);
  assert.ok(queries.length >= 5);
});
