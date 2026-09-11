const DEFAULT_BASE_URL = "https://openapi.sweepandgo.com";
const DEFAULT_TIMEOUT_MS = 15_000;

export type SweepAndGoMethod = "GET" | "POST" | "PUT";
export type SweepAndGoTransportConnection = { baseUrl?: string; apiToken: string };

export class SweepAndGoError extends Error {
  readonly code: "not_configured" | "unauthorized" | "timeout" | "unavailable" | "invalid_response" | "rejected";
  readonly status: number;
  readonly uncertain: boolean;
  constructor(
    message: string,
    code: "not_configured" | "unauthorized" | "timeout" | "unavailable" | "invalid_response" | "rejected",
    status = 502,
    uncertain = false,
  ) { super(message); this.name = "SweepAndGoError"; this.code = code; this.status = status; this.uncertain = uncertain; }
}

export async function requestSweepAndGo<T = Record<string, unknown>>(
  connection: SweepAndGoTransportConnection,
  path: string,
  options: { method?: SweepAndGoMethod; query?: Record<string, string | number | undefined>; body?: unknown; timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<T> {
  if (!connection.apiToken.trim()) throw new SweepAndGoError("Sweep & Go is not connected.", "not_configured", 503);
  const url = providerUrl(connection.baseUrl, path);
  for (const [key, value] of Object.entries(options.query ?? {})) if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  const method = options.method ?? "GET";
  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)(url, {
      method,
      headers: { Authorization: bearer(connection.apiToken.trim()), Accept: "application/json", ...(options.body === undefined ? {} : { "Content-Type": "application/json" }) },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      cache: "no-store", redirect: "manual",
      signal: AbortSignal.timeout(bound(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, 1_000, 30_000)),
    });
  } catch (error) {
    const timeout = error instanceof DOMException && error.name === "TimeoutError";
    throw new SweepAndGoError(timeout ? "Sweep & Go took too long to respond." : "Sweep & Go is temporarily unavailable.", timeout ? "timeout" : "unavailable", timeout ? 504 : 502, method === "PUT" || method === "POST");
  }
  const text = await response.text();
  let payload: unknown = {};
  if (text) {
    try { payload = JSON.parse(text); }
    catch {
      if (response.ok) throw new SweepAndGoError("Sweep & Go returned an invalid response.", "invalid_response", 502, isMutation(method));
    }
  }
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new SweepAndGoError("Sweep & Go rejected the configured API token.", "unauthorized", response.status);
    throw new SweepAndGoError(providerMessage(payload) || "Sweep & Go could not complete the request.", "rejected", response.status || 502, isMutation(method) && (response.status >= 500 || isRedirect(response.status)));
  }
  return payload as T;
}

function providerUrl(configured: string | undefined, path: string) { let base: URL; try { base = new URL(configured?.trim() || DEFAULT_BASE_URL); } catch { throw new SweepAndGoError("Sweep & Go API URL is invalid.", "not_configured", 503); } if (base.protocol !== "https:" || (base.hostname !== "openapi.sweepandgo.com" && !isLocalhost(base.hostname))) throw new SweepAndGoError("Sweep & Go API URL must use the official HTTPS host.", "not_configured", 503); if (!/^\/(?!\/)/.test(path)) throw new SweepAndGoError("Sweep & Go API path is invalid.", "not_configured", 503); const url = new URL(path, base.origin); if (url.origin !== base.origin) throw new SweepAndGoError("Sweep & Go API path is invalid.", "not_configured", 503); return url; }
function providerMessage(value: unknown) { const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; const candidate = record.message ?? record.error; return typeof candidate === "string" ? candidate.slice(0, 240) : ""; }
function bearer(value: string) { return value.toLowerCase().startsWith("bearer ") ? value : `Bearer ${value}`; }
function bound(value: number, minimum: number, maximum: number) { return Math.max(minimum, Math.min(maximum, Math.round(value))); }
function isLocalhost(hostname: string) { return process.env.NODE_ENV !== "production" && ["localhost", "127.0.0.1", "::1"].includes(hostname); }
function isMutation(method: SweepAndGoMethod) { return method === "POST" || method === "PUT"; }
function isRedirect(status: number) { return status >= 300 && status < 400; }
