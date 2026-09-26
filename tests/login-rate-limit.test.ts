import assert from "node:assert/strict";
import test, { beforeEach, afterEach } from "node:test";
import { createRequire } from "node:module";
import { getTrustedClientIp } from "../src/lib/client-ip";

const require = createRequire(import.meta.url);
let calls: { prefix: string; key: string }[] = [], configurations: any[] = [];
let denied: string[] = [], timeout = false, failed = false, reads = 0, verifies = 0, sessions = 0;
let account: any;
let saved: NodeJS.ProcessEnv;
const reset = Date.now() + 120_000;
const replace = (name: string, exports: any) => {
  const path = require.resolve(name); require(path); require.cache[path]!.exports = exports;
};
replace("@upstash/redis", { Redis: class { constructor(options: any) { configurations.push(options); } } });
replace("@upstash/ratelimit", { Ratelimit: class {
  static slidingWindow(limit: number, window: string) { return { limit, window }; }
  constructor(private options: any) { configurations.push(options); }
  async limit(key: string) {
    calls.push({ prefix: this.options.prefix, key });
    if (failed) throw new Error("Redis internal secret and raw identifier");
    return { success: !denied.some(kind => this.options.prefix.includes(kind)), reset,
      reason: timeout ? "timeout" : undefined, pending: Promise.resolve() };
  }
} });
replace("../src/lib/prisma", { prisma: { user: { findUnique: async () => { reads++; return account; } } } });
replace("../src/lib/auth", {
  verifyPassword: async () => { verifies++; return account.valid; },
  createSession: async () => { sessions++; },
});
const { checkLoginRateLimit } = require("../src/lib/login-rate-limit");
const { POST } = require("../src/app/api/auth/login/route");

beforeEach(() => {
  saved = { ...process.env };
  Object.assign(process.env, { NODE_ENV: "production", APP_ORIGIN: "https://attendance.example",
    AUTH_SECRET: "test-only-secret", UPSTASH_REDIS_REST_URL: "https://redis.example",
    UPSTASH_REDIS_REST_TOKEN: "test-only-token", CLIENT_IP_MODE: "trusted-proxy",
    TRUSTED_PROXY_IP_HEADER: "x-attendance-client-ip" });
  calls = []; denied = []; timeout = false; failed = false; reads = 0; verifies = 0; sessions = 0;
  account = { username: "musyrif", name: "Test", role: "MUSYRIF", isActive: true, valid: true, passwordHash: "hash" };
});
afterEach(() => { process.env = saved; });
const request = (username = "musyrif", headers: Record<string, string> = {}) => new Request("https://attendance.example/api/auth/login", {
  method: "POST", headers: { origin: "https://attendance.example", "content-type": "application/json",
    "x-attendance-client-ip": "203.0.113.4", ...headers }, body: JSON.stringify({ username, password: "password" }),
});

test("both independent shared limits run before successful account lookup and verification", async () => {
  assert.equal((await POST(request())).status, 200);
  assert.equal(calls.length, 2); assert.equal(reads, 1); assert.equal(verifies, 1); assert.equal(sessions, 1);
  assert.deepEqual(configurations.filter(c => c.limiter).map(c => c.limiter), [{ limit: 5, window: "15 m" }, { limit: 30, window: "15 m" }]);
  assert.ok(configurations.filter(c => c.limiter).every(c => c.analytics === false && c.ephemeralCache === false));
});

for (const kind of ["username", "ip"]) test(`${kind} exhaustion returns 429 and Retry-After before database/password work`, async () => {
  denied = [kind];
  const response = await POST(request());
  assert.equal(response.status, 429); assert.ok(Number(response.headers.get("retry-after")) > 0);
  assert.equal(calls.length, 2); assert.equal(reads, 0); assert.equal(verifies, 0); assert.equal(sessions, 0);
});

