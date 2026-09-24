import { z } from "zod";

export type ReportDateParameters = { from?: unknown; to?: unknown; history?: unknown };
const dateParameter = z.preprocess(value => value === "" ? undefined : value,
  z.string({ error: "Tanggal tidak valid." }).pipe(z.iso.date("Tanggal tidak valid.")).optional());
export const reportDateSchema = z.object({ from: dateParameter, to: dateParameter, history: z.enum(["1"]).optional() }).refine(
  ({ from, to }) => !from || !to || from <= to,
  { message: "Tanggal awal harus sebelum atau sama dengan tanggal akhir." },
);

export function getReportDateFilter(parameters: ReportDateParameters = {}) {
  const filters = reportDateSchema.parse(parameters);
  const date = {
    ...(filters.from ? { gte: new Date(`${filters.from}T00:00:00.000Z`) } : {}),
    ...(filters.to ? { lt: new Date(new Date(`${filters.to}T00:00:00.000Z`).getTime() + 86400000) } : {}),
  };
  return { filters, date };
}
