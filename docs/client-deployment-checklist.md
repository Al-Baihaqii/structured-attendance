# Checklist Deployment Client Baru

Checklist internal untuk operator teknis yang melakukan deployment Structured Attendance.
Gunakan bersama [deployment guide](deployment-guide.md), [environment reference](environment-reference.md),
dan [operations guide](operations-guide.md). Centang hanya setelah hasil diverifikasi;
catat bukti, pengecualian, dan penanggung jawab dalam catatan deployment client.
Jangan mencantumkan credential asli, cookie, atau data pribadi dalam checklist.

## Identitas deployment

| Informasi | Diisi operator |
| --- | --- |
| Nama client | … |
| Domain / origin production | … |
| Hosting dan project | … |
| Project database / Redis (tanpa credential) | … |
| Git tag atau commit release | … |
| Tanggal deployment | … |
| Operator teknis / PIC client | … |
| Referensi hasil UAT dan persetujuan release | … |

## 1. Persiapan client

- [ ] Domain disepakati; akses DNS dan penanggung jawab perpanjangan tersedia.
- [ ] Hosting dipilih dan kepemilikan akun/billing disepakati. Acuan deployment saat
  ini adalah Vercel + Supabase PostgreSQL + Upstash Redis sesuai panduan yang ada.
- [ ] Untuk Cloud Run atau hosting Node lainnya, kebutuhan container/proses Node
  persisten, reverse proxy, dan konfigurasi IP tepercaya sudah dipenuhi.
- [ ] Hosting mendukung Next.js Node runtime, Node.js 24 atau 22, serta install/build;
  hosting PHP-only atau static-only tidak digunakan.
- [ ] PostgreSQL dan Upstash Redis client disiapkan terpisah dari development/UAT
  dan data client lain; preview tidak memakai credential production.
- [ ] Operator teknis dan PIC client ditunjuk, termasuk kontak eskalasi dan pemilik backup.
- [ ] Struktur wilayah awal, administrator awal, serta skenario UAT disepakati.

## 2. Infrastruktur

- [ ] Identitas project/database tujuan diverifikasi melalui panel provider, bukan
  hanya nama database atau `.env` developer.
- [ ] PostgreSQL dapat diakses dari runtime dan job migration dengan TLS yang benar.
- [ ] `DATABASE_URL` memakai pooling yang sesuai. Untuk serverless Supabase, gunakan
  transaction pooler dengan opsi Prisma yang sesuai dan connection limit terukur.
- [ ] `DIRECT_URL` memakai koneksi direct atau session pooler untuk migration,
  bukan transaction pooler.
- [ ] Redis Upstash tersedia dengan REST endpoint HTTPS dan token read/write.
- [ ] Outbound HTTPS ke Upstash dan koneksi PostgreSQL dari hosting diperbolehkan.
- [ ] HTTPS/domain berfungsi; jalur langsung yang dapat melewati trusted proxy ditutup.
- [ ] Supabase Data API dinonaktifkan jika tidak dipakai; grant tabel, sequence,
  function, dan default privilege diperiksa agar `anon`/`authenticated` tidak
  memperoleh akses ke data aplikasi. Ikuti [checklist keamanan](deployment.md).
- [ ] Backup terenkripsi, lokasi penyimpanan di luar project, jadwal, dan retensi
  ditetapkan; prosedur [restore](backup-restore.md) dipahami operator.

## 3. Konfigurasi environment

Isi nilai melalui secret manager hosting/job release. Tabel ini hanya memuat nama
dan tujuan variable; tidak memuat nilai rahasia.

