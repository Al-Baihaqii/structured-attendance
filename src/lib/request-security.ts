import { HttpError } from "./http-error";

export const MAX_JSON_BYTES = 1024 * 1024;
export const MAX_LOGIN_BYTES = 16 * 1024;

function appOrigin(request: Request) {
  const configured = process.env.APP_ORIGIN || process.env.NEXT_PUBLIC_APP_URL;
  if (configured) {
    const url = new URL(configured);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error("Invalid app origin configuration");
    if (process.env.NODE_ENV === "production" && url.protocol !== "https:") throw new Error("Production origin must use HTTPS");
    return url.origin;
  }
  const url = new URL(request.url);
  if (process.env.NODE_ENV !== "production" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) return url.origin;
  throw new Error("App origin is not configured");
}

export function assertUnsafeRequest(request: Request, json = true, maxBytes = MAX_JSON_BYTES) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
  // Never trust Host/X-Forwarded-Host to establish the production allowlist.
  const expected = appOrigin(request);
  if (request.headers.get("origin") !== expected || request.headers.get("sec-fetch-site") === "cross-site") {
    throw new HttpError("Asal permintaan tidak diizinkan.", 403);
  }
  if (json && request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new HttpError("Permintaan harus menggunakan application/json.", 415);
  }
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > maxBytes)) throw new HttpError("Ukuran permintaan terlalu besar.", 413);
}

export async function readJsonRequest(request: Request, maxBytes = MAX_JSON_BYTES): Promise<unknown> {
  assertUnsafeRequest(request, true, maxBytes);
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError("Data JSON tidak valid.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        void reader.cancel().catch(() => {});
        throw new HttpError("Ukuran permintaan terlalu besar.", 413);
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw new HttpError("Data JSON tidak valid."); }
}
