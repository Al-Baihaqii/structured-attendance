# Production deployment (Vercel, Cloud Run, Node.js)

Use Node.js 24 LTS (Node.js 22 LTS is also supported), a Node runtime, and the
committed npm lockfile. This application is not a static export or an Edge app.
No hosting-specific code is needed in login or domain routes.

## Environment and secrets

Configure secrets in the host's secret manager, not in the repository, build logs,
Docker layers, client bundles, or command-line URLs. Use separate databases,
Upstash instances, secrets, and origins for local/UAT/production. Preview deployments
must not share production credentials. Only the public URL may use a `NEXT_PUBLIC_` prefix.

| Variable | Production requirement |
| --- | --- |
| `NODE_ENV` | `production` when running/bootstrapping production |
| `APP_ORIGIN` | Exact public HTTPS origin without path or wildcard; required by deployment policy |
| `AUTH_SECRET` | Strong random secret, at least 32 random bytes; identical across app replicas |
| `DATABASE_URL` | Supabase PostgreSQL runtime connection, TLS, pooling appropriate to host |
| `DIRECT_URL` | Direct/session connection for Prisma migrations; never transaction pooler |
| `UPSTASH_REDIS_REST_URL` | HTTPS REST endpoint of the environment's Upstash Redis database |
| `UPSTASH_REDIS_REST_TOKEN` | Server-only read/write REST token, not a read-only token |
| `CLIENT_IP_MODE` | `vercel` or `trusted-proxy`; `none` deliberately disables production login |
| `TRUSTED_PROXY_IP_HEADER` | Required only for `trusted-proxy`; name of an ingress-overwritten single-IP header |
| `PORT` | Host's listening port for Node/Cloud Run; `npm start` honors it (default 3000) |
| `SEED_DEMO_DATA` | `false`; production demo seed is forbidden |

`NEXT_PUBLIC_APP_URL` remains a backwards-compatible origin fallback; prefer setting
`APP_ORIGIN` explicitly. Bootstrap-only inputs are `SUPER_ADMIN_USERNAME`,
`SUPER_ADMIN_PASSWORD`, `SUPER_ADMIN_NAME`, and optional `SUPER_ADMIN_EMAIL`.
Remove bootstrap inputs from the running service after the explicit bootstrap job.
Rotating `AUTH_SECRET` invalidates sessions and starts new hashed limiter buckets;
coordinate rotation across replicas.

## Login protection and client IP trust

Login counts every validly formed attempt, including successes, in two independent
shared sliding windows: **5 per normalized username per 15 minutes**, and **30 per IP
per 15 minutes**. Username normalization affects limiting only, not credential lookup.
Redis receives purpose-separated HMAC-SHA256 identifiers, never raw username/IP.
Analytics and process-local blocking caches are disabled. All replicas use the same
Redis database and `AUTH_SECRET` so cold starts/scaling cannot reset limits.

429 responses include `Retry-After`. Redis outages, missing configuration, invalid IP
headers, and SDK timeouts fail closed with generic 503 and `Retry-After: 30`.
This deliberately trades login availability for brute-force protection. Existing
authenticated sessions are unaffected. Configure Upstash capacity/region and monitor
429/503 counts without logging login bodies, tokens, or limiter identifiers.
NAT users share an IP budget; username limits can temporarily deny targeted accounts.
Both are operational tradeoffs to review in UAT.

Only non-production with **both** Upstash variables absent skips limiting, so normal
local tests need no Redis. With either variable configured, both must be valid and
client-IP trust must also be configured. Automated tests stub the SDKs.

### Vercel

- Select the Next.js preset and Node.js 24; install with `npm ci` and build with
  `npx prisma generate && npm run build`.
- Set `CLIENT_IP_MODE=vercel`. The helper requires the platform's `VERCEL=1` flag
  and reads only `x-vercel-forwarded-for`; there is no client-supplied XFF fallback.
- Use the Vercel public HTTPS/custom domain as `APP_ORIGIN`. Provision secrets for
  production and preview independently. Migrate once in a controlled release job,
  not in every preview build or request.
- If another CDN/proxy precedes Vercel, verify the resulting client-IP identity and
  platform overwrite behavior before release; do not assume arbitrary XFF is safe.

