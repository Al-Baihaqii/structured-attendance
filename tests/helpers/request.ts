// Exercise the real request guard with the same headers a same-origin browser sends.
process.env.APP_ORIGIN = "http://localhost";
export function mutationRequest(url: string, init?: RequestInit) {
  const headers = new Headers(init?.headers);
  headers.set("Origin", "http://localhost");
  if (init?.body) headers.set("Content-Type", "application/json");
  return new Request(url, { ...init, headers });
}
