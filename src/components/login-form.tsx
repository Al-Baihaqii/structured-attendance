"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Eye, EyeOff, LockKeyhole, UserRound } from "lucide-react";
import { Alert } from "./ui";

export function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (loading) return;
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({ username, password }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data.error || "Username atau password tidak sesuai.");
        return;
      }

      await router.replace("/dashboard");
      router.refresh();
    } catch {
      console.error("[login] request failed");
      setError("Tidak dapat terhubung ke server. Silakan coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <Alert message={error} />
      <div>
        <label className="label" htmlFor="username">Username</label>
        <div className="relative"><UserRound size={17} className="absolute left-3 top-3 text-slate-400" /><input id="username" className="input pl-10" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Masukkan username" autoComplete="username" /></div>
      </div>
      <div>
        <label className="label" htmlFor="password">Password</label>
        <div className="relative"><LockKeyhole size={17} className="absolute left-3 top-3 text-slate-400" /><input id="password" className="input pl-10 pr-10" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Masukkan password" autoComplete="current-password" /><button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-3 top-3 text-slate-400 hover:text-brand" aria-label="Tampilkan password">{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div>
      </div>
      <button type="submit" disabled={loading} className="btn-primary h-11 w-full">{loading ? "Memeriksa..." : "Masuk ke dashboard"}{!loading && <ArrowRight size={16} />}</button>
    </form>
  );
}