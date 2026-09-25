import assert from "node:assert/strict";
import test, { beforeEach, afterEach } from "node:test";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { apiError } from "../src/lib/api";
import { HttpError } from "../src/lib/http-error";
import { AuthorizationError, GroupDeletedError } from "../src/lib/authorization";
import { assertUnsafeRequest, readJsonRequest } from "../src/lib/request-security";
import { loginSchema, userSchema } from "../src/lib/validators";

let saved: NodeJS.ProcessEnv;
beforeEach(() => { saved = { ...process.env }; process.env.APP_ORIGIN = "https://attendance.example"; });
afterEach(() => { process.env = saved; });
const request = (overrides: Record<string, string> = {}, body = "{}") => {
  const headers = new Headers({ Origin: "https://attendance.example", "Content-Type": "application/json; charset=utf-8" });
  // Header names are case-insensitive; overrides must replace, not append to defaults.
  for (const [name, value] of Object.entries(overrides)) headers.set(name, value);
  return new Request("https://untrusted-host.example/test", { method: "POST", headers, body });
};
test("unsafe guard uses configured origin, not request Host or forwarded host", async () => {
  assert.doesNotThrow(() => assertUnsafeRequest(request()));
  for (const origin of ["null", "", "https://evil.example", "https://attendance.example.evil", "http://attendance.example"]) {
    const response = apiError((() => { try { assertUnsafeRequest(request({ origin, "x-forwarded-host": "attendance.example" })); } catch (error) { return error; } })());
    assert.equal(response.status, 403);
  }
  const missing = request(); missing.headers.delete("origin"); assert.throws(() => assertUnsafeRequest(missing));
  assert.throws(() => assertUnsafeRequest(request({ "sec-fetch-site": "cross-site" })));
});
test("JSON mutations reject simple content types, bodyless logout/delete remain supported", () => {
  for (const type of ["text/plain", "application/x-www-form-urlencoded", "multipart/form-data", ""]) {
    const input = request({ "content-type": type });
    assert.equal(input.headers.get("content-type"), type);
    assert.throws(() => assertUnsafeRequest(input), (e: any) => e.status === 415);
  }
  const missing = request(); missing.headers.delete("content-type");
  assert.throws(() => assertUnsafeRequest(missing), (e: any) => e.status === 415);
  assert.doesNotThrow(() => assertUnsafeRequest(new Request("https://attendance.example/logout", { method: "POST", headers: { origin: "https://attendance.example" } }), false));
});
test("bounded JSON reader rejects actual streamed bytes despite missing or false length", async () => {
  const lengthHeaders: Record<string, string>[] = [{}, { "content-length": "1" }];
  for (const headers of lengthHeaders) await assert.rejects(readJsonRequest(request(headers, JSON.stringify({ data: "x".repeat(100) })), 30), (e: any) => e.status === 413);
  assert.throws(() => assertUnsafeRequest(request({ "content-length": "99999" }), true, 30), (e: any) => e.status === 413);
  await assert.rejects(readJsonRequest(request({}, "not json")), (e: any) => e.status === 400);
  assert.deepEqual(await readJsonRequest(request({}, '{"ok":true}')), { ok: true });
});
test("missing/invalid production origin configuration fails closed without exposing configuration", async () => {
  Object.assign(process.env, { NODE_ENV: "production" }); delete process.env.APP_ORIGIN; delete process.env.NEXT_PUBLIC_APP_URL;
  for (const origin of [undefined, "http://localhost", "https://user:secret@example.com", "https://example.com/path"]) {
    if (origin) process.env.APP_ORIGIN = origin;
    let failure; try { assertUnsafeRequest(request()); } catch (e) { failure = e; }
    const response = apiError(failure); assert.equal(response.status, 500); assert.doesNotMatch(await response.text(), /secret|configuration|localhost/);
  }
});
test("expected errors retain status; arbitrary and Prisma errors never expose details", async () => {
  for (const [error, status] of [[new HttpError("Sesi tidak valid", 401), 401], [new HttpError("Konflik", 409), 409], [new AuthorizationError(), 403], [new GroupDeletedError(), 409], [z.string().safeParse(1).error, 400]] as const) assert.equal(apiError(error).status, status);
  for (const error of [new Error("private connection postgres://secret"), new Prisma.PrismaClientKnownRequestError("private SQL and passwordHash", { code: "P2002", clientVersion: "6" }), { message: "secret", status: 400 }]) {
    const response = apiError(error); assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: "Terjadi kesalahan pada server." });
  }
});
test("new password byte limit is UTF-8 aware, but legacy passwords over 72 bytes still pass login validation", () => {
  const base = { username: "user", name: "User", role: "SUPER_ADMIN" };
  assert.equal(userSchema.safeParse({ ...base, password: "é".repeat(36) }).success, true);
  assert.equal(userSchema.safeParse({ ...base, password: "é".repeat(37) }).success, false);
  assert.equal(loginSchema.safeParse({ username: "user", password: "é".repeat(100) }).success, true);
  assert.equal(loginSchema.safeParse({ username: "user", password: "x".repeat(4097) }).success, false);
});
