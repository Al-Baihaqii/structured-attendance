// No Prisma/application imports: validate before any client can be constructed.
export function validateTestDatabaseUrl(value: string | undefined) {
  if (!value) throw new Error("TEST_DATABASE_URL is required; no DATABASE_URL fallback is allowed.");
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("Invalid TEST_DATABASE_URL."); }
  if (!["postgres:", "postgresql:"].includes(url.protocol)
    || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    || url.pathname !== "/structured_attendance_test"
    || url.username !== "structured_attendance_test"
    || !url.password || url.search || url.hash) {
    throw new Error("Test database must use loopback, database/user structured_attendance_test, a password, and no query parameters or fragment.");
  }
  return value;
}

export function assertIntegrationEnvironment() {
  const url = validateTestDatabaseUrl(process.env.TEST_DATABASE_URL);
  if (process.env.INTEGRATION_TEST_RUN !== "1" || process.env.NODE_ENV !== "test"
    || process.env.DATABASE_URL !== url || process.env.DIRECT_URL !== url) {
    throw new Error("Run integration tests through npm run test:integration.");
  }
  return url;
}
