import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { createRequire } from "node:module";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { SessionUser } from "../src/lib/types";

// tsx uses the project's preserved JSX with a classic transform in these tests.
(globalThis as typeof globalThis & { React: typeof React }).React = React;
const require = createRequire(import.meta.url);
let user: SessionUser | null;
let queries: any[];
const prismaPath = require.resolve("../src/lib/prisma");
require(prismaPath);
require.cache[prismaPath]!.exports = { prisma: {
  activityLog: { findMany: async (args: any) => {
    queries.push(args);
    assert.equal(user?.role, "SUPER_ADMIN");
    assert.ok(args.select);
    assert.equal("include" in args, false);
    assert.equal("metadata" in args.select, false);
    return [{ id: "log1", description: "Visible audit entry", entityType: "ATTENDANCE_SESSION", createdAt: new Date("2026-09-01"), actor: { name: "Admin", role: "SUPER_ADMIN" } }];
  } },
  group: { findMany: async () => [], count: async () => 0 },
  user: { count: async () => 0 },
  city: { count: async () => 0 },
  member: { count: async () => 0 },
} };
const authPath = require.resolve("../src/lib/auth");
require(authPath);
require.cache[authPath]!.exports = { getSession: async () => user };
const navigationPath = require.resolve("next/navigation");
const navigation = require(navigationPath);
require.cache[navigationPath]!.exports = { ...navigation, usePathname: () => "/dashboard", useRouter: () => ({ push() {}, refresh() {} }) };
const ActivityLogsPage = require("../src/app/dashboard/activity-logs/page").default as typeof import("../src/app/dashboard/activity-logs/page").default;
const DashboardPage = require("../src/app/dashboard/page").default as typeof import("../src/app/dashboard/page").default;
const { DashboardShell } = require("../src/components/dashboard-shell") as typeof import("../src/components/dashboard-shell");
beforeEach(() => {
  queries = [];
  user = { userId: "u1", username: "tester", name: "Tester", role: "SUPER_ADMIN", cityId: "c1", mahalliId: "m1", sectorId: "s1", sessionVersion: 0 };
});
for (const role of ["CITY_ADMIN", "MAHALLI_ADMIN", "SECTOR_ADMIN", "MUSYRIF"] as const) {
  test(`${role} is rejected by log page before querying`, async () => {
    user!.role = role;
    await assert.rejects(ActivityLogsPage(), (error: any) => error.digest === "NEXT_HTTP_ERROR_FALLBACK;404");
    assert.equal(queries.length, 0);
  });
  test(`${role} dashboard neither queries nor renders logs and navigation is hidden`, async () => {
    user!.role = role;
    const html = renderToStaticMarkup(await DashboardPage());
    assert.equal(queries.length, 0);
    assert.equal(html.includes("Aktivitas terakhir"), false);
    assert.equal(html.includes("Visible audit entry"), false);
    const shell = renderToStaticMarkup(React.createElement(DashboardShell, { user: user!, children: null }));
    assert.equal(shell.includes('href="/dashboard/activity-logs"'), false);
  });
}
test("no session cannot query ActivityLog from either page", async () => {
  user = null;
  assert.equal(await ActivityLogsPage(), null);
  assert.equal(await DashboardPage(), null);
  assert.equal(queries.length, 0);
});
test("SUPER_ADMIN can read both views with explicit field allowlists excluding metadata", async () => {
  const logHtml = renderToStaticMarkup(await ActivityLogsPage());
  const dashboardHtml = renderToStaticMarkup(await DashboardPage());
  assert.ok(logHtml.includes("Visible audit entry"));
  assert.ok(dashboardHtml.includes("Visible audit entry"));
  assert.ok(dashboardHtml.includes("Aktivitas terakhir"));
  assert.equal(queries.length, 2);
  assert.deepEqual(queries[0], { select: { id: true, description: true, entityType: true, createdAt: true, actor: { select: { name: true, role: true } } }, orderBy: { createdAt: "desc" }, take: 100 });
  assert.deepEqual(queries[1], { select: { id: true, description: true, createdAt: true, actor: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 5 });
  const shell = renderToStaticMarkup(React.createElement(DashboardShell, { user: user!, children: null }));
  assert.ok(shell.includes('href="/dashboard/activity-logs"'));
});
