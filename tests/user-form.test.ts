import assert from "node:assert/strict";
import test, { beforeEach, afterEach, mock } from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const React = require("react");
(globalThis as any).React = React;
let state: any[];
let cursor: number;
let payloads: any[];
let cities: any[];
let sectors: any[];
const navigationPath = require.resolve("next/navigation"); require(navigationPath);
require.cache[navigationPath]!.exports = { useRouter: () => ({ refresh() {} }) };
const { CreateUserForm } = require("../src/components/management-forms");
function nodes(tree: any, type: string): any[] {
  if (!tree || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap(child => nodes(child, type));
  return [...(tree.type === type ? [tree] : []), ...nodes(tree.props?.children, type)];
}
function render() { cursor = 0; return CreateUserForm({ cities, sectors }); }
function change(index: number, value: string) {
  nodes(render(), "select")[index].props.onChange({ target: { value } });
}
async function submit() { await render().props.onSubmit({ preventDefault() {} }); }
function selection() { return nodes(render(), "select").map(node => node.props.value); }
function optionIds(index: number) { return nodes(nodes(render(), "select")[index], "option").map(node => node.props.value); }
const sector = (id: string, mahalliId: string, cityId: string) => ({ id, name: id, mahalli: { id: mahalliId, name: mahalliId, city: { id: cityId, name: cityId } } });
beforeEach(() => {
  state = []; cursor = 0; payloads = [];
  cities = [{ id: "semarang", name: "Semarang", mahallis: [{ id: "m1", name: "Mahalli", sectors: [] }] },
    { id: "uat", name: "City UAT", mahallis: [{ id: "mu", name: "mahalli UAT", sectors: [] }, { id: "m2", name: "Other", sectors: [] }] },
    { id: "empty", name: "Empty", mahallis: [] }];
  // Global ordering intentionally differs from the first selected city's hierarchy.
  sectors = [sector("su", "mu", "uat"), sector("s1", "m1", "semarang"), sector("s2", "m2", "uat")];
  mock.method(React, "useState", (initial: any) => {
    const index = cursor++;
    if (!(index in state)) state[index] = typeof initial === "function" ? initial() : initial;
    return [state[index], (value: any) => { state[index] = typeof value === "function" ? value(state[index]) : value; }];
  });
  mock.method(globalThis, "fetch", async (_url: any, options: any) => {
    payloads.push(JSON.parse(options.body));
    return new Response("{}", { status: 201 });
  });
});
afterEach(() => mock.restoreAll());

test("initial selection uses a sector belonging to the selected city and Mahalli", async () => {
  change(0, "SECTOR_ADMIN");
  assert.deepEqual(selection(), ["SECTOR_ADMIN", "semarang", "m1", "s1"]);
  await submit();
  assert.deepEqual([payloads[0].cityId, payloads[0].mahalliId, payloads[0].sectorId], ["semarang", "m1", "s1"]);
});
for (const role of ["SECTOR_ADMIN"]) {
  test(`${role}: changing to UAT clears dependents and submits matching IDs`, async () => {
    change(0, role); change(1, "uat");
    assert.deepEqual(selection(), [role, "uat", "", ""]);
    assert.deepEqual(optionIds(3), [""]);
    assert.equal(nodes(render(), "button")[0].props.disabled, true);
    await submit(); assert.equal(payloads.length, 0);
    change(2, "mu");
    assert.deepEqual(optionIds(3), ["", "su"]);
    change(3, "su"); await submit();
    assert.deepEqual([payloads[0].cityId, payloads[0].mahalliId, payloads[0].sectorId], ["uat", "mu", "su"]);
    change(2, "m2");
    assert.equal(selection()[3], "");
    assert.deepEqual(optionIds(3), ["", "s2"]);
    await submit(); assert.equal(payloads.length, 1);
  });
}
test("empty city and empty Mahalli never offer sectors from other parents", async () => {
  change(0, "SECTOR_ADMIN"); change(1, "empty");
  assert.deepEqual(optionIds(2), [""]);
  assert.deepEqual(optionIds(3), [""]);
  await submit(); assert.equal(payloads.length, 0);
  change(1, "uat"); change(2, "mu");
  sectors = sectors.filter(item => item.id !== "su");
  assert.deepEqual(optionIds(3), [""]);
  await submit(); assert.equal(payloads.length, 0);
});
test("removed hierarchy options cannot submit stale IDs", async () => {
  change(0, "SECTOR_ADMIN"); sectors = [];
  assert.equal(selection()[3], "");
  await submit(); assert.equal(payloads.length, 0);
});
test("role switches keep valid hierarchy and omit scope not required by the role", async () => {
  change(0, "CITY_ADMIN"); await submit();
  assert.deepEqual([payloads[0].cityId, payloads[0].mahalliId, payloads[0].sectorId], ["semarang", null, null]);
  change(0, "SUPER_ADMIN"); await submit();
  assert.deepEqual([payloads[1].cityId, payloads[1].mahalliId, payloads[1].sectorId], [null, null, null]);
  change(0, "SECTOR_ADMIN");
  assert.deepEqual(selection(), ["SECTOR_ADMIN", "semarang", "m1", "s1"]);
});

test("Musyrif form requests only city and sends null lower-level scope", async () => {
  change(1, "uat");
  assert.deepEqual(selection(), ["MUSYRIF", "uat"]);
  await submit();
  assert.deepEqual([payloads[0].cityId, payloads[0].mahalliId, payloads[0].sectorId], ["uat", null, null]);
});
