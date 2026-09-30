# Panduan Pengguna Structured Attendance

Panduan ini ditujukan untuk administrator organisasi dan Musyrif. Konfigurasi server,
database, dan pemulihan layanan ditangani tim teknis melalui [panduan operasional](operations-guide.md).

## 1. Mengenal aplikasi

Structured Attendance mencatat pertemuan dan presensi dalam struktur:

**Kota → Mahalli → Sektor → Kelompok → Anggota**

Anggota tetap menjadi bagian kelompok ketika Musyrif berganti. Pertemuan dan presensi
lama tetap tersimpan. Hubungi administrator untuk mendapatkan alamat aplikasi resmi
dan akun pribadi; jangan berbagi password.

## 2. Peran dan batas akses

| Peran | Cakupan kelompok dan laporan |
| --- | --- |
| SUPER_ADMIN | Seluruh wilayah; juga dapat membaca Log Aktivitas |
| CITY_ADMIN | Kelompok dalam kota yang ditetapkan |
| MAHALLI_ADMIN | Kelompok dalam Mahalli yang ditetapkan |
| SECTOR_ADMIN | Kelompok dalam sektor yang ditetapkan |
| MUSYRIF | Kelompok dengan penugasan aktif untuk akun tersebut, dalam kota yang sama |

Administrator mengelola kelompok sesuai cakupannya. Hak membuat akun lebih terbatas:
SUPER_ADMIN dapat membuat semua peran; CITY_ADMIN dapat membuat admin Mahalli,
admin sektor, dan Musyrif dalam kotanya; MAHALLI_ADMIN dapat membuat admin sektor
dalam Mahallinya. SECTOR_ADMIN dan MUSYRIF tidak dapat membuat akun.

Akun Musyrif dimiliki oleh kota, bukan oleh Mahalli/sektor. Admin Mahalli/sektor
dapat menugaskan kandidat Musyrif aktif sekota ke kelompok yang dikelolanya, tetapi
tidak memperoleh hak mengelola akun Musyrif tersebut. Form atau pilihan yang terlihat
bukan jaminan izin: server tetap memvalidasi setiap tindakan.

## 3. Masuk dan keluar

1. Buka alamat resmi aplikasi dan isi username serta password.
2. Setelah masuk, gunakan menu yang tersedia sesuai peran.
3. Gunakan tombol **Keluar** ketika selesai, terutama pada perangkat bersama.

Kesalahan kredensial ditampilkan secara umum. Jika terlalu sering mencoba, tunggu
sebelum mencoba lagi. Jika muncul pesan login sementara tidak tersedia, hubungi
administrator layanan. Untuk lupa password atau perubahan akun, hubungi administrator;
belum ada alur pemulihan password mandiri melalui email.

## 4. Persiapan administrator

1. Pada **Wilayah**, buat kota, Mahalli, dan sektor sesuai kewenangan.
2. Pada **Pengguna**, buat akun dengan peran dan wilayah yang benar. Untuk Musyrif,
   pilih kota saja.
3. Pada **Kelompok**, buat kelompok pada sektor yang sesuai.
4. Buka kelompok dan tambahkan anggota melalui **Daftar anggota**.
5. Pada **Musyrif aktif**, pilih kandidat sekota dan simpan penugasan.

Satu Musyrif dapat menangani beberapa kelompok. Satu kelompok hanya memiliki satu
Musyrif aktif. Penggantian menutup masa penugasan lama dan membuat masa baru;
memilih kembali Musyrif yang masih aktif tidak membuat penugasan baru. Pencabutan
penugasan mempertahankan sejarahnya. Pertemuan baru memerlukan penugasan aktif.

Sebelum menonaktifkan akun Musyrif, cabut atau alihkan semua penugasan aktifnya.
Perubahan kota/peran akun dengan penugasan aktif juga ditolak. Perpindahan kelompok
lintas kota tidak diizinkan selama masih ada penugasan aktif.

## 5. Mencatat pertemuan dan presensi

1. Buka **Kelompok**, lalu kelompok yang akan dicatat.
2. Periksa nomor pertemuan berikutnya. Nomor akhir ditentukan otomatis saat
   penyimpanan dan tetap berlanjut ketika Musyrif berganti.
3. Isi tanggal pertemuan; catatan/materi opsional, maksimal 1.000 karakter.
4. Pilih status presensi untuk anggota aktif yang ingin dicatat.
5. Isi alasan sesuai ketentuan, lalu tekan **Simpan pertemuan & presensi** sekali.
6. Tunggu pesan berhasil dan periksa pertemuan pada daftar.

| Status | Ketentuan alasan |
| --- | --- |
| HADIR | Opsional |
| IZIN | Wajib |
| SAKIT | Opsional |
| ALPA | Wajib |

Pilihan **Belum diisi** pada form pertemuan baru tidak membuat catatan presensi dan
tidak dianggap Alpa. Jika penyimpanan gagal, isian dipertahankan. Pertemuan dan
presensi disimpan bersama; kegagalan transaksi tidak menyimpan sebagian data.
Jika koneksi terputus dan hasilnya tidak jelas, periksa daftar pertemuan sebelum
mencoba lagi agar tidak membuat pertemuan tambahan.

## 6. Membaca dan memperbaiki presensi

