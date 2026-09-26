# Structured Attendance

Structured Attendance adalah fondasi manajemen kehadiran berbasis hierarki untuk organisasi dengan struktur **Kota → Mahalli → Sektor → Kelompok**. Phase 1 berfokus pada authentication, role-based access, manajemen wilayah, pengguna, kelompok, anggota, penugasan Musyrif, dan activity log.

## Tech stack

- Next.js App Router dan TypeScript
- Tailwind CSS dengan komponen UI bergaya shadcn/ui
- Prisma ORM dan PostgreSQL (Supabase PostgreSQL compatible)
- Custom username/password authentication dengan bcrypt dan HTTP-only JWT cookie
- Zod untuk validasi input
- Node test runner untuk authorization tests

## Setup lokal

1. Install Node.js 24 LTS (atau 22 LTS) dan npm.
2. Salin `.env.example` menjadi `.env` lalu isi nilainya.
3. Install dependency:

   ```bash
   npm install
   ```

4. Generate Prisma Client dan terapkan migration ke database development:

   ```bash
   npm run db:generate
   npx prisma migrate deploy
   ```

5. Buat akun Super Admin dan, bila diperlukan, data demo:

   ```bash
   npm run db:seed
   ```

6. Jalankan development server:

   ```bash
   npm run dev
   ```

## Environment variables

| Variable | Kegunaan |
| --- | --- |
| `DATABASE_URL` | Connection string PostgreSQL untuk runtime Prisma |
| `DIRECT_URL` | Connection string direct PostgreSQL untuk migration/Prisma |
| `AUTH_SECRET` | Secret untuk menandatangani session |
| `APP_ORIGIN` | Origin HTTPS yang diizinkan untuk mutation production |
| `UPSTASH_REDIS_REST_URL` | Endpoint HTTPS Redis untuk pembatasan login |
| `UPSTASH_REDIS_REST_TOKEN` | Token Redis server-only; wajib production |
| `CLIENT_IP_MODE` | `vercel`, `trusted-proxy`, atau `none` (lokal) |
| `TRUSTED_PROXY_IP_HEADER` | Header IP tunggal yang ditimpa proxy tepercaya |
| `SUPER_ADMIN_USERNAME` | Username Super Admin saat seed |
| `SUPER_ADMIN_PASSWORD` | Password Super Admin saat seed |
| `SUPER_ADMIN_NAME` | Nama Super Admin saat seed |
| `SUPER_ADMIN_EMAIL` | Email opsional Super Admin |
| `NEXT_PUBLIC_APP_URL` | URL aplikasi |
| `SEED_DEMO_DATA` | Gunakan `true` untuk membuat data demo |

Jangan pernah commit `.env`, password, connection string, atau secret ke repository. Gunakan secret manager pada hosting production. Lihat [panduan deployment](docs/deployment.md) untuk seluruh konfigurasi.

## Commands

```bash
npm run dev          # development server di port 5000
npm run build        # production build
npm run start        # production server
npm run lint         # lint Next.js
npm test             # authorization tests
npm run db:generate  # generate Prisma Client
npm run db:push      # apply schema ke development database
npm run db:migrate   # migration development
npm run db:seed      # seed Super Admin dan optional demo data
npm run db:studio    # Prisma Studio
```

## Authorization model

Authorization selalu divalidasi di server menggunakan gabungan `role` dan `scope`, bukan hanya role. Musyrif hanya dapat melihat kelompok yang ditugaskan. Satu kelompok hanya boleh memiliki satu Musyrif aktif. Mutasi penting memakai activity log, dan penugasan Musyrif memakai transaksi Prisma.

## Deployment production

Target: Vercel, Google Cloud Run, dan hosting Node.js yang mendukung Next.js runtime.
Hosting PHP-only tidak didukung. `npm start` memakai `PORT` dari host (default 3000).
Demo seed dilarang pada production. Migration production hanya memakai `prisma migrate deploy`, bukan `db push`, `migrate dev`, atau `migrate reset`.

- [Deployment, environment, client-IP trust, dan checklist Supabase](docs/deployment.md)
- [Backup/restore Supabase Free](docs/backup-restore.md)
- [Keamanan production](docs/production-security.md)
- [Advisory dependency yang ditunda](docs/dependency-security.md)

Production URL:https://structured-attendance-system.vercel.app
