import { Map } from "lucide-react";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CreateHierarchyForm } from "@/components/management-forms";
import { Card, SectionHeading } from "@/components/ui";

export default async function WilayahPage() {
  const user = await getSession();
  if (!user) return null;
  const cities = await prisma.city.findMany({ where: user.role === "SUPER_ADMIN" ? { isActive: true } : { id: user.cityId ?? "__none__", isActive: true }, include: { mahallis: { where: { isActive: true }, include: { sectors: { where: { isActive: true }, include: { _count: { select: { groups: true } } }, orderBy: { name: "asc" } } }, orderBy: { name: "asc" } } }, orderBy: { name: "asc" } });
  const allowedCity = user.role === "SUPER_ADMIN";
  const allowedMahalli = ["SUPER_ADMIN", "CITY_ADMIN"].includes(user.role);
  const allowedSector = ["SUPER_ADMIN", "CITY_ADMIN", "MAHALLI_ADMIN"].includes(user.role);
  return <div>
    <SectionHeading eyebrow="Organisasi" title="Wilayah" description="Kelola struktur kota, mahalli, dan sektor secara bertingkat." action={allowedCity ? <span className="inline-flex items-center gap-2 text-xs font-semibold text-muted"><Map size={15} /> Struktur hierarki aktif</span> : undefined} />
    <div className="space-y-5">
      {allowedCity && <Card className="p-5"><h2 className="mb-3 font-bold">Tambah kota</h2><div className="w-full sm:w-80"><CreateHierarchyForm type="city" label="kota" /></div></Card>}
      {cities.map((city) => <Card key={city.id} className="overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-line bg-slate-50/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand">Kota</p><h2 className="mt-1 text-lg font-bold">{city.name}</h2></div>
          {allowedMahalli && <div className="w-full sm:w-80"><CreateHierarchyForm type="mahalli" parentId={city.id} label="mahalli" /></div>}
        </div>
        <div className="divide-y divide-line">
          {!city.mahallis.length && <p className="p-5 text-sm text-muted">Belum ada Mahalli di kota ini.</p>}
          {city.mahallis.map((mahalli) => <div key={mahalli.id} className="p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div><div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-coral" /><h3 className="font-bold">{mahalli.name}</h3></div><p className="mt-1 pl-4 text-xs text-muted">Mahalli</p></div>
              {allowedSector && <div className="w-full sm:w-80"><CreateHierarchyForm type="sector" parentId={mahalli.id} label="sektor" /></div>}
            </div>
            <div className="mt-5 grid gap-3 pl-0 sm:pl-4 lg:grid-cols-2">
              {!mahalli.sectors.length && <p className="text-sm text-muted">Belum ada Sektor di Mahalli ini.</p>}
              {mahalli.sectors.map((sector) => <div className="rounded-xl border border-line p-4" key={sector.id}><div className="flex items-start justify-between"><div><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">Sektor</p><p className="mt-1 font-semibold">{sector.name}</p></div><span className="rounded-lg bg-brand-soft px-2 py-1 text-xs font-bold text-brand">{sector._count.groups} kelompok</span></div></div>)}
            </div>
          </div>)}
        </div>
      </Card>)}
      {!cities.length && <Card><div className="p-10 text-center text-sm text-muted">Belum ada kota yang tersedia.{allowedCity && " Buat kota pertama melalui formulir di atas."}</div></Card>}
    </div>
  </div>;
}