| Variable | Pemeriksaan |
| --- | --- |
| `APP_ORIGIN` | Origin HTTPS resmi, tanpa path/query/wildcard |
| `AUTH_SECRET` | Secret acak kuat, minimal 32 byte acak sebagai kebijakan operasional; sama di seluruh replica |
| `DATABASE_URL` | Koneksi runtime ke database client yang benar |
| `DIRECT_URL` | Koneksi direct/session untuk migration |
| `UPSTASH_REDIS_REST_URL` | Endpoint Redis production client |
| `UPSTASH_REDIS_REST_TOKEN` | Token server-only read/write untuk Redis tersebut |
| `CLIENT_IP_MODE` | `vercel` atau `trusted-proxy`; bukan `none` untuk production |
| `TRUSTED_PROXY_IP_HEADER` | Untuk trusted-proxy: header satu IP yang ditimpa ingress tepercaya |
| `VERCEL` | Flag `1` disediakan platform pada Vercel; jangan dipalsukan di hosting lain |
| `NODE_ENV` | Production pada runtime; wajib eksplisit saat bootstrap production |
| `PORT` | Untuk Cloud Run/Node hosting sesuai port host; tidak diperlukan sebagai konfigurasi fungsi Vercel |
| `NEXT_PUBLIC_APP_URL` | Fallback origin lama; prioritaskan `APP_ORIGIN` eksplisit |
| `SEED_DEMO_DATA` | `false` pada production |
| `SUPER_ADMIN_USERNAME`, `SUPER_ADMIN_NAME` | Input akun awal, hanya untuk job bootstrap |
| `SUPER_ADMIN_PASSWORD` | Secret akun awal, hanya untuk job bootstrap |
| `SUPER_ADMIN_EMAIL` | Opsional untuk bootstrap |

- [ ] Seluruh variable wajib tersedia pada runtime dan job yang membutuhkannya.
- [ ] Tidak ada credential di repository, image, log build, atau variable `NEXT_PUBLIC_`.
- [ ] Mode Vercel menggunakan header yang dikendalikan Vercel. Mode trusted-proxy
  menggunakan header satu IP yang ditimpa proxy, bukan X-Forwarded-For arbitrer.
- [ ] Prioritas environment diperiksa; file lokal development tidak ikut artifact.
- [ ] Kedua konfigurasi Redis terisi di production; bypass development tidak dipakai.
- [ ] Konfigurasi cocok dengan [environment reference](environment-reference.md).

## 4. Application setup dan migration

- [ ] Clone repository melalui URL resmi yang diberikan dan checkout revision yang
  disetujui. Contoh berikut memakai placeholder, bukan URL project sebenarnya:

  ```sh
  git clone <repository-url> structured-attendance
  cd structured-attendance
  git checkout <release-tag-or-commit>
  ```

- [ ] Install dari lockfile dan generate Prisma Client pada OS/container target:

  ```sh
  npm ci
  npx prisma generate
  ```

- [ ] Validasi release selesai; hasil dan advisory yang ditunda dicatat:

  ```sh
  npm test
  npx tsc --noEmit
  npx prisma validate
  npm audit --omit=dev
  npm run build
  ```

- [ ] Advisory ditinjau mengikuti [dependency triage](dependency-security.md).
  Jangan menjalankan `npm audit fix --force`.
- [ ] SQL migration ditinjau. Untuk database berisi data, backup dan kompatibilitas
  diperiksa sebelum perubahan; ketidaksesuaian schema/history harus diselesaikan
  melalui review, bukan reset atau baseline otomatis.
- [ ] Migration dijalankan sekali melalui job terkontrol dengan target yang diverifikasi:

  ```sh
  npx prisma migrate status
  npx prisma migrate deploy
  npx prisma migrate status
  ```

- [ ] Status akhir bersih; constraint dan index dari migration tidak dilewati.
  Pending sebelum deploy dapat diharapkan, tetapi failed/divergent history perlu review.
- [ ] Tidak menggunakan `db push`, `migrate dev`, atau `migrate reset` pada production.
- [ ] Vercel memakai build Next.js; Cloud Run/Node hosting menjalankan `npm start`
  dengan konfigurasi host yang benar. `npm run dev` tidak digunakan di production.

## 5. Bootstrap administrator awal

- [ ] Credential bootstrap disediakan melalui kanal aman; akun ditetapkan kepada
  pengelola client, bukan akun bersama untuk pekerjaan rutin.
- [ ] Password akun baru minimal 8 karakter dan maksimal 72 byte UTF-8.
- [ ] Job bootstrap memakai production mode dan demo seed dimatikan. Pilih perintah
  sesuai shell setelah variable bootstrap disediakan dengan aman.

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

- [ ] Akun SUPER_ADMIN awal dapat digunakan. Bootstrap tidak menimpa akun biasa,
  tidak mereset password akun yang ada, dan tidak dijalankan setiap deployment.
