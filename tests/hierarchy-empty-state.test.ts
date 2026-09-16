import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { createRequire } from "node:module";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

(globalThis as typeof globalThis & { React: typeof React }).React = React;
const require = createRequire(import.meta.url);
let user: any;
let cities: any[];
let forms: { type: string; parentId?: string }[];
let query: any;
const prismaPath = require.resolve("../src/lib/prisma"); require(prismaPath);
require.cache[prismaPath]!.exports = { prisma: { city: { findMany: async (args: any) => { query = args; return cities; } } } };
const authPath = require.resolve("../src/lib/auth"); require(authPath);
require.cache[authPath]!.exports = { getSession: async () => user };
const formPath = require.resolve("../src/components/management-forms"); require(formPath);
require.cache[formPath]!.exports = { CreateHierarchyForm: (props: any) => { forms.push({ type: props.type, parentId: props.parentId }); return React.createElement("form"); } };
const Page = require("../src/app/dashboard/wilayah/page").default;
const render = async () => renderToStaticMarkup(await Page());
beforeEach(() => { user = { role: "SUPER_ADMIN", cityId: "c1" }; cities = []; forms = []; query = undefined; });
test("empty database offers the first city form", async () => {
  assert.match(await render(), /Belum ada kota yang tersedia/);
  assert.deepEqual(forms, [{ type: "city", parentId: undefined }]);
});
test("empty cities offer one Mahalli form each", async () => {
  cities = [{ id: "j", name: "Jakarta", mahallis: [] }, { id: "y", name: "Jogja", mahallis: [] }];
  assert.match(await render(), /Belum ada Mahalli di kota ini/);
  assert.deepEqual(forms, [{ type: "city", parentId: undefined }, { type: "mahalli", parentId: "j" }, { type: "mahalli", parentId: "y" }]);
});
function populated() {
  return [{ id: "c1", name: "Semarang", mahallis: [
    { id: "h1", name: "Semarang Barat", sectors: [{ id: "s1", name: "Kalibanteng", _count: { groups: 3 } }, { id: "s2", name: "Sektor lain", _count: { groups: 0 } }] },
    { id: "h2", name: "Mahalli baru", sectors: [] },
  ] }];
}
test("populated Semarang and empty Mahalli render with one form per parent", async () => {
  cities = populated();
  const html = await render();
  for (const text of ["Semarang Barat", "Kalibanteng", "3 kelompok", "Belum ada Sektor di Mahalli ini"]) assert.ok(html.includes(text));
  assert.deepEqual(forms, [{ type: "city", parentId: undefined }, { type: "mahalli", parentId: "c1" }, { type: "sector", parentId: "h1" }, { type: "sector", parentId: "h2" }]);
});
for (const [role, types] of [
  ["CITY_ADMIN", ["mahalli", "sector", "sector"]],
  ["MAHALLI_ADMIN", ["sector", "sector"]],
  ["SECTOR_ADMIN", []], ["MUSYRIF", []],
] as const) {
  test(`${role} retains existing controls and city query scope`, async () => {
    user.role = role; cities = populated(); await render();
    assert.deepEqual(forms.map(f => f.type), types);
    assert.deepEqual(query.where, { id: "c1", isActive: true });
  });
}
test("CITY_ADMIN can create the first Mahalli but not a city", async () => {
  user.role = "CITY_ADMIN"; cities = [{ id: "c1", name: "Jakarta", mahallis: [] }];
  await render(); assert.deepEqual(forms, [{ type: "mahalli", parentId: "c1" }]);
});
test("unauthenticated access performs no query or rendering", async () => {
  user = null; assert.equal(await Page(), null); assert.equal(query, undefined); assert.deepEqual(forms, []);
});
