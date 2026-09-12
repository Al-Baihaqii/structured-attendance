import { z } from "zod";

export const loginSchema = z.object({
  username: z.string().trim().min(1, "Username wajib diisi.").max(50),
  password: z.string().min(1, "Password wajib diisi."),
});

export const userSchema = z.object({
  username: z.string().trim().min(3, "Username minimal 3 karakter.").max(30).regex(/^[a-zA-Z0-9._-]+$/, "Username hanya boleh berisi huruf, angka, titik, garis bawah, atau strip."),
  name: z.string().trim().min(2, "Nama wajib diisi.").max(100),
  email: z.string().trim().email("Email tidak valid.").optional().or(z.literal("")),
  password: z.string().min(8, "Password minimal 8 karakter.").optional(),
  role: z.enum(["SUPER_ADMIN", "CITY_ADMIN", "MAHALLI_ADMIN", "SECTOR_ADMIN", "MUSYRIF"]),
  cityId: z.string().nullable().optional(),
  mahalliId: z.string().nullable().optional(),
  sectorId: z.string().nullable().optional(),
});

export const groupSchema = z.object({
  name: z.string().trim().min(2, "Nama kelompok wajib diisi.").max(100),
  sectorId: z.string().min(1, "Sektor wajib dipilih."),
});

export const memberSchema = z.object({
  name: z.string().trim().min(2, "Nama anggota wajib diisi.").max(100),
});

export const meetingSchema = z.object({
  meetingNumber: z.number({ error: "Nomor pertemuan harus berupa bilangan bulat positif." }).int("Nomor pertemuan harus berupa bilangan bulat positif.").positive("Nomor pertemuan harus berupa bilangan bulat positif.").max(2147483647, "Nomor pertemuan terlalu besar."),
  date: z.string({ error: "Tanggal pertemuan wajib diisi." }).min(1, "Tanggal pertemuan wajib diisi.").pipe(z.iso.date("Tanggal pertemuan tidak valid.")),
  notes: z.string({ error: "Catatan harus berupa teks." }).trim().max(1000, "Catatan maksimal 1000 karakter.").optional(),
});

export const assignmentSchema = z.object({
  musyrifId: z.string().min(1, "Musyrif wajib dipilih."),
  reason: z.string().trim().max(250).optional(),
});

export const attendanceRecordSchema = z.object({
  memberId: z.string({ error: "Anggota wajib dipilih." }).trim().min(1, "Anggota wajib dipilih."),
  status: z.enum(["HADIR", "IZIN", "SAKIT", "ALPA"], { error: "Status presensi tidak valid." }),
  reason: z.string({ error: "Alasan harus berupa teks." }).trim().optional(),
}).superRefine((record, ctx) => {
  if ((record.status === "IZIN" || record.status === "ALPA") && !record.reason) {
    ctx.addIssue({ code: "custom", path: ["reason"], message: "Alasan wajib diisi untuk status Izin dan Alpa." });
  }
});

export const attendanceBatchSchema = z.object({
  records: z.array(attendanceRecordSchema).min(1, "Belum ada presensi untuk disimpan."),
}).superRefine(({ records }, ctx) => {
  const memberIds = new Set<string>();
  records.forEach((record, index) => {
    if (memberIds.has(record.memberId)) ctx.addIssue({ code: "custom", path: ["records", index, "memberId"], message: "Anggota tidak boleh dikirim lebih dari satu kali." });
    memberIds.add(record.memberId);
  });
});

export function validateScopeForRole(role: z.infer<typeof userSchema>["role"], scope: { cityId?: string | null; mahalliId?: string | null; sectorId?: string | null; }) {
  if (role === "CITY_ADMIN" && !scope.cityId) return "Admin Kota harus memiliki kota.";
  if (role === "MAHALLI_ADMIN" && !scope.mahalliId) return "Admin Mahalli harus memiliki mahalli.";
  if (role === "SECTOR_ADMIN" && !scope.sectorId) return "Admin Sektor harus memiliki sektor.";
  if (role === "SUPER_ADMIN" && (scope.cityId || scope.mahalliId || scope.sectorId)) return "Super Admin tidak boleh memiliki scope wilayah.";
  return null;
}
