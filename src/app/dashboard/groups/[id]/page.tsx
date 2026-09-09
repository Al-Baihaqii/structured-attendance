import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { assertGroupAccess } from "@/lib/authorization";
import { GroupDetailClient } from "@/components/group-detail-client";

export default async function GroupDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSession();
  if (!user) return null;
  const { id } = await params;
  const group = await prisma.group.findUnique({ where: { id }, include: { sector: { include: { mahalli: { include: { city: true } } } }, members: { orderBy: { name: "asc" } }, userGroups: { where: { user: { role: "MUSYRIF", isActive: true } }, include: { user: { select: { id: true, name: true, username: true } } } }, assignmentHistory: { orderBy: { createdAt: "desc" }, take: 10, include: { changedBy: { select: { name: true } } } } } });
  if (!group) notFound();
  try { assertGroupAccess(user, group); } catch { notFound(); }
  const musyrifs = await prisma.user.findMany({ where: { role: "MUSYRIF", isActive: true, ...(user.role === "SUPER_ADMIN" ? {} : { sectorId: group.sectorId }) }, select: { id: true, name: true, username: true, sectorId: true }, orderBy: { name: "asc" } });
  return <GroupDetailClient group={group} musyrifs={musyrifs} canManage={user.role !== "MUSYRIF"} />;
}