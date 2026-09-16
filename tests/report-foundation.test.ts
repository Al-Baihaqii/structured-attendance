import assert from "node:assert/strict";
import test from "node:test";
import { getReportDateFilter } from "../src/lib/report-date-filter";
import { createReportContext } from "../src/lib/report-context";

test("UTC date-only filters include the entire end day across leap years and year boundaries", () => {
  for (const [to, next] of [["2024-02-29", "2024-03-01"], ["2026-12-31", "2027-01-01"]]) {
    const result = getReportDateFilter({ from: to, to });
    assert.equal(result.date.gte?.toISOString(), `${to}T00:00:00.000Z`);
    assert.equal(result.date.lt?.toISOString(), `${next}T00:00:00.000Z`);
  }
});
test("empty and open-ended periods retain all-time semantics", () => {
  assert.deepEqual(getReportDateFilter({ from: "", to: "" }).date, {});
  assert.equal(getReportDateFilter({ from: "2026-01-01" }).date.lt, undefined);
  assert.equal(getReportDateFilter({ to: "2026-01-01" }).date.gte, undefined);
});
test("invalid dates, arrays, and reversed periods are rejected", () => {
  for (const input of [{ from: "2026-02-29" }, { to: "invalid" }, { from: ["2026-01-01"] }, { from: "2026-02-01", to: "2026-01-01" }]) assert.throws(() => getReportDateFilter(input));
});
test("report context has stable semantics and serializable generation time", () => {
  assert.deepEqual(createReportContext({ from: "2026-01-01" }, new Date("2026-09-16T00:00:00Z")), {
    denominator: "RECORDED_ENTRIES", attribution: "CURRENT_HIERARCHY", generatedAt: "2026-09-16T00:00:00.000Z", period: { from: "2026-01-01", to: null },
  });
});
