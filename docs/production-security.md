# Production security configuration

Set `APP_ORIGIN` to the exact public HTTPS origin, for example
`https://attendance.example.org` (no path, query, credentials, or wildcard).
`NEXT_PUBLIC_APP_URL` is accepted as a fallback for existing deployments.
Mutations fail closed when production origin configuration is absent or invalid.
Use a separate configured origin for each deployment; do not trust arbitrary forwarded hosts.
Local development without either variable permits the request's loopback origin only.

All POST/PATCH/DELETE routes require a matching browser `Origin` header.
JSON mutation routes also require `Content-Type: application/json`.
Bodyless logout and DELETE routes do not require a JSON body.
Scripts and integration clients must explicitly send the trusted Origin and JSON content type.

JSON mutation bodies are limited to 1 MiB, checked against both declared length
and actual streamed bytes. Login bodies are limited to 16 KiB and passwords to
4096 UTF-8 bytes. New/changed passwords retain the eight-character minimum and
are limited to 72 UTF-8 bytes. Login still accepts legacy passwords over 72 bytes;
no existing password hashes are migrated or changed.

Run production bootstrap only as an explicit operator action with
`NODE_ENV=production` and `SEED_DEMO_DATA=false`:

```text
npx prisma db seed
```

The existing `SUPER_ADMIN_USERNAME`, `SUPER_ADMIN_NAME`, `SUPER_ADMIN_PASSWORD`,
and optional `SUPER_ADMIN_EMAIL` variables remain the bootstrap inputs.
Production creates a new global admin or leaves an existing active global admin
unchanged. Username collisions with ordinary, inactive, or scoped accounts fail.
Concurrent collisions fail rather than updating another account. Production demo
seeding is rejected before any database work. Development seed behavior is unchanged.
Never run seed automatically on deployment or treat it as a password-reset tool.

Baseline headers deny framing and plugins, restrict base URLs and browser permissions,
and enable nosniff/referrer protection. Production adds HSTS for the application host;
it deliberately does not include subdomains or preload. CSP does not yet enforce
script nonces and does not interfere with Next.js streaming/inline scripts.

Still required before public release: login throttling, verification of Supabase
Data API restrictions, secret strength, backups/restore, production pooling and
migration procedure, and dependency advisory triage. This wave does not configure
the hosting platform or connect to the production database.
