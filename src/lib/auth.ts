import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import type { Role } from "@prisma/client";
import { prisma } from "./prisma";
import type { SessionUser } from "./types";

export const SESSION_COOKIE = "structured_attendance_session";
const sessionSecret = () => {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("Konfigurasi sesi server belum tersedia.");
  return new TextEncoder().encode(secret);
};

type TokenPayload = Omit<SessionUser, "name"> & { name?: string };

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, passwordHash: string) {
  return bcrypt.compare(password, passwordHash);
}

export async function createSession(user: {
  id: string;
  username: string;
  name: string;
  role: Role;
  cityId: string | null;
  mahalliId: string | null;
  sectorId: string | null;
  sessionVersion: number;
}) {
  const token = await new SignJWT({
    userId: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    cityId: user.cityId,
    mahalliId: user.mahalliId,
    sectorId: user.sectorId,
    sessionVersion: user.sessionVersion,
  } satisfies TokenPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(sessionSecret());

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, "", { httpOnly: true, expires: new Date(0), path: "/" });
}

export async function getSession(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, sessionSecret());
    const userId = String(payload.userId || "");
    if (!userId) return null;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        name: true,
        role: true,
        isActive: true,
        sessionVersion: true,
        cityId: true,
        mahalliId: true,
        sectorId: true,
      },
    });

    if (!user || !user.isActive || user.sessionVersion !== Number(payload.sessionVersion)) {
      return null;
    }

    return {
      userId: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      cityId: user.cityId,
      mahalliId: user.mahalliId,
      sectorId: user.sectorId,
      sessionVersion: user.sessionVersion,
    };
  } catch {
    return null;
  }
}

export async function requireAuth() {
  const session = await getSession();
  if (!session) throw new Error("Sesi Anda tidak valid. Silakan masuk kembali.");
  return session;
}