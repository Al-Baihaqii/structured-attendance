import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowUpRight, CheckCircle2, CircleAlert, Info, XCircle } from "lucide-react";

export function Card({ children, className = "", id }: { children: ReactNode; className?: string; id?: string }) {
  return <section id={id} className={`rounded-xl border border-line bg-white shadow-card ${className}`}>{children}</section>;
}

export function SectionHeading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        {eyebrow && <p className="mb-1 text-xs font-bold uppercase tracking-[0.16em] text-brand">{eyebrow}</p>}
        <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatusBadge({ children, tone = "neutral" }: { children: ReactNode; tone?: "green" | "amber" | "red" | "blue" | "neutral" }) {
  const colors = {
    green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    red: "bg-red-50 text-red-700",
    blue: "bg-brand-soft text-brand",
    neutral: "bg-slate-100 text-slate-600",
  };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${colors[tone]}`}>{children}</span>;
}

export function MetricCard({ label, value, detail, icon, accent = "blue" }: { label: string; value: string | number; detail: string; icon: ReactNode; accent?: "blue" | "amber" | "coral" | "green" }) {
  const colors = { blue: "bg-brand-soft text-brand", amber: "bg-amber-50 text-amber-700", coral: "bg-orange-50 text-orange-700", green: "bg-emerald-50 text-emerald-700" };
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div><p className="text-sm font-medium text-muted">{label}</p><p className="mt-3 text-3xl font-bold tracking-tight">{value}</p></div>
        <div className={`rounded-xl p-3 ${colors[accent]}`}>{icon}</div>
      </div>
      <p className="mt-4 text-xs text-muted">{detail}</p>
    </Card>
  );
}

export function Alert({ message, tone = "error" }: { message?: string; tone?: "error" | "success" | "info" }) {
  if (!message) return null;
  const config = {
    error: { icon: <XCircle size={16} />, style: "bg-red-50 text-red-700 border-red-100" },
    success: { icon: <CheckCircle2 size={16} />, style: "bg-emerald-50 text-emerald-700 border-emerald-100" },
    info: { icon: <Info size={16} />, style: "bg-brand-soft text-brand border-brand/10" },
  }[tone];
  return <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${config.style}`}>{config.icon}<span>{message}</span></div>;
}

export function EmptyState({ title, description, href, action }: { title: string; description: string; href?: string; action?: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-4 rounded-full bg-brand-soft p-4 text-brand"><CircleAlert size={22} /></div>
      <h3 className="font-semibold text-ink">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>
      {href && action && <Link href={href} className="btn-primary mt-5">{action}<ArrowUpRight size={15} /></Link>}
    </div>
  );
}