Klik **Lihat detail** pada pertemuan untuk melihat informasi, ringkasan, anggota,
status, dan alasan presensi. Jika tersedia form edit, ubah status/alasan lalu klik
**Simpan presensi**. Form edit mengirim seluruh daftar anggota yang ditampilkan dan
memerlukan status valid pada setiap baris; berbeda dari pilihan kosong pada form
pertemuan baru. Anggota nonaktif dapat tetap muncul pada riwayat pertemuan.

Jika ada konflik karena data telah berubah, catat isian yang ingin dipertahankan,
pilih **Muat ulang data terbaru**, periksa versi terbaru, lalu masukkan ulang perubahan.
Memuat ulang membuang input yang belum tersimpan. Jangan menimpa perubahan pengguna
lain tanpa meninjaunya.

Aturan saat Musyrif berganti:

- Musyrif lama kehilangan akses kelompok ketika penugasannya tidak lagi aktif.
- Musyrif saat ini dapat membaca semua pertemuan kelompok, termasuk presensi dan
  alasan dari Musyrif sebelumnya.
- Musyrif hanya dapat mengedit presensi pertemuan milik masa penugasan aktifnya.
  Jika kembali ke kelompok pada masa baru, pertemuan masa lamanya juga hanya baca.
- Administrator tetap dapat mengakses sejarah kelompok sesuai cakupan wilayahnya.

## 7. Anggota nonaktif dan kelompok yang dihapus

Administrator dapat menonaktifkan anggota melalui daftar anggota. Riwayat presensinya
tidak dihapus. Gunakan **Tampilkan nonaktif**, lalu **Riwayat presensi** untuk melihat
ringkasan dan riwayat anggota, urut pertemuan terbaru lebih dahulu.

Kelompok berstatus dihapus tidak muncul pada daftar kelompok operasional, tetapi
riwayatnya tetap tersedia melalui laporan/tautan yang berwenang. Semua perubahan
pada kelompok yang dihapus ditolak. Status nonaktif berbeda dari dihapus: kebijakan
saat ini tidak otomatis melarang mutasi kelompok nonaktif.

## 8. Membaca laporan

- **Presensi**: telusuri Kota → Mahalli → Sektor → Kelompok sesuai akses.
- **Ringkasan presensi kelompok**: lihat jumlah pertemuan, presensi tercatat, tiap
  status, persentase, dan rincian per pertemuan.
- **Riwayat presensi** anggota: lihat jumlah/status presensi dan sejarah pertemuan.

Gunakan **Dari tanggal**, **Sampai tanggal**, dan **Terapkan** pada laporan yang
menampilkan filter tersebut. Kedua tanggal termasuk dalam periode. **Semua tanggal**
menghapus batas periode pada laporan kelompok. Filter laporan kelompok membatasi
ringkasan, bukan daftar semua pertemuan di bagian lain halaman.

Persentase hadir = **HADIR ÷ seluruh presensi tercatat × 100%**. Contoh: 8 Hadir,
1 Izin, dan 1 Sakit menghasilkan 80%, meskipun masih ada anggota belum dicatat.
Persentase gabungan dihitung dari total catatan, bukan rata-rata persentase pertemuan.
Tanpa catatan, aplikasi menampilkan **Belum ada data**. Riwayat anggota nonaktif
tetap dihitung. Laporan wilayah mengikuti lokasi kelompok saat ini; jika kelompok
dipindahkan, riwayatnya mengikuti wilayah baru.

## 9. Mengunduh CSV kelompok

Pada **Ringkasan presensi kelompok**, pilih tanggal dan **Jenis ekspor**, lalu
klik **Export CSV**. Ekspor memakai tanggal pada form saat tombol ditekan;
klik **Terapkan** terlebih dahulu jika ingin mencocokkan angka yang tampil.

| Pilihan | Isi |
| --- | --- |
| Ringkasan Pertemuan | Pertemuan, tanggal, materi/catatan, Musyrif, tercatat, Hadir, Izin, Sakit, Alpa, persentase hadir |
| Detail Presensi | Pertemuan, tanggal, Musyrif, anggota, status, alasan |

Unduhan hanya mencakup data dalam akses Anda dan periode yang dipilih. Catatan yang
tidak ada tidak ditambahkan sebagai Alpa. Musyrif aktif dapat mengekspor sejarah
pendahulunya; Musyrif yang penugasannya telah berakhir tidak dapat mengekspor kelompok
tersebut. Buka CSV di Excel/Google Sheets; jika kolom tidak terpisah otomatis, impor
sebagai UTF-8 dengan pemisah koma. Bagikan hanya kepada pihak berwenang, terutama
ekspor detail yang berisi nama dan alasan presensi.

## 10. Bantuan dan batas fitur

Sampaikan waktu kejadian, halaman, tindakan, dan pesan error kepada administrator.
Jangan mengirim password, cookie, atau ekspor data pribadi melalui kanal bantuan umum.
Jika kelompok menghilang setelah pergantian Musyrif, minta administrator memeriksa
penugasan aktif sebelum menganggapnya kehilangan data.

Log Aktivitas hanya tersedia untuk SUPER_ADMIN. Ikon notifikasi bukan layanan
notifikasi yang sudah diimplementasikan. Belum tersedia aplikasi mobile native,
ekspor PDF, atau kontrol edit/hapus informasi pertemuan. Panduan ini tidak menjanjikan
tombol untuk setiap kemampuan API; perubahan administratif yang tidak tersedia di
layar perlu ditangani administrator bersama tim teknis.