test("keys are purpose-separated HMACs; username variants share a limit without changing login lookup", async () => {
  await checkLoginRateLimit(request(), " MUSYRIF ");
  await checkLoginRateLimit(request(), "musyrif");
  assert.equal(calls[0].key, calls[2].key); assert.equal(calls[1].key, calls[3].key);
  assert.notEqual(calls[0].key, calls[1].key);
  for (const call of calls) assert.match(call.key, /^[a-f0-9]{64}$/);
  process.env.AUTH_SECRET = "different-test-secret";
  await checkLoginRateLimit(request(), "musyrif");
  assert.notEqual(calls[0].key, calls[4].key);
});

test("equivalent IPv6 and IPv4-mapped forms cannot create different IP buckets", () => {
  assert.equal(getTrustedClientIp(request("u", { "x-attendance-client-ip": "2001:0db8:0:0:0:0:0:1" })), "2001:db8::1");
  assert.equal(getTrustedClientIp(request("u", { "x-attendance-client-ip": "::ffff:203.0.113.4" })), "203.0.113.4");
});

test("generic hosting ignores arbitrary forwarding headers and production fails closed", async () => {
  delete process.env.CLIENT_IP_MODE;
  assert.equal(getTrustedClientIp(request()), null);
  const response = await POST(request("u", { "x-forwarded-for": "1.2.3.4", "x-real-ip": "1.2.3.4" }));
  assert.equal(response.status, 503); assert.equal(reads, 0); assert.equal(calls.length, 0);
});

test("Vercel mode requires deployment flag and only uses its controlled header", () => {
  process.env.CLIENT_IP_MODE = "vercel"; delete process.env.VERCEL;
  assert.throws(() => getTrustedClientIp(request()));
  process.env.VERCEL = "1";
  assert.throws(() => getTrustedClientIp(request("u", { "x-forwarded-for": "1.2.3.4" })));
  assert.equal(getTrustedClientIp(request("u", { "x-vercel-forwarded-for": "203.0.113.9", "x-forwarded-for": "1.2.3.4" })), "203.0.113.9");
});

test("trusted proxy rejects absent, malformed, multi-IP and scoped addresses", async () => {
  for (const ip of ["", "unknown", "203.0.113.4, 1.2.3.4", "203.0.113.4:80", "fe80::1%eth0"]) {
    assert.equal((await POST(request("u", { "x-attendance-client-ip": ip }))).status, 503);
  }
  assert.equal(reads, 0); assert.equal(calls.length, 0);
});

test("production requires complete Redis configuration", async () => {
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  assert.equal((await POST(request())).status, 503);
  delete process.env.UPSTASH_REDIS_REST_URL;
  assert.equal((await POST(request())).status, 503);
  assert.equal(reads, 0);
});

test("only completely unconfigured non-production development bypasses Redis", async () => {
  Object.assign(process.env, { NODE_ENV: "development" });
  delete process.env.UPSTASH_REDIS_REST_URL; delete process.env.UPSTASH_REDIS_REST_TOKEN;
  assert.equal(await checkLoginRateLimit(request(), "u"), null); assert.equal(calls.length, 0);
  process.env.UPSTASH_REDIS_REST_TOKEN = "partial";
  assert.equal((await checkLoginRateLimit(request(), "u")).status, 503);
});

test("Redis errors and SDK timeout fail open responses are rejected without leaking errors", async () => {
  for (const failure of ["timeout", "error"]) {
    timeout = failure === "timeout"; failed = failure === "error";
    const response = await POST(request());
    assert.equal(response.status, 503);
    assert.doesNotMatch(await response.text(), /Redis|secret|identifier|musyrif|203\.0\.113/);
  }
  assert.equal(reads, 0); assert.equal(verifies, 0);
});

test("unknown, inactive, and wrong-password accounts retain identical generic errors", async () => {
  const responses = [];
  for (const user of [null, { isActive: false }, { isActive: true, valid: false }]) {
    account = user;
    const response = await POST(request());
    assert.equal(response.status, 401); responses.push(await response.text());
  }
  assert.equal(new Set(responses).size, 1); assert.equal(calls.length, 6); assert.equal(sessions, 0);
});