- [ ] Variable bootstrap dihapus dari konfigurasi runtime setelah selesai;
  kepemilikan akun diserahkan secara aman. Lihat [production security](production-security.md).

## 6. Verifikasi production dan penerimaan

Jalankan skenario mutasi/negatif terlebih dahulu di UAT terisolasi. Di production,
gunakan akun/data yang disepakati dan utamakan pemeriksaan baca. Jangan mengisi
presensi kelompok nyata hanya untuk smoke test. Catat environment dan hasil tiap uji.

| Area | Checklist verifikasi |
| --- | --- |
| Login | [ ] HTTPS dan login valid berhasil; kredensial salah mendapat pesan umum; cookie Secure dan HTTP-only |
| Logout | [ ] Keluar berhasil; halaman terlindungi meminta login kembali |
| Permission | [ ] Admin terbatas pada scope; akses URL langsung di luar scope ditolak; Log Aktivitas hanya SUPER_ADMIN |
| Wilayah | [ ] Kota/Mahalli/sektor sesuai scope; wilayah kosong dapat menerima anak pertama oleh peran berwenang |
| Kelompok | [ ] Kelompok berada pada sektor yang benar; kelompok dihapus tidak dapat dimutasi, riwayat berizin tetap terbaca |
| Musyrif | [ ] Kandidat aktif sekota; satu kelompok maksimal satu penugasan aktif; satu Musyrif dapat menangani beberapa kelompok |
| Pergantian Musyrif | [ ] Musyrif lama kehilangan akses; pengganti membaca sejarah pendahulu tetapi tidak mengedit presensinya |
| Presensi | [ ] Pertemuan dan presensi tersimpan bersama; nomor berlanjut; alasan IZIN/ALPA wajib; edit masa aktif dan konflik versi bekerja |
| Laporan | [ ] Periode sesuai tanggal pertemuan; persentase memakai total tercatat; data kosong bukan Alpa; riwayat anggota nonaktif tetap dihitung |
| CSV | [ ] Ringkasan Pertemuan dan Detail Presensi dapat diunduh sesuai tanggal/izin; karakter, kutip, dan baris baru terbaca dengan benar |

- [ ] Di UAT, login berulang menghasilkan 429 dengan Retry-After; kegagalan Redis
  menolak login dengan aman. Header IP palsu dan mutation dari origin asing ditolak.
- [ ] Koneksi database/Redis benar-benar terverifikasi; HTTP 200 di `/login` saja
  tidak membuktikan kesehatan keduanya.
- [ ] Backup dan restore ke target terisolasi berhasil diuji; bukti dicatat.
- [ ] Tidak ada blocker yang belum ditangani; pengecualian/risiko tersisa diterima
  secara eksplisit oleh penanggung jawab sebelum membuka traffic client.

## 7. Handover

- [ ] URL resmi, revision live, status migration, serta hasil UAT/deployment diserahkan.
- [ ] Akses hosting, DNS, database, Redis, dan secret manager dipindahkan sesuai
  tanggung jawab; akses sementara operator ditinjau kembali.
- [ ] Client menerima [panduan pengguna](client-guide.md); tim teknis menerima
  [deployment guide](deployment-guide.md), [environment reference](environment-reference.md),
  dan [operations guide](operations-guide.md).
- [ ] PIC backup, retensi, target pemulihan, jadwal restore rehearsal, billing,
  serta perpanjangan domain disepakati dan dicatat.
- [ ] Kontak eskalasi, prosedur incident, dan batas dukungan disepakati; tidak
  mengasumsikan adanya SLA atau monitoring otomatis dari dokumentasi.
- [ ] Risiko dependency, cakupan integration test, dan keterbatasan platform dicatat.
  Mocked tests bukan bukti concurrency PostgreSQL live.
- [ ] Artefak release sebelumnya atau rencana recovery tersedia. Rollback aplikasi
  memerlukan database yang kompatibel; reset database bukan prosedur rollback.
- [ ] PIC client dan operator menyetujui serah terima tanpa menyalin credential
  ke dokumen ini. CSV tidak diperlakukan sebagai backup database.

| Persetujuan | Nama / tanggal / referensi bukti |
| --- | --- |
| Operator deployment | … |
| PIC teknis client | … |
| Penerimaan client | … |
| Pengecualian yang disetujui, bila ada | … |
