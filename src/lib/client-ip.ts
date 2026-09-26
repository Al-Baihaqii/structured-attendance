import { isIP } from "node:net";

// App Router requests do not expose the socket peer. A proxy header is safe only
// when the configured ingress overwrites it and cannot be bypassed.
export function getTrustedClientIp(request: Request): string | null {
  const mode = process.env.CLIENT_IP_MODE || "none";
  if (mode === "none") return null;

  let header: string;
  if (mode === "vercel" && process.env.VERCEL === "1") {
    header = "x-vercel-forwarded-for";
  } else if (mode === "trusted-proxy") {
    header = process.env.TRUSTED_PROXY_IP_HEADER || "";
    if (!/^[a-z0-9-]+$/i.test(header)) throw new Error("Invalid client IP configuration");
  } else {
    throw new Error("Invalid client IP configuration");
  }

  const value = request.headers.get(header)?.trim();
  // Require one IP, never guess which entry in a forwarded chain is trustworthy.
  if (!value || value.includes("%") || !isIP(value)) throw new Error("Trusted client IP unavailable");
  if (isIP(value) === 4) return value;
  const canonical = new URL(`http://[${value}]/`).hostname.slice(1, -1);
  const mapped = /^::ffff:([0-9a-f]+):([0-9a-f]+)$/.exec(canonical);
  if (mapped) {
    const high = parseInt(mapped[1], 16), low = parseInt(mapped[2], 16);
    return [high >> 8, high & 255, low >> 8, low & 255].join(".");
  }
  return canonical;
}
