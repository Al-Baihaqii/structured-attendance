import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { validateTestDatabaseUrl } from "../tests/integration/helpers/environment";

const require = createRequire(import.meta.url);
function main() {
  const url = validateTestDatabaseUrl(process.env.TEST_DATABASE_URL);
  const env: NodeJS.ProcessEnv = { ...process.env, TEST_DATABASE_URL: url, DATABASE_URL: url, DIRECT_URL: url,
    NODE_ENV: "test", INTEGRATION_TEST_RUN: "1" };
  // Existing environment values take precedence over Prisma's dotenv loading.
  // Never invoke migrate reset, db push, or the application seed.
  const migration = spawnSync(process.execPath, [require.resolve("prisma/build/index.js"),
    "migrate", "deploy"], { env, cwd: process.cwd(), encoding: "utf8" });
  if (migration.error || migration.status !== 0) {
    throw new Error("Integration migrations failed. Output withheld to avoid exposing connection credentials.");
  }
  console.log("Integration migrations applied.");
  const files = readdirSync("tests/integration").filter(name => name.endsWith(".test.ts"))
    .sort().map(name => resolve("tests/integration", name));
  if (!files.length) throw new Error("No integration tests found.");
  const result = spawnSync(process.execPath, ["--import", "tsx", "--test", "--test-concurrency=1", ...files],
    { env, stdio: "inherit" });
  if (result.error) throw new Error("Unable to start integration tests.");
  process.exitCode = result.status ?? 1;
}
try { main(); } catch (error) {
  console.error(error instanceof Error ? error.message : "Integration test setup failed.");
  process.exitCode = 1;
}

