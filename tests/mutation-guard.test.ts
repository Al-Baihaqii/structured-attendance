import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { createRequire } from "node:module";
import { HttpError } from "../src/lib/http-error";
const require = createRequire(import.meta.url);
process.env.APP_ORIGIN = "https://attendance.example";
let accesses = 0, sessions = 0;
const path = require.resolve("../src/lib/prisma"); require(path);
require.cache[path]!.exports = { prisma: new Proxy({}, { get() { accesses++; throw new Error("Unexpected database access"); } }) };
const auth = require.resolve("../src/lib/auth"); require(auth);
require.cache[auth]!.exports = { requireAuth: async () => { accesses++; throw new HttpError("Sesi tidak valid.", 401); }, clearSession: async () => { sessions++; }, createSession: async () => { sessions++; } };
const routePaths = ["auth/login", "auth/logout", "hierarchy", "users", "users/[id]", "groups", "groups/[id]", "groups/[id]/assignment", "groups/[id]/members", "groups/[id]/sessions", "groups/[id]/sessions/[sessionId]/attendance", "members/[id]"];
beforeEach(() => { accesses = 0; sessions = 0; });
for (const routePath of routePaths) {
  const route = require(`../src/app/api/${routePath}/route`);
  for (const method of ["POST", "PATCH", "DELETE"]) if (route[method]) {
    test(`${method} ${routePath} rejects foreign origin before auth/database/session changes`, async () => {
      const response = await route[method](new Request("https://attendance.example/test", { method, headers: { origin: "https://evil.example", "content-type": "application/json" }, body: "{}" }), { params: Promise.resolve({ id: "g1", sessionId: "s1" }) });
      assert.equal(response.status, 403); assert.equal(accesses, 0); assert.equal(sessions, 0);
    });
    if (method !== "DELETE" && routePath !== "auth/logout") test(`${method} ${routePath} rejects non-JSON before auth/database`, async () => {
      const response = await route[method](new Request("https://attendance.example/test", { method, headers: { origin: "https://attendance.example", "content-type": "text/plain" }, body: "{}" }), { params: Promise.resolve({ id: "g1", sessionId: "s1" }) });
      assert.equal(response.status, 415); assert.equal(accesses, 0);
    });
  }
}
test("same-origin bodyless logout clears session", async () => {
  const route = require("../src/app/api/auth/logout/route");
  assert.equal((await route.POST(new Request("https://attendance.example/logout", { method: "POST", headers: { origin: "https://attendance.example" } }))).status, 200);
  assert.equal(sessions, 1);
});
