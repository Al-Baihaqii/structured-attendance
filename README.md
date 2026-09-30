# Structured Attendance

Structured Attendance adalah sistem manajemen kehadiran berbasis
hierarki untuk mengelola kelompok, penugasan Musyrif, pertemuan, dan
presensi dalam struktur:

**Kota → Mahalli → Sektor → Kelompok**

Antarmuka aplikasi menggunakan Bahasa Indonesia. Hak akses pengguna
dikontrol berdasarkan peran, cakupan wilayah, dan penugasan aktif.

## Overview

Structured Attendance adalah sistem manajemen kehadiran berbasis
hierarki untuk organisasi yang memiliki struktur wilayah dan kelompok.

Sistem membantu administrator mengelola:

-   wilayah organisasi
-   akun pengguna berdasarkan peran
-   kelompok binaan
-   penugasan Musyrif
-   pencatatan pertemuan
-   presensi anggota
-   laporan dan ekspor data

Aplikasi dirancang untuk menjaga histori organisasi tetap konsisten
meskipun terjadi perubahan penugasan, pergantian Musyrif, atau perubahan
struktur pengelolaan.

## Screenshot

-   [Dashboard Structured Attendance](docs/images/dashboard.png)
-   [Manajemen Kelompok](docs/images/kelompok.png)
-   [Detail Kelompok](docs/images/isi_kelompok.png)
-   [Pencatatan Presensi](docs/images/presensi.png)

## Dokumentasi

  ---------------------------------------------------------------------------------
  Pengguna                            Dokumentasi
  ----------------------------------- ---------------------------------------------
  Client, administrator, dan Musyrif  [Panduan pengguna](docs/client-guide.md)

  Engineer deployment                 [Panduan
                                      deployment](docs/deployment-guide.md)

  Developer / administrator hosting   [Referensi
                                      environment](docs/environment-reference.md)

  Operator teknis                     [Panduan
                                      operasional](docs/operations-guide.md)
  ---------------------------------------------------------------------------------

## Fitur Utama

-   Authentication username/password dengan HTTP-only session.
-   Role based access control dan cakupan wilayah.
-   Manajemen kelompok dan anggota.
-   Penugasan Musyrif dengan histori.
-   Pembuatan pertemuan dan presensi.
-   Laporan presensi dan export CSV.
-   Activity Log untuk SUPER_ADMIN.

Data yang belum dicatat tidak otomatis dianggap sebagai Alpa. Histori
anggota nonaktif tetap dipertahankan.

Belum tersedia: - aplikasi mobile native - notifikasi - pemulihan
password mandiri melalui email

## Developer Quick Start

Gunakan Node.js 24 LTS atau 22 LTS, npm, dan database PostgreSQL
development terisolasi.

Salin `.env.example` menjadi `.env`, lalu isi konfigurasi sesuai
dokumentasi environment.

Untuk development lokal:

``` env
APP_ORIGIN=http://localhost:5000
SEED_DEMO_DATA=false
```

Jalankan:

``` bash
npm ci
npm run db:generate
npx prisma migrate deploy
npx prisma db seed
npm run dev
```

## Developer Commands

  Command                       Fungsi
  ----------------------------- -----------------------
  `npm run dev`                 Development server
  `npm test`                    Test suite
  `npm run build`               Production build
  `npm start`                   Production server
  `npx prisma migrate deploy`   Menjalankan migration

Jangan gunakan `migrate dev`, `migrate reset`, atau `db push` pada
database production.

## Technology Stack

-   Next.js App Router
-   React
-   TypeScript
-   Prisma ORM
-   PostgreSQL
-   Tailwind CSS
-   Custom Authentication
-   Upstash Redis

Database PostgreSQL menggunakan Supabase. Supabase Auth tidak digunakan.

## Status Rilis

Deployment Vercel dan proses login telah berhasil diuji pada tahap UAT.

Deployment platform lain membutuhkan konfigurasi dan pengujian tambahan.

Dokumentasi deployment, environment, operasi, dan recovery tersedia pada
folder `docs/`.
