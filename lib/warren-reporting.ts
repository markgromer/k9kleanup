import { getIntegrationConnection, saveIntegration } from "@/lib/admin-platform";

export type WarrenConnection = { apiUrl: string; siteId: string; token: string };
export type WarrenDashboard = {
  siteId: string; rangeDays: number; dataSource: "warren";
  connections: { googleAnalytics: { connected: boolean; propertyId: string }; searchConsole: { connected: boolean; siteUrl: string } };
  analytics: {
    activeUsers: number; sessions: number; newUsers: number; engagedSessions: number; engagementRate: number;
    averageSessionDuration: number; screenPageViews: number; conversions: number;
    topPages: Array<{ page: string; sessions: number; activeUsers: number; conversions: number; engagementSeconds: number }>;
    trafficSources: Array<{ source: string; sessions: number; activeUsers: number; conversions: number }>;
    devices: Array<{ device: string; sessions: number; activeUsers: number; conversions: number }>;
    locations: Array<{ location: string; sessions: number; activeUsers: number; conversions: number }>;
    daily: Array<Record<string, string | number>>;
  };
  search: {
    clicks: number; impressions: number; ctr: number; averagePosition: number;
    queries: Array<{ query: string; clicks: number; impressions: number; ctr: number; averagePosition: number }>;
    pages: Array<{ page: string; clicks: number; impressions: number; ctr: number; averagePosition: number }>;
    countries: Array<Record<string, string | number>>; devices: Array<Record<string, string | number>>; daily: Array<Record<string, string | number>>;
  };
  market: {
    competitors: Array<{ name: string; website: string; positioning: string; offers: string[] }>;
    opportunities: Array<{ id: string; type: string; priority: string; title: string; reason: string; action: string; source: string }>;
  };
  lastSyncedAt: string | null; warnings: string[];
};

export async function getWarrenConnection(): Promise<WarrenConnection> {
  const connection = await getIntegrationConnection("warren");
  return normalizeConnection(connection.values);
}

export async function verifyWarrenConnection(input: Record<string, unknown>, expectedOrigin: string): Promise<WarrenConnection> {
  const connection = normalizeConnection(input);
  if (!isApprovedWarrenApi(connection.apiUrl)) throw new Error("WARREN must use the approved production API URL.");
  if (!/^reggie-[a-z0-9-]+$/i.test(connection.siteId) || connection.token.length < 24) throw new Error("The WARREN site ID or token is invalid.");
  const response = await fetch(`${connection.apiUrl}/sites/${encodeURIComponent(connection.siteId)}/connections`, {
    headers: { Authorization: `Bearer ${connection.token}` }, cache: "no-store", signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json().catch(() => null) as { siteId?: string; liveUrl?: string; dataSource?: string; error?: { message?: string } } | null;
  if (!response.ok || payload?.siteId !== connection.siteId || payload?.dataSource !== "warren") throw new Error(payload?.error?.message || "WARREN could not verify this site connection.");
  if (!sameOrigin(payload.liveUrl, expectedOrigin)) throw new Error("This WARREN token belongs to a different website.");
  return connection;
}

export async function saveWarrenConnection(connection: WarrenConnection) { await saveIntegration("warren", { enabled: true, values: connection }); }

export async function fetchWarrenDashboard(days = 30, force = false): Promise<WarrenDashboard | null> {
  const connection = await getWarrenConnection();
  if (!connection.apiUrl || !connection.siteId || !connection.token) return null;
  const rangeDays = Math.max(1, Math.min(90, Math.round(Number(days) || 30)));
  const path = force ? "sync" : "dashboard";
  const response = await fetch(`${connection.apiUrl}/sites/${encodeURIComponent(connection.siteId)}/${path}?days=${rangeDays}`, {
    method: force ? "POST" : "GET", headers: { Authorization: `Bearer ${connection.token}` }, cache: "no-store", signal: AbortSignal.timeout(30_000),
  });
  const payload = await response.json().catch(() => null) as WarrenDashboard | { dashboard?: WarrenDashboard; error?: { message?: string } } | null;
  if (!response.ok) throw new Error(payload && "error" in payload ? payload.error?.message || "WARREN reporting failed." : "WARREN reporting failed.");
  return force && payload && "dashboard" in payload ? payload.dashboard ?? null : payload as WarrenDashboard;
}

function normalizeConnection(input: Record<string, unknown>): WarrenConnection {
  return { apiUrl: String(input.apiUrl ?? "").trim().replace(/\/+$/, ""), siteId: String(input.siteId ?? "").trim(), token: String(input.token ?? "").trim() };
}

function isApprovedWarrenApi(value: string) {
  try { const url = new URL(value); return url.origin === "https://app.warren.ad" && url.pathname.replace(/\/+$/, "") === "/api/warren"; }
  catch { return false; }
}

function sameOrigin(left = "", right = "") {
  try { return new URL(left).origin.toLowerCase() === new URL(right).origin.toLowerCase(); }
  catch { return false; }
}
