# Deployment guide

Audience: the engineer responsible for installing or releasing Structured Attendance.
This is the release sequence; [deployment security](deployment.md) retains the detailed
proxy and Supabase configuration. Use [environment reference](environment-reference.md)
for variables and [operations guide](operations-guide.md) for ongoing ownership.

## 1. Confirm the release target

Record the Git revision, public HTTPS origin, hosting project, Supabase project,
Upstash database, and operator responsible for the release. Keep identifiers in the
handover record and credentials in a secret manager. Do not infer production targets
from a developer's `.env`. Separate production from local/UAT and preview deployments.

| Target | Required setup |
| --- | --- |
| Vercel | Next.js preset, Node 24 or 22, environment secrets, HTTPS domain, `CLIENT_IP_MODE=vercel` |
| Google Cloud Run | Linux Node container built for the target platform, generated Prisma runtime, `npm start`, injected secrets, `PORT`, and controlled load-balancer ingress |
| Generic Node/shared hosting | Node 24 or 22, npm install/build/start support, sufficient memory, supervised persistent Node process, reverse proxy, private environment configuration, HTTPS/custom domain |

Every target needs outbound HTTPS to Upstash and PostgreSQL access to Supabase.
PHP-only shared hosting, static export hosting, and Edge-only runtime are unsupported.
The repository does not supply a complete Cloud Run/container or generic-host
infrastructure definition; its operator must provision that platform configuration.

## Recommended production deployment

For the current release, the recommended production architecture is:

| Component | Service |
|---|---|
| Application hosting | Vercel |
| Database | Supabase PostgreSQL |
| Login rate limiting | Upstash Redis |
| Domain and HTTPS | Managed domain with HTTPS |

This architecture is recommended because it matches the validated UAT environment
and minimizes operational maintenance.

Alternative platforms such as Cloud Run or generic Node hosting are documented
for teams that require additional infrastructure control.


## 2. Prepare configuration and connectivity

Set `APP_ORIGIN`, `AUTH_SECRET`, database URLs, Redis URL/token, and the appropriate
client-IP mode. On generic hosts/Cloud Run, configure a trusted proxy to overwrite a
dedicated single-IP header and prevent bypass access. Do not trust arbitrary client
X-Forwarded-For values. Follow the host-specific recipe in [deployment security](deployment.md)
and verify it in UAT, including spoofed-header requests.

For serverless runtime, select Supabase's transaction pooler for `DATABASE_URL` with
Prisma-compatible pooling options and a conservative connection budget. Set
`DIRECT_URL` to a direct/session connection for migrations. Both require appropriate
TLS configuration. Avoid exceeding database capacity when the app scales out.

## 3. Install, validate, and build

From a clean checkout of the approved revision, with its lockfile and build dependencies:

```sh
npm ci
npm run db:generate
npm test
npx tsc --noEmit
npx prisma validate
npm audit --omit=dev
npm run build
```

`npm ci` runs the repository's Prisma `postinstall`. Do not omit development
dependencies before building: TypeScript and Prisma CLI are needed. Build on the
deployment OS/container; do not copy Windows-generated Prisma binaries to Linux.
If trimming runtime dependencies, verify the resulting artifact retains Next.js,
Prisma Client and its generated runtime files. Do not copy local `.env` files into
images or artifacts.

An audit failure requires review, not `npm audit fix --force`. See the dated
[deferred advisory record](dependency-security.md); rerun audit for the release and
record acceptance or remediation. Integration tests are separate, opt-in and
require a disposable database; see [their guide](integration-tests.md).

## 4. Apply migrations through one controlled release job

For a new empty database, apply the full migration history. For an existing database,
first verify its project identity, back it up, inspect migration status and SQL, and
confirm compatibility with the deployed application. Older cleanup migrations are
not generic data-reconciliation tools. If schema/history differ, stop and review;
do not baseline or resolve migration failures automatically.

With production connection variables set in the protected release job:

```sh
npx prisma migrate status
npx prisma migrate deploy
npx prisma migrate status
```

Pending migrations before deployment are expected when releasing schema changes;
failed/divergent history is not. Require a clean final status. Apply migrations once,
not in each instance startup or preview build. Preserve committed SQL, including
assignment uniqueness, date checks and composite foreign keys. Never use `db push`,
`migrate dev`, or `migrate reset` in production.

For schema changes, explicitly plan old/new application compatibility and any
maintenance window before migration. This guide does not promise zero-downtime DDL.

## 5. Bootstrap the first administrator

Only when needed, supply bootstrap variables to a one-off job. Explicit production
mode is essential because development seed has different update behavior.

PowerShell:

```powershell
$env:NODE_ENV = "production"
$env:SEED_DEMO_DATA = "false"
npx prisma db seed
```

POSIX shell:

```sh
NODE_ENV=production SEED_DEMO_DATA=false npx prisma db seed
```

The username/name/password must already be injected securely. A matching active,
unscoped SUPER_ADMIN remains unchanged; collisions with other accounts fail. This
does not reset an existing password. Never enable demo seed, embed bootstrap secrets
in commands, or seed on every deploy. Transfer account ownership securely and remove
bootstrap variables from normal runtime configuration.

## 6. Start the application

- **Vercel:** install with `npm ci`; build with `npm run build` (postinstall generates
  Prisma; explicit `npx prisma generate && npm run build` is also supported). Vercel
  manages the Node functions; do not configure a persistent `npm start` process.
- **Cloud Run:** start the built container with `npm start`; it listens on `0.0.0.0`
  and the injected `PORT`. Configure maximum instances and connection budgets.
- **Generic Node:** use the host's process supervisor to run `npm start` with `PORT`
  and production environment. Proxy HTTPS to that port and prevent direct public
  access. `npm run dev` is not the production server.

Ensure the correct public origin and secrets are present in the running revision,
not just the build job. Use protected UAT first; switch public traffic only after
the checks below.

## 7. Acceptance checks and evidence

Record results against the deployed revision and target:

- `/login` loads over HTTPS; login/logout work and production cookies are Secure and
  HTTP-only. Page availability alone does not verify database/Redis readiness.
- Wrong credentials remain generic; repeated UAT login attempts return 429 with
  Retry-After; a simulated unavailable limiter in isolated UAT fails closed.
- Foreign-origin JSON mutations are rejected; trusted proxy identity cannot be
  overridden by the caller.
- An administrator sees only its scope; a former Musyrif cannot open the old group;
  the current Musyrif reads predecessor meetings but cannot edit their attendance.
- In a designated UAT group, meeting/attendance creation, attendance edits, conflict
  handling, report date filters, and both CSV formats work.
- Supabase Data API is disabled if unused; anon/authenticated access and default
  grants are reviewed; TLS/pooling and final migration status are verified.
- An encrypted backup and successful isolated restore rehearsal are recorded, with
  operational ownership assigned.

Do not fill real production groups with smoke-test attendance. Production verification
should use agreed accounts/data and primarily read-only checks after UAT acceptance.

## 8. Rollback and handover

Keep the prior application artifact and its configuration reference. Roll back the
app only if it is compatible with the current database. Otherwise use a reviewed
forward fix or the [restore runbook](backup-restore.md); never reset the database as
a rollback shortcut. Record the live revision, completed migrations, known accepted
risks, service owners, and support contacts using the [operations checklist](operations-guide.md).
