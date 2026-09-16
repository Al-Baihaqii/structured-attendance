import assert from "node:assert/strict";
import test from "node:test";
import { validateTestDatabaseUrl } from "./integration/helpers/environment";

const safe = "postgresql://structured_attendance_test:fixture-password@127.0.0.1:55432/structured_attendance_test";
test("integration target guard accepts the dedicated local target", () => {
  assert.equal(validateTestDatabaseUrl(safe), safe);
});
test("integration target guard fails closed", () => {
  for (const value of [undefined, "", "invalid", safe.replace("127.0.0.1", "db.example.com"),
    safe.replace("/structured_attendance_test", "/production"),
    safe.replace("structured_attendance_test:", "postgres:"),
    safe + "?host=remote.example.com", safe + "#fragment", safe.replace("postgresql:", "https:")]) {
    assert.throws(() => validateTestDatabaseUrl(value));
  }
});
