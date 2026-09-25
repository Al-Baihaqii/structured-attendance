import { assertUnsafeRequest, readJsonRequest, MAX_LOGIN_BYTES } from "@/lib/request-security";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSession, verifyPassword } from "@/lib/auth";
import { loginSchema } from "@/lib/validators";
import { apiError } from "@/lib/api";

export async function POST(request: Request) {
  try {
    assertUnsafeRequest(request, true, MAX_LOGIN_BYTES);
    const input = loginSchema.parse(await readJsonRequest(request, MAX_LOGIN_BYTES));
    if (!process.env.AUTH_SECRET) {
      return NextResponse.json({ error: "Konfigurasi sesi server belum tersedia." }, { status: 500 });
    }

    const user = await prisma.user.findUnique({ where: { username: input.username } });
    if (!user || !user.isActive || !(await verifyPassword(input.password, user.passwordHash))) {
      return NextResponse.json({ error: "Username atau password tidak sesuai." }, { status: 401 });
    }

    await createSession(user);
    return NextResponse.json({ user: { name: user.name, username: user.username, role: user.role } });
  } catch (error) {
    return apiError(error);
  }
}