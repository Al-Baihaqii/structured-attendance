import { createHmac } from "node:crypto";
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";
import { NextResponse } from "next/server";
import { getTrustedClientIp } from "@/lib/client-ip";

let cached: { url: string; token: string; username: Ratelimit; ip: Ratelimit } | undefined;

const unavailable = () => NextResponse.json(
  { error: "Login sementara tidak tersedia. Silakan coba lagi." },
  { status: 503, headers: { "Retry-After": "30", "Cache-Control": "no-store" } },
);

export async function checkLoginRateLimit(request: Request, username: string): Promise<NextResponse | null> {
  try {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    // Only unconfigured local development may run without the external service.
    if (!url && !token && process.env.NODE_ENV !== "production") return null;
    if (!url || !token || !process.env.AUTH_SECRET) return unavailable();
    const endpoint = new URL(url);
    if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password) return unavailable();
    const ip = getTrustedClientIp(request);
    if (!ip) return unavailable();

    if (!cached || cached.url !== url || cached.token !== token) {
      const redis = new Redis({ url, token, retry: false, signal: () => AbortSignal.timeout(3000) });
      const options = { redis, analytics: false, ephemeralCache: false as const, timeout: 3500 };
      cached = {
        url, token,
        username: new Ratelimit({ ...options, prefix: "attendance:login:username:v1", limiter: Ratelimit.slidingWindow(5, "15 m") }),
        ip: new Ratelimit({ ...options, prefix: "attendance:login:ip:v1", limiter: Ratelimit.slidingWindow(30, "15 m") }),
      };
    }
    const identifier = (kind: string, value: string) => createHmac("sha256", process.env.AUTH_SECRET!)
      .update(`${kind}:${value}`).digest("hex");
    const results = await Promise.all([
      cached.username.limit(identifier("username", username.trim().normalize("NFKC").toLowerCase())),
      cached.ip.limit(identifier("ip", ip)),
    ]);
    await Promise.all(results.map((result) => result.pending));
    // The SDK deliberately fails open on its own timeout; login must fail closed.
    if (results.some((result) => result.reason === "timeout")) return unavailable();
    const denied = results.filter((result) => !result.success);
    if (denied.length) {
      const retryAfter = Math.max(1, Math.ceil((Math.max(...denied.map((result) => result.reset)) - Date.now()) / 1000));
      return NextResponse.json({ error: "Terlalu banyak percobaan login. Silakan coba lagi nanti." }, {
        status: 429, headers: { "Retry-After": String(retryAfter), "Cache-Control": "no-store" },
      });
    }
    return null;
  } catch {
    // Neither SDK errors nor identifiers belong in responses or routine logs.
    return unavailable();
  }
}
