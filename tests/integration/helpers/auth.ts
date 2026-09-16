import { AsyncLocalStorage } from "node:async_hooks";
import { createRequire } from "node:module";
import type { SessionUser } from "../../../src/lib/types";
import { assertIntegrationEnvironment } from "./environment";

const requestUser = new AsyncLocalStorage<SessionUser | null>();
export function asUser<T>(user: SessionUser | null, run: () => T): T {
  return requestUser.run(user, run);
}

// Install before require() of route handlers, following the existing tsx/CJS test pattern.
// Never mock Prisma. Restore only after all requests using the override have finished.
export function installAuthenticationOverride() {
  assertIntegrationEnvironment();
  const require = createRequire(import.meta.url);
  const path = require.resolve("../../../src/lib/auth");
  const original = require(path);
  const cached = require.cache[path]!;
  cached.exports = {
    ...original,
    getSession: async () => requestUser.getStore() ?? null,
    requireAuth: async () => {
      const user = requestUser.getStore();
      if (!user) throw new Error("Sesi Anda tidak valid. Silakan masuk kembali.");
      return user;
    },
  };
  return () => { cached.exports = original; };
}