See [Vercel's controlled request headers](https://vercel.com/docs/headers/request-headers).

### Google Cloud Run

- Build a Linux Node.js 24 container with `npm ci`, `npx prisma generate`, and
  `npm run build`. Keep generated Prisma runtime files and required dependencies.
  Start with `npm start`; it binds `0.0.0.0` and honors Cloud Run's `PORT`.
- Inject secrets at runtime, use HTTPS/custom domain, and budget maximum instances
  and per-instance Prisma connections against the database capacity.
- Use `CLIENT_IP_MODE=trusted-proxy` and
  `TRUSTED_PROXY_IP_HEADER=x-attendance-client-ip`.
- Configure a supported external Application Load Balancer to **replace**, not
  append, `X-Attendance-Client-IP` with `{client_ip_address}`. Restrict ingress to
  `internal-and-cloud-load-balancing`, disable the default `run.app` URL, and ensure
  no alternate domain/internal ingress path lets untrusted callers bypass this
  overwrite. Do not copy an arbitrary first X-Forwarded-For element.
- Verify spoofed headers are replaced using UAT requests before enabling login.
  Merely setting the environment variable does not establish proxy trust.

References: [load-balancer header configuration](https://docs.cloud.google.com/load-balancing/docs/https/custom-headers)
and [Cloud Run ingress restrictions](https://docs.cloud.google.com/run/docs/securing/ingress).

### Generic Node.js / suitable shared hosting

The host must support all of:

- Node.js 22/24, npm install (`npm ci` preferred), Prisma generation, build, and start;
- private environment variables and a persistent supervised Node process;
- a reverse proxy, configurable trusted client-IP handling, and no public bypass
  of the application port;
- outbound HTTPS to Upstash and PostgreSQL connectivity to Supabase;
- HTTPS with a custom domain, enough build/runtime memory, and restart/deploy control.

**PHP-only shared hosting is not supported.** A static-file upload is insufficient.
Use `CLIENT_IP_MODE=trusted-proxy` and a dedicated header name. For a directly exposed
Nginx TLS proxy, `proxy_set_header X-Attendance-Client-IP $remote_addr;` overwrites
the supplied header. Restrict the Node port to that proxy (the start command binds
all interfaces). If there is an upstream CDN, first configure and restrict Nginx's
trusted real-IP sources; otherwise `$remote_addr` is the CDN, not the client.
Never enable unrestricted real-IP trust. Only accept a single canonical IP, no
ports or comma-separated chains. Default `CLIENT_IP_MODE=none` ignores all
forwarded headers and production login returns 503 until trust is configured.

## Supabase connections and migrations

Obtain endpoint details from the project's Connect panel without copying secrets
into documentation. Serverless Vercel/Cloud Run should use the transaction pooler
(normally port 6543) in `DATABASE_URL`, with `pgbouncer=true` for this Prisma 6
client and a conservative `connection_limit` (start with 1 per process, then size
against concurrency and database capacity). Require TLS and verify certificate
validation against Supabase's guidance; never disable TLS verification.

`DIRECT_URL` must use direct PostgreSQL (normally 5432) or the **session** pooler
(5432 when direct IPv6 is unavailable). Use it for migrations and logical backup,
not the transaction pooler. A persistent Node host may use a small bounded direct
or session pool instead of transaction pooling. Runtime and CLI accounts need
their appropriate privileges; migrations must be able to create constraints/indexes.
See [Supabase's Prisma connection guidance](https://supabase.com/docs/guides/database/prisma).

The Prisma schema already uses `url=DATABASE_URL` and `directUrl=DIRECT_URL`.
From a protected release job with reviewed production target/secrets:

```sh
npx prisma migrate status
npx prisma migrate deploy
npx prisma migrate status
```

Use the repository's pinned CLI, with build/release dependencies installed.
Never run `db push`, `migrate dev`, or `migrate reset` in production. They are not
release procedures. Do not automatically resolve failed migrations or baseline an
existing database; reconcile its schema/history first. Committed SQL includes
partial unique/check/composite constraints which must not be skipped.

## Release and Supabase security checklist

1. Provision isolated production PostgreSQL and Upstash, HTTPS, and verified ingress.
2. Set secrets, validate the database target, review pending migration SQL, and take
   an encrypted backup. Rehearse restoration using the [runbook](backup-restore.md).
3. Run CI tests/typecheck/build/Prisma validation and review [dependency triage](dependency-security.md).
4. Apply `migrate deploy` once; require clean `migrate status`. Deploy the matching build.
5. Run explicit create-only SUPER_ADMIN bootstrap as described in
   [production security](production-security.md), never routine/demo seeding.
6. Disable Supabase Data API if unused (this app uses Prisma/custom auth). Independently
   verify `anon` and `authenticated` cannot read/write application tables, views,
   sequences or exposed functions. Disable API exposure and review current/default
   grants; application RBAC does not protect a separate database HTTP API.
7. Verify TLS, correct runtime/migration pooling modes, connection limits, and backup
   freshness/restore success. Record owners for secrets, migrations, and recovery.
8. Smoke-test login/logout, Secure/HTTP-only cookies, wrong-origin mutation rejection,
   generic credentials, and 429/Retry-After from repeated UAT login attempts. Verify
   forged forwarding headers cannot evade limits and missing Redis fails closed.
   Check scoped group/session/report access and a complete atomic attendance save.
   Probe `/login` for process readiness; also use an authorized application flow to
   verify database/Redis readiness (HTTP 200 on `/login` alone does not verify either).
9. Switch traffic only after checks; retain the prior compatible app artifact. Do not
   undo database migrations by resetting; use a reviewed forward fix or restore plan.

Read-only grant check (run via a trusted DBA connection; expect no rows for app tables):

```sql
SELECT r.rolname, n.nspname, c.relname
FROM pg_roles r CROSS JOIN pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE r.rolname IN ('anon', 'authenticated')
  AND n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm')
  AND has_table_privilege(r.oid, c.oid, 'SELECT,INSERT,UPDATE,DELETE');
```

Also inspect function/sequence privileges and default grants, and verify anonymous
Data API requests are denied. This read-only checklist does not automatically change
Supabase grants or RLS. Hosting/proxy setup and real service smoke checks remain
operator release gates; mocked tests cannot certify them.
