"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, UserPlus, UserRoundPlus, UserRoundX } from "lucide-react";
import { Alert } from "./ui";

type SectorOption = { id: string; name: string; mahalli: { id: string; name: string; city: { id: string; name: string } } };
type CityOption = { id: string; name: string; mahallis: { id: string; name: string; sectors: { id: string; name: string }[] }[] };

function useMutation() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  async function mutate(url: string, body: unknown, method = "POST") {
    setLoading(true); setError(""); setSuccess("");
    const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) setError(data.error || "Permintaan tidak berhasil.");
    else { setSuccess("Perubahan berhasil disimpan."); router.refresh(); }
    setLoading(false);
    return response.ok;
  }
  return { mutate, error, success, loading };
}

export function CreateGroupForm({ sectors }: { sectors: SectorOption[] }) {
  const { mutate, error, success, loading } = useMutation();
  const [name, setName] = useState("");
  const [sectorId, setSectorId] = useState(sectors[0]?.id || "");
  return <form onSubmit={async (e) => { e.preventDefault(); if (await mutate("/api/groups", { name, sectorId })) setName(""); }} className="space-y-3">
    <div><label className="label">Nama kelompok</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Contoh: Kelompok 2" /></div>
    <div><label className="label">Sektor</label><select className="select" value={sectorId} onChange={(e) => setSectorId(e.target.value)}><option value="">Pilih sektor</option>{sectors.map((sector) => <option key={sector.id} value={sector.id}>{sector.mahalli.city.name} / {sector.mahalli.name} / {sector.name}</option>)}</select></div>
    <Alert message={error} /><Alert message={success} tone="success" />
    <button className="btn-primary w-full" disabled={loading || !sectors.length}><Plus size={16} />{loading ? "Menyimpan..." : "Tambah kelompok"}</button>
  </form>;
}

export function CreateHierarchyForm({ type, parentId, label }: { type: "city" | "mahalli" | "sector"; parentId?: string; label: string }) {
  const { mutate, error, success, loading } = useMutation();
  const [name, setName] = useState("");
  return <form onSubmit={async (e) => { e.preventDefault(); const ok = await mutate("/api/hierarchy", { type, name, ...(type === "mahalli" ? { cityId: parentId } : {}), ...(type === "sector" ? { mahalliId: parentId } : {}) }); if (ok) setName(""); }} className="flex gap-2">
    <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={`Nama ${label.toLowerCase()}`} />
    <button className="btn-primary shrink-0 px-3" disabled={loading}><Plus size={16} />Tambah</button>
    {(error || success) && <div className="fixed bottom-6 right-6 z-50 w-80"><Alert message={error || success} tone={error ? "error" : "success"} /></div>}
  </form>;
}

