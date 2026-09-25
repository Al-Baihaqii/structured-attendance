import assert from "node:assert/strict";
import test, { beforeEach, afterEach, mock } from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const React = require("react");
(globalThis as any).React = React;
let state: any[], cursor: number, payloads: any[], refreshes: number, failure: boolean;
let finish: (() => void) | undefined;
const navigationPath = require.resolve("next/navigation"); require(navigationPath);
require.cache[navigationPath]!.exports = { useRouter: () => ({ refresh() { refreshes++; } }) };
const { MeetingAttendanceForm } = require("../src/components/meeting-attendance-form");
function nodes(tree: any, type: string): any[] {
  if (!tree || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap(child => nodes(child, type));
  return [...(tree.type === type ? [tree] : []), ...nodes(tree.props?.children, type)];
}
function render() { cursor = 0; return MeetingAttendanceForm({ groupId: "g1", nextMeetingNumber: 18, members: [{ id: "m1", name: "One" }, { id: "m2", name: "Two" }] }); }
function change(type: string, id: string, value: string) { nodes(render(), type).find(node => node.props.id === id).props.onChange({ target: { value } }); }
const submit = () => render().props.onSubmit({ preventDefault() {} });
beforeEach(() => {
  state = []; cursor = 0; payloads = []; refreshes = 0; failure = false; finish = undefined;
  mock.method(React, "useState", (initial: any) => {
    const index = cursor++;
    if (!(index in state)) state[index] = typeof initial === "function" ? initial() : initial;
    return [state[index], (value: any) => { state[index] = typeof value === "function" ? value(state[index]) : value; }];
  });
  mock.method(globalThis, "fetch", async (url: any, options: any) => {
    assert.equal(url, "/api/groups/g1/sessions"); assert.equal(options.method, "POST");
    payloads.push(JSON.parse(options.body));
    await new Promise<void>(resolve => { finish = resolve; });
    return new Response(JSON.stringify(failure ? { error: "Gagal menyimpan." } : { session: { meetingNumber: 18 } }), { status: failure ? 500 : 201 });
  });
});
afterEach(() => mock.restoreAll());
test("combined form submits selected attendance once, disables during save, refreshes and clears on success", async () => {
  assert.equal(nodes(render(), "input")[0].props.readOnly, true);
  assert.equal(nodes(render(), "input")[0].props.value, 18);
  change("input", "meeting-date", "2026-09-25");
  change("textarea", "meeting-notes", "Materi");
  change("select", "new-status-m1", "IZIN");
  assert.equal(nodes(render(), "textarea").find(n => n.props.id === "new-reason-m1").props.required, true);
  await submit(); assert.equal(payloads.length, 0);
  change("textarea", "new-reason-m1", "Keperluan keluarga");
  const saving = submit();
  assert.equal(nodes(render(), "button")[0].props.disabled, true);
  await submit(); assert.equal(payloads.length, 1);
  assert.deepEqual(payloads[0], { date: "2026-09-25", notes: "Materi", records: [{ memberId: "m1", status: "IZIN", reason: "Keperluan keluarga" }] });
  finish!(); await saving;
  assert.equal(refreshes, 1);
  assert.equal(nodes(render(), "input")[1].props.value, "");
  assert.ok(nodes(render(), "select").every(n => n.props.value === ""));
});
test("failed combined save preserves date, notes and attendance without refresh", async () => {
  failure = true;
  change("input", "meeting-date", "2026-09-25"); change("textarea", "meeting-notes", "Materi");
  change("select", "new-status-m1", "HADIR");
  const saving = submit(); finish!(); await saving;
  assert.equal(refreshes, 0);
  assert.equal(nodes(render(), "input")[1].props.value, "2026-09-25");
  assert.equal(nodes(render(), "textarea")[0].props.value, "Materi");
  assert.equal(nodes(render(), "select")[0].props.value, "HADIR");
});
