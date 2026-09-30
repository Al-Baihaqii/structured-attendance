# Structured Attendance

Structured Attendance manages groups, Musyrif assignments, meetings, and attendance within a **City → Mahalli → Sector → Group** hierarchy. The interface is in Indonesian. Access is controlled by role, hierarchy scope, and current assignment.

## Overview

Structured Attendance adalah sistem manajemen kehadiran berbasis hierarki
untuk organisasi yang memiliki struktur wilayah dan kelompok.

Sistem membantu administrator mengelola:

- wilayah organisasi
- akun pengguna berdasarkan peran
- kelompok binaan
- penugasan Musyrif
- pencatatan pertemuan
- presensi anggota
- laporan dan ekspor data

Aplikasi dirancang untuk menjaga histori organisasi tetap konsisten,
meskipun terjadi perubahan penugasan atau struktur pengelolaan.


## Screenshot

[Structured Attendance Dashboard](docs/images/dashboard.png)
[Structured Attendance Kelompok](docs/images/kelompok.png)
[Structured Attendance Isi_Kelompok](docs/images/isi_kelompok.png)
[Structured Attendance presensi](docs/images/presensi.png)


## Documentation by audience

| Audience | Guide | Purpose |
| --- | --- | --- |
| Clients, administrators, Musyrif | [Panduan pengguna](docs/client-guide.md) | Daily workflows, permissions, reports and CSV exports |
| Deployment engineer | [Deployment guide](docs/deployment-guide.md) | Installation and reproducible release sequence |
| Developer / hosting administrator | [Environment reference](docs/environment-reference.md) | Configuration, secrets, local/production differences |
| Service owner / support operator | [Operations guide](docs/operations-guide.md) | Routine checks, incidents, recovery and handover |

Existing engineering references remain available:

- [Deployment security and proxy configuration](docs/deployment.md)
- [Production security controls](docs/production-security.md)
- [Supabase backup and restore runbook](docs/backup-restore.md)
- [Dependency advisory triage](docs/dependency-security.md)
- [Isolated PostgreSQL integration testing](docs/integration-tests.md)

## Implemented capabilities

- Username/password authentication with HTTP-only sessions and shared production login limits.
- Scoped hierarchy, user, group and member management.
- City-owned Musyrif accounts, multiple simultaneous group assignments, and at most one active Musyrif per group.
- Combined meeting/attendance creation and batch attendance editing with conflict detection.
- Group-wide meeting numbering and preserved assignment/session history.
- Meeting summaries, group reports, member history and hierarchical drill-down reports.
- Group CSV exports: meeting summary and attendance detail, with date filtering.
- Activity Log access restricted to SUPER_ADMIN.

Percentages use recorded attendance only. Missing entries are never inferred as Alpa. Inactive-member history is retained; authorized historical reports include deleted groups and attribute groups to their current hierarchy.

The client guide distinguishes available screen controls from server/API rules. There is no implemented notification workflow, native mobile app, or self-service password-recovery flow. CSV downloads are reports, not database backups.

## Developer quick start

Use Node.js 24 LTS or 22 LTS, npm, and an isolated development PostgreSQL database. Do not point local setup or seed commands at production.

1. Clone the handover repository and check out the agreed release revision.
2. Copy `.env.example` to `.env`. Populate database connections, `AUTH_SECRET`, and local bootstrap inputs using the [environment reference](docs/environment-reference.md). Set `APP_ORIGIN=http://localhost:5000` and `SEED_DEMO_DATA=false`.
3. For local login without Redis, put these overrides in git-ignored `.env.development.local`:

   ```dotenv
   UPSTASH_REDIS_REST_URL=""
   UPSTASH_REDIS_REST_TOKEN=""
   CLIENT_IP_MODE=none
   ```

4. Confirm both database URLs target development, then run:

   ```sh
   npm ci
   npm run db:generate
   npx prisma migrate deploy
   npx prisma db seed
   npm run dev
   ```

5. Open `http://localhost:5000` and sign in with the bootstrap account you configured.

`npm ci` also runs Prisma generation through `postinstall`; the explicit command is useful after schema changes. Development seed can update an existing bootstrap account, including its password. Use it only on development data. Prisma CLI reads `.env`; do not assume Next.js's `.env.development.local` precedence applies to CLI/seed commands. Restart the development server after environment changes.

## Developer commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server on port 5000 |
| `npm test` | Node test suite, including mocked security/mutation/report tests |
| `npx tsc --noEmit` | Type checking |
| `npm run lint` | ESLint checks |
| `npm run build` | Production build |
| `npm start` | Production Node server; uses `PORT`, default 3000 |
| `npx prisma validate` | Schema validation; does not apply migrations |
| `npx prisma migrate status` | Inspect configured database migration status |
| `npx prisma migrate deploy` | Apply committed migrations to the configured database |
| `npm run test:integration` | Opt-in isolated PostgreSQL smoke test; requires separate setup |
| `npm audit --omit=dev` | Check production dependency advisories |

`db:push`, `db:migrate`, and `db:studio` are development tools, not production release steps. `db push` does not replace migration SQL containing custom constraints. Never use `migrate dev`, `migrate reset`, or `db push` against production.

## Technical map

| Location | Responsibility |
| --- | --- |
| `src/app/dashboard/` | Authenticated pages and reporting screens |
| `src/app/api/` | Authentication, mutations and group CSV export |
| `src/components/` | Forms, reports and local UI components |
| `src/lib/` | Authentication, authorization, validators, locks and report queries |
| `prisma/schema.prisma`, `prisma/migrations/` | PostgreSQL model and versioned SQL migrations |
| `prisma/seed.ts`, `prisma/production-bootstrap.ts` | Development fixtures and create-only production bootstrap |
| `tests/`, `scripts/` | Unit/mocked tests and isolated integration runner |

Stack: Next.js App Router, React, TypeScript, Prisma, PostgreSQL, Tailwind CSS, custom authentication, and Upstash Redis for login limiting. Supabase supplies PostgreSQL; Supabase Auth is not used.

## Release and handover status

Vercel deployment and login were reported working during UAT. Cloud Run and generic Node hosting have documented prerequisites; this repository does not establish that those deployments have been exercised. Follow the [deployment guide](docs/deployment-guide.md) and record the actual target, revision, validation results, service owners and recovery evidence at handover.

Mocked tests do not prove live PostgreSQL concurrency behavior. The opt-in integration foundation currently supplies a smoke test, not the deferred concurrency suite. Review the dated [dependency triage](docs/dependency-security.md) and run a fresh audit for each release. Documentation is not certification of hosting, grants, or backups.