export function CreateUserForm({ cities, sectors }: { cities: CityOption[]; sectors: SectorOption[] }) {
  const { mutate, error, success, loading } = useMutation();
  const [role, setRole] = useState("MUSYRIF");
  const [cityId, setCityId] = useState(cities[0]?.id || "");
  const [mahalliId, setMahalliId] = useState(cities[0]?.mahallis[0]?.id || "");
  const [sectorId, setSectorId] = useState(sectors[0]?.id || "");
  const [form, setForm] = useState({ username: "", name: "", password: "", email: "" });
  const visibleMahallis = cities.find((city) => city.id === cityId)?.mahallis || [];
  const visibleSectors = sectors.filter((sector) => !mahalliId || sector.mahalli.id === mahalliId);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await mutate("/api/users", { ...form, role, cityId: role === "SUPER_ADMIN" ? null : cityId || null, mahalliId: ["MAHALLI_ADMIN", "SECTOR_ADMIN", "MUSYRIF"].includes(role) ? mahalliId || null : null, sectorId: ["SECTOR_ADMIN", "MUSYRIF"].includes(role) ? sectorId || null : null });
    if (ok) setForm({ username: "", name: "", password: "", email: "" });
  };
  return <form onSubmit={submit} className="space-y-3">
    <div className="grid gap-3 sm:grid-cols-2"><div><label className="label">Nama lengkap</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div><div><label className="label">Username</label><input className="input" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></div></div>
    <div className="grid gap-3 sm:grid-cols-2"><div><label className="label">Password sementara</label><input className="input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div><div><label className="label">Peran</label><select className="select" value={role} onChange={(e) => setRole(e.target.value)}><option value="MUSYRIF">Musyrif</option><option value="SECTOR_ADMIN">Admin Sektor</option><option value="MAHALLI_ADMIN">Admin Mahalli</option><option value="CITY_ADMIN">Admin Kota</option><option value="SUPER_ADMIN">Super Admin</option></select></div></div>
    {role !== "SUPER_ADMIN" && <div className="grid gap-3 sm:grid-cols-3"><div><label className="label">Kota</label><select className="select" value={cityId} onChange={(e) => { setCityId(e.target.value); setMahalliId(cities.find((city) => city.id === e.target.value)?.mahallis[0]?.id || ""); }}>{cities.map((city) => <option key={city.id} value={city.id}>{city.name}</option>)}</select></div>{["MAHALLI_ADMIN", "SECTOR_ADMIN", "MUSYRIF"].includes(role) && <div><label className="label">Mahalli</label><select className="select" value={mahalliId} onChange={(e) => setMahalliId(e.target.value)}>{visibleMahallis.map((mahalli) => <option key={mahalli.id} value={mahalli.id}>{mahalli.name}</option>)}</select></div>}{["SECTOR_ADMIN", "MUSYRIF"].includes(role) && <div><label className="label">Sektor</label><select className="select" value={sectorId} onChange={(e) => setSectorId(e.target.value)}>{visibleSectors.map((sector) => <option key={sector.id} value={sector.id}>{sector.name}</option>)}</select></div>}</div>}
    <Alert message={error} /><Alert message={success} tone="success" />
    <button className="btn-primary" disabled={loading}><UserPlus size={16} />{loading ? "Menyimpan..." : "Buat pengguna"}</button>
  </form>;
}

export function DeactivateButton({ userId, label = "Nonaktifkan" }: { userId: string; label?: string }) {
  const { mutate, loading } = useMutation();
  return <button className="btn-quiet text-red-600 hover:bg-red-50" disabled={loading} onClick={() => { if (window.confirm("Nonaktifkan pengguna ini?")) mutate(`/api/users/${userId}`, undefined, "DELETE"); }}><UserRoundX size={15} />{label}</button>;
}

export function MemberForm({ groupId }: { groupId: string }) {
  const { mutate, error, success, loading } = useMutation();
  const [name, setName] = useState("");
  return <form onSubmit={async (e) => { e.preventDefault(); if (await mutate(`/api/groups/${groupId}/members`, { name })) setName(""); }} className="flex flex-col gap-3 sm:flex-row">
    <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama anggota baru" />
    <button className="btn-primary shrink-0"><UserRoundPlus size={16} />{loading ? "..." : "Tambah anggota"}</button>
    {(error || success) && <div className="fixed bottom-6 right-6 z-50 w-80"><Alert message={error || success} tone={error ? "error" : "success"} /></div>}
  </form>;
}

export function AssignmentForm({ groupId, musyrifs, currentMusyrifId }: { groupId: string; musyrifs: { id: string; name: string; sectorId: string | null }[]; currentMusyrifId?: string }) {
  const { mutate, error, success, loading } = useMutation();
  const [musyrifId, setMusyrifId] = useState(currentMusyrifId || "");
  return <div className="space-y-3">
    <div className="flex gap-2"><select className="select" value={musyrifId} onChange={(e) => setMusyrifId(e.target.value)}><option value="">Pilih Musyrif</option>{musyrifs.map((musyrif) => <option key={musyrif.id} value={musyrif.id}>{musyrif.name}</option>)}</select><button className="btn-primary shrink-0" disabled={loading || !musyrifId} onClick={() => mutate(`/api/groups/${groupId}/assignment`, { musyrifId })}>Tugaskan</button></div>
    <button className="btn-quiet w-full justify-start text-red-600 hover:bg-red-50" disabled={loading || !currentMusyrifId} onClick={() => { if (window.confirm("Cabut penugasan Musyrif ini?")) mutate(`/api/groups/${groupId}/assignment`, undefined, "DELETE"); }}>Cabut penugasan</button>
    <Alert message={error} /><Alert message={success} tone="success" />
  </div>;
}