import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
test("baseline headers protect frames and content types without blocking Next.js scripts", async () => {
  const config = require("../next.config.mjs").default;
  assert.equal(config.poweredByHeader, false);
  const entries = await config.headers();
  assert.equal(entries[0].source, "/:path*");
  const headers = Object.fromEntries(entries[0].headers.map((h: any) => [h.key, h.value]));
  assert.equal(headers["X-Content-Type-Options"], "nosniff");
  assert.equal(headers["X-Frame-Options"], "DENY");
  assert.match(headers["Content-Security-Policy"], /frame-ancestors 'none'/);
  assert.doesNotMatch(headers["Content-Security-Policy"], /script-src|default-src/);
  assert.equal(headers["Referrer-Policy"], "strict-origin-when-cross-origin");
});
