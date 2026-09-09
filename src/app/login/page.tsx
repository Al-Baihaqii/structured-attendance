import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { LoginForm } from "@/components/login-form";

export default async function LoginPage() {
  if (await getSession()) redirect("/dashboard");
  return (
    <main className="min-h-screen bg-[#eef6f7]">
      <div className="mx-auto grid min-h-screen max-w-6xl lg:grid-cols-[1.05fr_0.95fr]">
        <div className="relative hidden overflow-hidden bg-brand-dark p-12 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="absolute -right-20 -top-20 h-80 w-80 rounded-full border-[34px] border-white/5" />
          <div className="absolute -bottom-24 -left-24 h-96 w-96 rounded-full border-[50px] border-coral/10" />
          <div className="relative">
            <div className="mb-12 flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-coral font-bold text-white">SA</div><span className="font-semibold tracking-tight">Structured Attendance</span></div>
            <p className="max-w-md text-sm font-semibold uppercase tracking-[0.2em] text-coral">Manajemen kehadiran terstruktur</p>
            <h1 className="mt-5 max-w-lg text-5xl font-bold leading-[1.08] tracking-tight">Satu ruang untuk mengelola wilayah dan kelompok.</h1>
            <p className="mt-6 max-w-md text-base leading-7 text-white/70">Bangun koordinasi yang rapi dari kota, mahalli, sektor, hingga setiap kelompok binaan.</p>
          </div>
          <div className="relative border-t border-white/10 pt-5 text-sm text-white/50">Platform internal · Akses berbasis peran dan wilayah</div>
        </div>
        <div className="flex items-center justify-center px-6 py-12 sm:px-12">
          <div className="w-full max-w-sm">
            <div className="mb-10 lg:hidden"><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-brand font-bold text-white">SA</div><span className="font-semibold">Structured Attendance</span></div></div>
            <p className="text-sm font-semibold text-brand">Selamat datang kembali</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight">Masuk ke akun Anda</h2>
            <p className="mt-2 text-sm leading-6 text-muted">Gunakan username dan password yang telah diberikan oleh administrator.</p>
            <div className="mt-8"><LoginForm /></div>
            <p className="mt-8 text-center text-xs text-muted">Akun tidak bisa dibuat secara publik. Hubungi administrator jika membutuhkan akses.</p>
          </div>
        </div>
      </div>
    </main>
  );
}