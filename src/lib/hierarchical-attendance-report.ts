import { getReportDateFilter, type ReportDateParameters } from "./report-date-filter";
import { createReportContext } from "./report-context";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "./prisma";
import { getSessionAccessWhere, AuthorizationError, getAccessibleGroupsWhere } from "./authorization";
import { summarizeAttendanceCounts } from "./attendance-summary";
import type { SessionUser } from "./types";

const selectionSchema = z.object({
  cityId: z.string().min(1).optional(), mahalliId: z.string().min(1).optional(), sectorId: z.string().min(1).optional(),
}).refine(value => (!value.mahalliId || value.cityId) && (!value.sectorId || value.mahalliId), "Urutan wilayah tidak valid.");
const emptyCounts = () => ({ HADIR: 0, IZIN: 0, SAKIT: 0, ALPA: 0 });

export async function getHierarchicalAttendanceReport(user: SessionUser, parameters: { cityId?: unknown; mahalliId?: unknown; sectorId?: unknown } & ReportDateParameters) {
  const { filters, date } = getReportDateFilter(parameters);
  const selection = selectionSchema.parse(parameters);
  const scope = getAccessibleGroupsWhere(user);
  const sectorScope: Prisma.SectorWhereInput = user.role === "SUPER_ADMIN" ? {}
    : user.role === "CITY_ADMIN" ? { mahalli: { cityId: user.cityId ?? "__none__" } }
    : user.role === "MAHALLI_ADMIN" ? { mahalliId: user.mahalliId ?? "__none__" }
    : user.role === "SECTOR_ADMIN" ? { id: user.sectorId ?? "__none__" }
    : { groups: { some: scope } };
  const mahalliScope: Prisma.MahalliWhereInput = user.role === "SUPER_ADMIN" ? {}
    : user.role === "CITY_ADMIN" ? { cityId: user.cityId ?? "__none__" }
    : user.role === "MAHALLI_ADMIN" ? { id: user.mahalliId ?? "__none__" }
    : { sectors: { some: sectorScope } };
  const cityScope: Prisma.CityWhereInput = user.role === "SUPER_ADMIN" ? {}
    : user.role === "CITY_ADMIN" ? { id: user.cityId ?? "__none__" }
    : { mahallis: { some: mahalliScope } };
  return prisma.$transaction(async tx => {
    const breadcrumbs: { name: string; selection: typeof selection }[] = [];
    if (selection.cityId) {
      const city = await tx.city.findFirst({ where: { AND: [cityScope, { id: selection.cityId }] }, select: { name: true } });
      if (!city) throw new AuthorizationError();
      breadcrumbs.push({ name: city.name, selection: { cityId: selection.cityId } });
    }
    if (selection.mahalliId) {
      const mahalli = await tx.mahalli.findFirst({ where: { AND: [mahalliScope, { id: selection.mahalliId, cityId: selection.cityId }] }, select: { name: true } });
      if (!mahalli) throw new AuthorizationError();
      breadcrumbs.push({ name: mahalli.name, selection: { cityId: selection.cityId, mahalliId: selection.mahalliId } });
    }
    if (selection.sectorId) {
      const sector = await tx.sector.findFirst({ where: { AND: [sectorScope, { id: selection.sectorId, mahalliId: selection.mahalliId }] }, select: { name: true } });
      if (!sector) throw new AuthorizationError();
      breadcrumbs.push({ name: sector.name, selection });
    }
    const branch: Prisma.GroupWhereInput = selection.sectorId ? { sectorId: selection.sectorId }
      : selection.mahalliId ? { sector: { mahalliId: selection.mahalliId } }
      : selection.cityId ? { sector: { mahalli: { cityId: selection.cityId } } } : {};
    const groupWhere: Prisma.GroupWhereInput = { AND: [scope, branch] };
    const level = selection.sectorId ? "group" : selection.mahalliId ? "sector" : selection.cityId ? "mahalli" : "city";
    const nodes = level === "city" ? await tx.city.findMany({ where: cityScope, select: { id: true, name: true }, orderBy: [{ name: "asc" }, { id: "asc" }] })
      : level === "mahalli" ? await tx.mahalli.findMany({ where: { AND: [mahalliScope, { cityId: selection.cityId }] }, select: { id: true, name: true }, orderBy: [{ name: "asc" }, { id: "asc" }] })
      : level === "sector" ? await tx.sector.findMany({ where: { AND: [sectorScope, { mahalliId: selection.mahalliId }] }, select: { id: true, name: true }, orderBy: [{ name: "asc" }, { id: "asc" }] })
      : await tx.group.findMany({ where: groupWhere, select: { id: true, name: true, status: true }, orderBy: [{ name: "asc" }, { id: "asc" }] });
    // Flat identity mappings stay on the server; never return descendants to the UI.
    const groups = await tx.group.findMany({ where: groupWhere, select: { id: true, sectorId: true, sector: { select: { mahalliId: true, mahalli: { select: { cityId: true } } } } } });
    const sessions = await tx.attendanceSession.findMany({ where: { ...getSessionAccessWhere(user, filters.history ? "history" : "active"), group: groupWhere, date }, select: { id: true, groupId: true } });
    const aggregates = await tx.attendanceRecord.groupBy({ by: ["sessionId", "status"], where: { session: { ...getSessionAccessWhere(user, filters.history ? "history" : "active"), group: groupWhere, date } }, _count: { _all: true } });
    const buckets = new Map(nodes.map(node => [node.id, { totalGroups: 0, totalMeetings: 0, counts: emptyCounts() }]));
    const groupNodes = new Map(groups.map(group => [group.id, level === "city" ? group.sector.mahalli.cityId : level === "mahalli" ? group.sector.mahalliId : level === "sector" ? group.sectorId : group.id]));
    for (const nodeId of groupNodes.values()) { const bucket = buckets.get(nodeId); if (bucket) bucket.totalGroups++; }
    const sessionNodes = new Map(sessions.map(session => [session.id, groupNodes.get(session.groupId)]));
    for (const nodeId of sessionNodes.values()) { const bucket = nodeId ? buckets.get(nodeId) : undefined; if (bucket) bucket.totalMeetings++; }
    for (const row of aggregates) {
      const nodeId = sessionNodes.get(row.sessionId);
      const bucket = nodeId ? buckets.get(nodeId) : undefined;
      if (bucket) bucket.counts[row.status] += row._count._all;
    }
    return { context: createReportContext(filters), filters, level: level as "city" | "mahalli" | "sector" | "group", selection, breadcrumbs, rows: nodes.map(node => {
      const bucket = buckets.get(node.id)!;
      return { ...node, totalGroups: bucket.totalGroups, totalMeetings: bucket.totalMeetings, ...summarizeAttendanceCounts(bucket.counts) };
    }) };
  }, { isolationLevel: "RepeatableRead" });
}
