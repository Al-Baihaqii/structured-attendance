import assert from "node:assert/strict";
import test from "node:test";
import { meetingSchema } from "../src/lib/validators";
import { assertMeetingAccess } from "../src/lib/authorization";
import type { SessionUser } from "../src/lib/types";

test("meeting requires a positive database integer and a valid calendar date", () => {
  for (const meetingNumber of [0, -1, 1.5, 2147483648, "1", null, true]) {
    assert.equal(meetingSchema.safeParse({ meetingNumber, date: "2026-09-11" }).success, false);
  }
  for (const date of [undefined, null, "", "2026-02-29", "2026-04-31", "invalid"]) {
    assert.equal(meetingSchema.safeParse({ meetingNumber: 1, date }).success, false);
  }
  assert.equal(meetingSchema.safeParse({ meetingNumber: 1, date: "2024-02-29" }).success, true);
});

test("meeting notes are optional and limited to 1000 characters", () => {
  const input = { meetingNumber: 1, date: "2026-09-11" };
  assert.equal(meetingSchema.safeParse(input).success, true);
  assert.equal(meetingSchema.safeParse({ ...input, notes: "a".repeat(1000) }).success, true);
  assert.equal(meetingSchema.safeParse({ ...input, notes: "a".repeat(1001) }).success, false);
});

test("meeting access allows assigned musyrif and rejects unassigned musyrif", () => {
  const user: SessionUser = { userId: "u-1", username: "tester", name: "Tester", role: "MUSYRIF", cityId: null, mahalliId: null, sectorId: null, sessionVersion: 0 };
  const group = { id: "g-1", sectorId: "s-1", userGroups: [{ userId: "u-1" }] };
  assert.doesNotThrow(() => assertMeetingAccess(user, group));
  assert.throws(() => assertMeetingAccess(user, { ...group, userGroups: [] }));
});
