import assert from "node:assert/strict";
import test from "node:test";
import { attendanceBatchSchema, attendanceRecordSchema } from "../src/lib/validators";

test("Izin and Alpa require a nonblank reason", () => {
  for (const status of ["IZIN", "ALPA"]) {
    for (const reason of [undefined, "", "   "]) {
      assert.equal(attendanceRecordSchema.safeParse({ memberId: "m-1", status, reason }).success, false);
    }
    assert.equal(attendanceRecordSchema.parse({ memberId: "m-1", status, reason: "  Keperluan keluarga  " }).reason, "Keperluan keluarga");
  }
});

test("Hadir and Sakit accept omitted, empty, or supplied reasons", () => {
  for (const status of ["HADIR", "SAKIT"]) {
    for (const reason of [undefined, "", "   ", "Catatan"]) {
      assert.equal(attendanceRecordSchema.safeParse({ memberId: "m-1", status, reason }).success, true);
    }
  }
});

test("batch rejects invalid statuses, duplicate members, and malformed input", () => {
  const record = { memberId: "m-1", status: "HADIR" };
  for (const input of [null, {}, { records: [] }, { records: [record, record] }, { records: [record, { ...record, memberId: " m-1 " }] }, { records: [{ ...record, status: "" }] }, { records: [{ ...record, status: "OTHER" }] }, { records: [{ ...record, memberId: " " }] }, { records: [{ ...record, reason: 1 }] }]) {
    assert.equal(attendanceBatchSchema.safeParse(input).success, false);
  }
});

test("batch validates every row and accepts mixed attendance statuses", () => {
  const records = [
    { memberId: "m-1", status: "HADIR" },
    { memberId: "m-2", status: "IZIN", reason: "Keperluan keluarga" },
    { memberId: "m-3", status: "SAKIT" },
    { memberId: "m-4", status: "ALPA", reason: "Tidak memberi kabar" },
  ];
  assert.equal(attendanceBatchSchema.safeParse({ records }).success, true);
  const result = attendanceBatchSchema.safeParse({ records: [...records, { memberId: "m-5", status: "ALPA" }] });
  assert.equal(result.success, false);
  if (!result.success) assert.deepEqual(result.error.issues[0].path, ["records", 4, "reason"]);
});
