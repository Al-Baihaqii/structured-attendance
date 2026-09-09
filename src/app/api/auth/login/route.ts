import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSession, verifyPassword } from "@/lib/auth";
import { loginSchema } from "@/lib/validators";
import { apiError } from "@/lib/api";

export async function POST(request: Request) {
  try {
    const input = loginSchema.parse(await request.json());
    console.info("[auth.login] request received", {
      hasUsername: Boolean(input.username),
      hasPassword: Boolean(input.password),
      authSecretConfigured: Boolean(process.env.AUTH_SECRET),
    });
    if (!process.env.AUTH_SECRET) {
      console.error("[auth.login] AUTH_SECRET is not configured");
      return NextResponse.json({ error: "Konfigurasi sesi server belum tersedia." }, { status: 500 });
    }

    const user = await prisma.user.findUnique({ where: { username: input.username } });
    console.info("[auth.login] account lookup", {
      userFound: Boolean(user),
      userActive: user?.isActive ?? false,
    });
    if (!user || !user.isActive || !(await verifyPassword(input.password, user.passwordHash))) {
      console.info("[auth.login] rejected credentials");
      return NextResponse.json({ error: "Username atau password tidak sesuai." }, { status: 401 });
    }

    await createSession(user);
    console.info("[auth.login] session created", { role: user.role });
    return NextResponse.json({ user: { name: user.name, username: user.username, role: user.role } });
  } catch (error) {
    console.error("[auth.login] request failed", {
      error: error instanceof Error ? error.message : "unknown error",
    });
    return apiError(error);
  }
}