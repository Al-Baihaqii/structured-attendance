# Dependency advisory triage — Wave 2

Reviewed 2026-09-26 using `npm audit` and the installed dependency graph. Keep the
lockfile and install with `npm ci`; rerun audit at release because advisories change.
Never use `npm audit fix --force` as a release step.

- Added `@upstash/redis` 1.39.0 and `@upstash/ratelimit` 2.2.0 for shared login limits.
- Updated existing Vite 6.0.5 to compatible 6.4.3. This resolves the reported Vite
  development-server advisories and its old esbuild dependency. Production is
  served by Next.js; no Vite dev server should run publicly.
- Deferred Prisma's pinned transitive dependencies: `@prisma/config` 6.19.0 pins
  `effect` 3.18.4 and `deepmerge-ts` 7.1.5. The audit reports four high affected
  packages (including parent packages) from these two advisory chains:
  [Effect RPC context contamination](https://github.com/advisories/GHSA-38f7-945m-qr2g)
  and [Deepmerge recursive graph exhaustion](https://github.com/advisories/GHSA-ggr8-5vv4-36mx).

The app does not implement Effect RPC or merge untrusted config graphs. The observed
path is Prisma tooling/config, not an identified HTTP request path. This reduces
exposure but does not make an audit warning disappear. The Prisma CLI can still be
present in a production installation through Prisma Client's optional peer chain;
`--omit=dev` is not proof it is absent.

Do not force a transitive major (`deepmerge-ts` 8), override Prisma's exact pins
without compatibility testing, or take npm's suggested Prisma downgrade to 6.12.
Restrict migration/build/config inputs to trusted release operators, never expose
development servers, and monitor the upstream Prisma fix. Schedule an explicitly
tested Prisma upgrade when it provides compatible patched dependencies. Release
requires recorded acceptance of these deferred advisories or a separately validated
fix; a clean audit is not claimed by this wave.
