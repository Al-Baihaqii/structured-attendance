"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Activity, Bell, ChevronDown, ChevronRight, CircleUserRound, Compass, FolderKanban, LayoutDashboard, LogOut, Map, Menu, Settings2, ShieldCheck, UsersRound, X } from "lucide-react";
import type { SessionUser } from "@/lib/types";
import { ROLE_LABELS } from "@/lib/types";

const navItems = [
  { href: "/dashboard", label: "Ringkasan", icon: LayoutDashboard, roles: ["SUPER_ADMIN", "CITY_ADMIN", "MAHALLI_ADMIN", "SECTOR_ADMIN", "MUSYRIF"] },
  { href: "/dashboard/wilayah", label: "Wilayah", icon: Map, roles: ["SUPER_ADMIN", "CITY_ADMIN", "MAHALLI_ADMIN", "SECTOR_ADMIN"] },
  { href: "/dashboard/groups", label: "Kelompok", icon: FolderKanban, roles: ["SUPER_ADMIN", "CITY_ADMIN", "MAHALLI_ADMIN", "SECTOR_ADMIN", "MUSYRIF"] },
  { href: "/dashboard/users", label: "Pengguna", icon: UsersRound, roles: ["SUPER_ADMIN", "CITY_ADMIN", "MAHALLI_ADMIN", "SECTOR_ADMIN"] },
  { href: "/dashboard/activity-logs", label: "Log Aktivitas", icon: Activity, roles: ["SUPER_ADMIN", "CITY_ADMIN", "MAHALLI_ADMIN", "SECTOR_ADMIN"] },
];

export function DashboardShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  async function logout() {
    setLoggingOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const links = navItems.filter((item) => item.roles.includes(user.role));
  const initials = user.name.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="min-h-screen bg-canvas">
      {mobileOpen && <button className="fixed inset-0 z-30 bg-ink/30 lg:hidden" aria-label="Tutup menu" onClick={() => setMobileOpen(false)} />}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-[250px] flex-col border-r border-line bg-white transition-transform lg:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex h-[76px] items-center justify-between border-b border-line px-6">
          <Link href="/dashboard" className="flex items-center gap-3" onClick={() => setMobileOpen(false)}>
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-brand text-xs font-bold text-white">SA</div>
            <div><p className="text-sm font-bold tracking-tight">Structured</p><p className="text-[11px] font-medium text-muted">Attendance</p></div>
          </Link>
          <button className="text-slate-400 lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Tutup menu"><X size={19} /></button>
        </div>
        <div className="flex-1 px-4 py-6">
          <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Workspace</p>
          <nav className="space-y-1">
            {links.map((item) => {
              const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
              const Icon = item.icon;
              return <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition ${active ? "bg-brand-soft text-brand" : "text-slate-500 hover:bg-slate-50 hover:text-ink"}`}><Icon size={17} strokeWidth={active ? 2.4 : 2} /><span>{item.label}</span>{active && <ChevronRight className="ml-auto" size={15} />}</Link>;
            })}
          </nav>
          {user.role === "MUSYRIF" && <div className="mt-8 rounded-xl bg-[#fff6ed] p-4"><Compass size={18} className="text-coral" /><p className="mt-3 text-xs font-bold text-ink">Kelompok Saya</p><p className="mt-1 text-xs leading-5 text-muted">Akses Anda terbatas pada kelompok yang ditugaskan.</p><Link href="/dashboard/groups" className="mt-3 inline-flex text-xs font-bold text-coral">Lihat kelompok <ChevronRight size={14} /></Link></div>}
        </div>
        <div className="border-t border-line p-4">
          <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3"><div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand text-xs font-bold text-white">{initials}</div><div className="min-w-0"><p className="truncate text-xs font-bold text-ink">{user.name}</p><p className="truncate text-[11px] text-muted">{ROLE_LABELS[user.role]}</p></div><button className="ml-auto text-slate-400 hover:text-red-500" onClick={logout} disabled={loggingOut} aria-label="Keluar"><LogOut size={16} /></button></div>
        </div>
      </aside>

      <div className="lg:pl-[250px]">
        <header className="sticky top-0 z-20 flex h-[76px] items-center justify-between border-b border-line bg-canvas/90 px-5 backdrop-blur sm:px-8">
          <div className="flex items-center gap-3"><button className="rounded-lg p-2 text-slate-500 hover:bg-white lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Buka menu"><Menu size={20} /></button><div><p className="text-xs text-muted">Rabu, 09 September 2026</p><p className="mt-0.5 text-sm font-bold text-ink">Ruang kerja Anda</p></div></div>
          <div className="flex items-center gap-2"><button className="relative rounded-lg p-2.5 text-slate-400 hover:bg-white hover:text-brand" aria-label="Notifikasi"><Bell size={18} /><span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-coral" /></button><div className="hidden h-6 w-px bg-line sm:block" /><div className="hidden items-center gap-2 text-right sm:flex"><p className="text-xs font-bold">{user.name}</p><CircleUserRound className="text-brand" size={19} /></div></div>
        </header>
        <main className="mx-auto max-w-[1440px] px-5 py-8 sm:px-8">{children}</main>
      </div>
    </div>
  );
}