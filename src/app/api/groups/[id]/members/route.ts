import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { canManageMember, assertGroupMutable } from "@/lib/authorization";
import { apiError, ok } from "@/lib/api";
import { lockGroup } from "@/lib/group-lock";
import { memberSchema } from "@/lib/validators";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = await requireAuth();
    const { id: groupId } = await params;
    return await prisma.$transaction(async (tx) => {
      await lockGroup(tx, groupId);
      const group = await tx.group.findUnique({ where: { id: groupId }, include: { sector: { include: { mahalli: true } } } });
      if (!group || !canManageMember(currentUser, group)) return NextResponse.json({ error: "Anda tidak memiliki akses ke anggota kelompok ini." }, { status: 403 });
      assertGroupMutable(group);
      const input = memberSchema.parse(await request.json());
      const member = await tx.member.create({ data: { groupId, name: input.name } });
      await tx.activityLog.create({ data: { actorId: currentUser.userId, action: "CREATE", entityType: "MEMBER", entityId: member.id, description: `Menambahkan anggota ${member.name}.` } });
      return ok({ member }, { status: 201 });
    }, { isolationLevel: "ReadCommitted" });
  } catch (error) {
    return apiError(error);
  }
}
