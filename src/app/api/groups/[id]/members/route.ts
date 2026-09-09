import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { canManageMember } from "@/lib/authorization";
import { apiError, ok } from "@/lib/api";
import { memberSchema } from "@/lib/validators";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = await requireAuth();
    const { id: groupId } = await params;
    const group = await prisma.group.findUnique({ where: { id: groupId }, include: { sector: { include: { mahalli: true } } } });
    if (!group || !canManageMember(currentUser, group)) return NextResponse.json({ error: "Anda tidak memiliki akses ke anggota kelompok ini." }, { status: 403 });
    const input = memberSchema.parse(await request.json());
    const member = await prisma.member.create({ data: { groupId, name: input.name } });
    await prisma.activityLog.create({ data: { actorId: currentUser.userId, action: "CREATE", entityType: "MEMBER", entityId: member.id, description: `Menambahkan anggota ${member.name}.` } });
    return ok({ member }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}