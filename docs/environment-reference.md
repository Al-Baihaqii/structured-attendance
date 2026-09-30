# Environment reference

Audience: developers, release engineers, and hosting administrators. This reference
documents existing configuration; no real credentials belong here. Start from
[`.env.example`](../.env.example) and store production values in the hosting secret
manager. Do not expose server secrets through `NEXT_PUBLIC_` variables.

## Runtime and deployment

| Variable | Requirement and behavior | Handling |
| --- | --- | --- |
| `DATABASE_URL` | PostgreSQL runtime connection. Use appropriate Supabase pooling and TLS. | Secret, environment-specific |
| `DIRECT_URL` | Prisma direct/session connection for migrations; referenced by the datasource. No transaction pooler for migrations. | Secret; protect migration privileges |
| `AUTH_SECRET` | Signs sessions and HMAC-hashes limiter identifiers. Required for login. Provision at least 32 random bytes as operational policy. | Secret; identical across replicas |
| `APP_ORIGIN` | Exact browser origin, including local port where applicable. Production policy requires HTTPS without path/query/wildcard. | Non-secret; deployment-specific |
| `NEXT_PUBLIC_APP_URL` | Legacy fallback only when `APP_ORIGIN` is empty/absent. | Public; never put secrets here |
| `UPSTASH_REDIS_REST_URL` | HTTPS Redis REST endpoint; production login requires it. | Server configuration; keep private |
| `UPSTASH_REDIS_REST_TOKEN` | Read/write REST token for that Redis database. | Secret; not a read-only token |
| `CLIENT_IP_MODE` | `none` (default), `vercel`, or `trusted-proxy`. Production needs a trusted mode. | Non-secret |
| `TRUSTED_PROXY_IP_HEADER` | In trusted-proxy mode, name of the header overwritten by controlled ingress with one IP. | Non-secret; requires verified proxy setup |
| `VERCEL` | Platform-provided `1` is required by Vercel mode. Do not simulate trust by setting this on generic hosting. | Platform-managed |
| `NODE_ENV` | Next.js uses development for `next dev` and production for build/start unless already set. Explicitly set production for production bootstrap. | Execution mode; not a security workaround |
| `PORT` | Used by `npm start`; default 3000. Development script explicitly binds port 5000. | Host-managed or operator-set |
| `REPLIT_DEV_DOMAIN` | Optional development origin allowlist entry for legacy Replit-based development. Not required for Vercel, Cloud Run, or normal local development. | Development-only |

The application does not use Supabase Auth credentials or require an anon/service-role
API key. PostgreSQL URLs provide its database access. Do not add unused service credentials.

## Bootstrap and test-only inputs

| Variable | Use |
| --- | --- |
| `SUPER_ADMIN_USERNAME` | Required for explicit seed/bootstrap invocation |
| `SUPER_ADMIN_PASSWORD` | Required bootstrap secret; new production account requires at least 8 characters and at most 72 UTF-8 bytes |
| `SUPER_ADMIN_NAME` | Required bootstrap display name |
| `SUPER_ADMIN_EMAIL` | Optional bootstrap email |
| `SEED_DEMO_DATA` | Default to `false`; `true` is rejected in production |
| `TEST_DATABASE_URL` | Opt-in integration runner only; dedicated local database/login, no fallback to runtime URLs. See [integration safety rules](integration-tests.md). |

Supply bootstrap credentials only to the explicit operator job; remove them from the
running service afterwards. Production bootstrap is create-only, not a password-reset
tool. Development seed can overwrite fixture credentials and must never be used for
production maintenance.

## Local versus production

| Setting | Local `npm run dev` | Vercel | Cloud Run / Node behind controlled proxy |
| --- | --- | --- | --- |
| Origin | `http://localhost:5000` | Public HTTPS origin | Public HTTPS origin |
| Redis | Both variables empty to skip limiting locally | Required | Required |
| Client IP mode | `none` with empty Redis values | `vercel` | `trusted-proxy` |
| IP header | Not used in local bypass | `x-vercel-forwarded-for` | Configured, overwritten single-IP header |
| Database | Isolated development database | Isolated production/UAT database | Isolated production/UAT database |

For local development, use git-ignored `.env.development.local`:

```dotenv
APP_ORIGIN=http://localhost:5000
UPSTASH_REDIS_REST_URL=""
UPSTASH_REDIS_REST_TOKEN=""
CLIENT_IP_MODE=none
```

Both effective Redis values must be absent or empty for the existing non-production
bypass. `CLIENT_IP_MODE=none` alone does not disable the limiter. If Redis is configured
but trusted IP is unavailable, login returns 503 before account lookup. Production
rejects missing Redis configuration even with `none`; never change production's
`NODE_ENV` to bypass this check.

## Loading and precedence

For development, Next.js checks these sources in order and stops at the first value:

1. Environment inherited from the shell, IDE, or host.
2. `.env.development.local`.
3. `.env.local`.
4. `.env.development`.
5. `.env`.

Production substitutes `production` for `development`; it does not load
`.env.development.local`. Test mode does not load `.env.local`. Inherited variables
can override every file, including an intended empty override. Restart after changes.
Quoted empty values in dotenv files parse as empty strings; whitespace and literal
quotes exported from a shell are not equivalent. Diagnose presence/absence and source
names only; do not dump environment contents.

Prisma CLI and plain scripts do not share all Next.js loading behavior. Provision
their environment explicitly; Prisma CLI can load `.env`. The integration runner
requires `TEST_DATABASE_URL` in the shell and replaces runtime URLs in child processes
before Prisma imports. Never assume a Next.js local override protects a migration job.

## Connection and rotation requirements

Use the project's Supabase Connect panel for actual endpoints. Serverless runtime
normally uses the transaction pooler with `pgbouncer=true` for this Prisma version
and a bounded connection limit. Migrations use direct PostgreSQL or the session
pooler when direct IPv6 is unavailable. Require TLS and verify certificate settings.
Detailed topology is in [deployment security](deployment.md).

Keep production, preview/UAT, and local databases and Redis instances separate. All
replicas of one environment must share the limiter backend and signing secret.
Rotating `AUTH_SECRET` invalidates existing sessions and changes limiter buckets;
coordinate rollout. Rotate database/Redis credentials through service consoles and
the secret manager, update all replicas, and verify connectivity without logging tokens.
