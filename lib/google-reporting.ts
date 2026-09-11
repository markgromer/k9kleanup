import {
  getIntegrationConnection,
  integrationSyncSettingKey,
  readAdminSetting,
  writeAdminSetting,
  type IntegrationSyncState,
} from "@/lib/admin-platform";

const DEFAULT_GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const DEFAULT_GA_API_BASE = "https://analyticsdata.googleapis.com";
const DEFAULT_SEARCH_CONSOLE_API_BASE = "https://www.googleapis.com";
const DEFAULT_PAGESPEED_API_URL = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
const GA_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
const SEARCH_CONSOLE_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const GOOGLE_PROVIDERS = ["google-analytics", "google-search-console", "google-pagespeed"] as const;

type GoogleProvider = typeof GOOGLE_PROVIDERS[number];
type ServiceAccount = { client_email: string; private_key: string; private_key_id?: string };
type SearchConsoleRow = { keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number };
type SearchConsoleResponse = { rows?: SearchConsoleRow[] };
type GaReportResponse = {
  dimensionHeaders?: Array<{ name?: string }>;
  metricHeaders?: Array<{ name?: string }>;
  rows?: Array<{ dimensionValues?: Array<{ value?: string }>; metricValues?: Array<{ value?: string }> }>;
};
type PageSpeedResponse = {
  lighthouseResult?: {
    fetchTime?: string;
    finalUrl?: string;
    categories?: Record<string, { score?: number | null }>;
    audits?: Record<string, { title?: string; displayValue?: string; numericValue?: number; score?: number | null; details?: { overallSavingsMs?: number } }>;
  };
};

export type GoogleAnalyticsSnapshot = {
  provider: "google-analytics";
  rangeDays: number;
  startDate: string;
  endDate: string;
  visitors: number;
  sessions: number;
  conversions: number;
  previousVisitors: number;
  previousConversions: number;
  topPages: Array<{ path: string; count: number }>;
  topSources: Array<{ source: string; count: number }>;
};

export type SearchConsoleSnapshot = {
  provider: "google-search-console";
  propertyUrl: string;
  permissionLevel: string;
  serviceAccountEmail: string;
  rangeDays: number;
  startDate: string;
  endDate: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  previousClicks: number;
  previousImpressions: number;
  topQueries: Array<{ query: string; clicks: number; impressions: number; ctr: number; position: number; previousPosition: number | null }>;
  topPages: Array<{ path: string; clicks: number; impressions: number; ctr: number; position: number }>;
};

export type PageSpeedSnapshot = {
  provider: "google-pagespeed";
  siteUrl: string;
  strategy: "mobile";
  fetchedAt: string;
  scores: { performance: number | null; accessibility: number | null; bestPractices: number | null; seo: number | null };
  metrics: Array<{ id: string; label: string; value: number; displayValue: string }>;
  opportunities: Array<{ id: string; title: string; displayValue: string; savingsMs: number }>;
};

export type GoogleIntegrationSnapshot = GoogleAnalyticsSnapshot | SearchConsoleSnapshot | PageSpeedSnapshot;
export type IntegrationSyncRecord<T = unknown> = IntegrationSyncState & { data?: T };

export async function getIntegrationSyncRecord<T = unknown>(provider: string): Promise<IntegrationSyncRecord<T>> {
  const fallback: IntegrationSyncRecord<T> = { provider, state: "never", lastAttemptAt: "", lastSuccessAt: "", error: "" };
  const stored = await readAdminSetting<IntegrationSyncRecord<T>>(integrationSyncSettingKey(provider), fallback);
  return { ...fallback, ...stored, provider };
}

export async function syncGoogleIntegration(provider: GoogleProvider) {
  const previous = await getIntegrationSyncRecord<GoogleIntegrationSnapshot>(provider);
  const lastAttemptAt = new Date().toISOString();
  await writeAdminSetting(integrationSyncSettingKey(provider), { ...previous, provider, state: "syncing", lastAttemptAt, error: "" } satisfies IntegrationSyncRecord<GoogleIntegrationSnapshot>);
  try {
    const data = provider === "google-analytics" ? await syncGoogleAnalytics() : provider === "google-search-console" ? await syncSearchConsole() : await syncPageSpeed();
    const record: IntegrationSyncRecord<GoogleIntegrationSnapshot> = { provider, state: "success", lastAttemptAt, lastSuccessAt: new Date().toISOString(), error: "", data };
    await writeAdminSetting(integrationSyncSettingKey(provider), record);
    return record;
  } catch (error) {
    const message = safeError(error);
    await writeAdminSetting(integrationSyncSettingKey(provider), { ...previous, provider, state: "error", lastAttemptAt, error: message });
    throw new Error(message);
  }
}

export async function syncConfiguredGoogleIntegrations() {
  const results: Array<{ provider: GoogleProvider; ok: boolean; syncedAt?: string; error?: string; skipped?: string }> = [];
  for (const provider of GOOGLE_PROVIDERS) {
    const connection = await getIntegrationConnection(provider);
    if (!connection.enabled || !connection.configured) { results.push({ provider, ok: true, skipped: "not-enabled" }); continue; }
    try {
      const record = await syncGoogleIntegration(provider);
      results.push({ provider, ok: true, syncedAt: record.lastSuccessAt });
    } catch (error) {
      results.push({ provider, ok: false, error: safeError(error) });
    }
  }
  return results;
}

async function syncGoogleAnalytics(): Promise<GoogleAnalyticsSnapshot> {
  const connection = await getIntegrationConnection("google-analytics");
  if (!connection.enabled) throw new Error("Enable Google Analytics before testing the connection.");
  const propertyId = connection.values.propertyId?.replace(/^properties\//, "").trim();
  if (!propertyId || !/^\d+$/.test(propertyId)) throw new Error("Google Analytics Property ID must be the numeric GA4 property ID.");
  const account = parseServiceAccount(connection.values.serviceAccountJson, "Google Analytics");
  const token = await getGoogleAccessToken(account, GA_SCOPE);
  const current = dateRange(30, 1);
  const previous = previousRange(current);
  const [summary, previousSummary, pages, sources] = await Promise.all([
    runGaReport(propertyId, token, { dateRanges: [current], metrics: [{ name: "activeUsers" }, { name: "sessions" }, { name: "keyEvents" }] }),
    runGaReport(propertyId, token, { dateRanges: [previous], metrics: [{ name: "activeUsers" }, { name: "sessions" }, { name: "keyEvents" }] }),
    runGaReport(propertyId, token, { dateRanges: [current], dimensions: [{ name: "pagePath" }], metrics: [{ name: "screenPageViews" }], orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }], limit: "50" }),
    runGaReport(propertyId, token, { dateRanges: [current], dimensions: [{ name: "sessionSource" }], metrics: [{ name: "sessions" }], orderBys: [{ metric: { metricName: "sessions" }, desc: true }], limit: "25" }),
  ]);
  const currentMetrics = gaMetricTotals(summary);
  const previousMetrics = gaMetricTotals(previousSummary);
  return {
    provider: "google-analytics",
    rangeDays: 30,
    startDate: current.startDate,
    endDate: current.endDate,
    visitors: currentMetrics.activeUsers ?? 0,
    sessions: currentMetrics.sessions ?? 0,
    conversions: currentMetrics.keyEvents ?? 0,
    previousVisitors: previousMetrics.activeUsers ?? 0,
    previousConversions: previousMetrics.keyEvents ?? 0,
    topPages: gaDimensionRows(pages).filter((item) => isCustomerPath(item.label)).slice(0, 10).map((item) => ({ path: normalizePagePath(item.label), count: item.value })),
    topSources: gaDimensionRows(sources).slice(0, 10).map((item) => ({ source: normalizeSource(item.label), count: item.value })),
  };
}

async function syncSearchConsole(): Promise<SearchConsoleSnapshot> {
  const connection = await getIntegrationConnection("google-search-console");
  if (!connection.enabled) throw new Error("Enable Google Search Console before testing the connection.");
  const propertyUrl = connection.values.propertyUrl?.trim();
  if (!propertyUrl) throw new Error("Enter the exact Search Console property, such as sc-domain:nopoop.life.");
  const account = parseServiceAccount(connection.values.serviceAccountJson, "Google Search Console");
  const token = await getGoogleAccessToken(account, SEARCH_CONSOLE_SCOPE);
  const site = await googleJson<{ siteUrl?: string; permissionLevel?: string }>(`${searchConsoleApiBase()}/webmasters/v3/sites/${encodeURIComponent(propertyUrl)}`, { headers: { Authorization: `Bearer ${token}` } }, "Search Console property access failed. Add the service-account email as a user on this property.");
  const current = dateRange(30, 2);
  const previous = previousRange(current);
  const [totals, previousTotals, queries, previousQueries, pages] = await Promise.all([
    runSearchConsoleQuery(propertyUrl, token, { ...current, rowLimit: 1 }),
    runSearchConsoleQuery(propertyUrl, token, { ...previous, rowLimit: 1 }),
    runSearchConsoleQuery(propertyUrl, token, { ...current, dimensions: ["query"], rowLimit: 50 }),
    runSearchConsoleQuery(propertyUrl, token, { ...previous, dimensions: ["query"], rowLimit: 50 }),
    runSearchConsoleQuery(propertyUrl, token, { ...current, dimensions: ["page"], rowLimit: 50 }),
  ]);
  const total = searchTotals(totals.rows?.[0]);
  const prior = searchTotals(previousTotals.rows?.[0]);
  const priorQueries = new Map((previousQueries.rows ?? []).map((row) => [normalizeQuery(row.keys?.[0] ?? ""), Number(row.position ?? 0) || null]));
  return {
    provider: "google-search-console",
    propertyUrl,
    permissionLevel: site.permissionLevel ?? "unknown",
    serviceAccountEmail: account.client_email,
    rangeDays: 30,
    startDate: current.startDate,
    endDate: current.endDate,
    ...total,
    previousClicks: prior.clicks,
    previousImpressions: prior.impressions,
    topQueries: (queries.rows ?? []).map((row) => { const query = row.keys?.[0] ?? ""; return { query, ...searchTotals(row), previousPosition: priorQueries.get(normalizeQuery(query)) ?? null }; }).filter((row) => row.query),
    topPages: (pages.rows ?? []).map((row) => ({ path: searchConsolePagePath(row.keys?.[0] ?? ""), ...searchTotals(row) })).filter((row) => row.path),
  };
}

async function syncPageSpeed(): Promise<PageSpeedSnapshot> {
  const connection = await getIntegrationConnection("google-pagespeed");
  if (!connection.enabled) throw new Error("Enable Google PageSpeed Insights before testing the connection.");
  const apiKey = connection.values.apiKey?.trim();
  if (!apiKey) throw new Error("Google PageSpeed Insights needs an API key for scheduled checks.");
  const siteUrl = configuredSiteOrigin();
  const requestUrl = new URL(pageSpeedApiUrl());
  requestUrl.searchParams.set("url", siteUrl);
  requestUrl.searchParams.set("strategy", "mobile");
  requestUrl.searchParams.set("key", apiKey);
  for (const category of ["performance", "accessibility", "best-practices", "seo"]) requestUrl.searchParams.append("category", category);
  const report = await googleJson<PageSpeedResponse>(requestUrl.toString(), { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(90_000) }, "PageSpeed analysis failed. Confirm the API key and that PageSpeed Insights API is enabled.");
  const lighthouse = report.lighthouseResult;
  if (!lighthouse?.categories) throw new Error("PageSpeed did not return Lighthouse scores for this website.");
  const audits = lighthouse.audits ?? {};
  const metricIds = [
    ["largest-contentful-paint", "Largest Contentful Paint"],
    ["first-contentful-paint", "First Contentful Paint"],
    ["cumulative-layout-shift", "Cumulative Layout Shift"],
    ["total-blocking-time", "Total Blocking Time"],
    ["speed-index", "Speed Index"],
  ] as const;
  return {
    provider: "google-pagespeed",
    siteUrl: lighthouse.finalUrl || siteUrl,
    strategy: "mobile",
    fetchedAt: lighthouse.fetchTime || new Date().toISOString(),
    scores: {
      performance: lighthouseScore(lighthouse.categories.performance?.score),
      accessibility: lighthouseScore(lighthouse.categories.accessibility?.score),
      bestPractices: lighthouseScore(lighthouse.categories["best-practices"]?.score),
      seo: lighthouseScore(lighthouse.categories.seo?.score),
    },
    metrics: metricIds.map(([id, label]) => ({ id, label, value: Number(audits[id]?.numericValue ?? 0), displayValue: audits[id]?.displayValue || "-" })).filter((item) => item.value >= 0),
    opportunities: Object.entries(audits).map(([id, audit]) => ({ id, title: audit.title || id, displayValue: audit.displayValue || "", savingsMs: Math.round(Number(audit.details?.overallSavingsMs ?? 0)) })).filter((item) => item.savingsMs > 0).sort((left, right) => right.savingsMs - left.savingsMs).slice(0, 6),
  };
}

async function getGoogleAccessToken(account: ServiceAccount, scope: string) {
  const now = Math.floor(Date.now() / 1000);
  const tokenUrl = googleTokenUrl();
  const header = base64UrlJson({ alg: "RS256", typ: "JWT", ...(account.private_key_id ? { kid: account.private_key_id } : {}) });
  const claims = base64UrlJson({ iss: account.client_email, scope, aud: tokenUrl, iat: now, exp: now + 3600 });
  const unsigned = `${header}.${claims}`;
  const key = await crypto.subtle.importKey("pkcs8", pemBytes(account.private_key), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const assertion = `${unsigned}.${base64Url(new Uint8Array(signature))}`;
  const body = new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion });
  const response = await googleJson<{ access_token?: string }>(tokenUrl, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body, signal: AbortSignal.timeout(15_000) }, "Google rejected the service-account credentials.");
  if (!response.access_token) throw new Error("Google did not return an access token for this service account.");
  return response.access_token;
}

async function runGaReport(propertyId: string, token: string, body: Record<string, unknown>) {
  return googleJson<GaReportResponse>(`${googleAnalyticsApiBase()}/v1beta/properties/${encodeURIComponent(propertyId)}:runReport`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(20_000) }, "Google Analytics reporting failed. Confirm the property ID and grant the service account Viewer access.");
}

async function runSearchConsoleQuery(propertyUrl: string, token: string, body: Record<string, unknown>) {
  return googleJson<SearchConsoleResponse>(`${searchConsoleApiBase()}/webmasters/v3/sites/${encodeURIComponent(propertyUrl)}/searchAnalytics/query`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ ...body, dataState: "final" }), signal: AbortSignal.timeout(20_000) }, "Search Console reporting failed. Confirm the property and service-account permission.");
}

async function googleJson<T>(url: string, init: RequestInit, fallback: string): Promise<T> {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => ({})) as { error?: { message?: string }; message?: string } & T;
  if (!response.ok) throw new Error(data.error?.message || data.message || fallback);
  return data;
}

function parseServiceAccount(value: string | undefined, label: string): ServiceAccount {
  if (!value?.trim()) throw new Error(`${label} needs service-account JSON before it can sync.`);
  try {
    const parsed = JSON.parse(value) as Partial<ServiceAccount>;
    if (!parsed.client_email || !parsed.private_key) throw new Error("missing fields");
    return { client_email: parsed.client_email, private_key: parsed.private_key.replace(/\\n/g, "\n"), private_key_id: parsed.private_key_id };
  } catch {
    throw new Error(`${label} service-account JSON is invalid or missing client_email/private_key.`);
  }
}

function dateRange(days: number, endOffsetDays: number) {
  const end = startOfUtcDay(new Date()); end.setUTCDate(end.getUTCDate() - endOffsetDays);
  const start = new Date(end); start.setUTCDate(start.getUTCDate() - days + 1);
  return { startDate: isoDate(start), endDate: isoDate(end) };
}

function previousRange(current: { startDate: string; endDate: string }) {
  const currentStart = new Date(`${current.startDate}T00:00:00Z`); const currentEnd = new Date(`${current.endDate}T00:00:00Z`); const days = Math.round((currentEnd.getTime() - currentStart.getTime()) / 86400000) + 1;
  const end = new Date(currentStart); end.setUTCDate(end.getUTCDate() - 1); const start = new Date(end); start.setUTCDate(start.getUTCDate() - days + 1);
  return { startDate: isoDate(start), endDate: isoDate(end) };
}

function gaMetricTotals(report: GaReportResponse) {
  const names = (report.metricHeaders ?? []).map((header) => header.name ?? ""); const values = report.rows?.[0]?.metricValues ?? [];
  return Object.fromEntries(names.map((name, index) => [name, Math.round(Number(values[index]?.value ?? 0) || 0)])) as Record<string, number>;
}

function gaDimensionRows(report: GaReportResponse) {
  return (report.rows ?? []).map((row) => ({ label: row.dimensionValues?.[0]?.value ?? "", value: Math.round(Number(row.metricValues?.[0]?.value ?? 0) || 0) })).filter((item) => item.label && item.value > 0);
}

function searchTotals(row?: SearchConsoleRow) {
  return { clicks: Math.round(Number(row?.clicks ?? 0)), impressions: Math.round(Number(row?.impressions ?? 0)), ctr: Number(row?.ctr ?? 0), position: Number(row?.position ?? 0) };
}

function base64UrlJson(value: unknown) { return base64Url(new TextEncoder().encode(JSON.stringify(value))); }
function base64Url(value: Uint8Array) { let binary = ""; for (const byte of value) binary += String.fromCharCode(byte); return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function pemBytes(value: string) { const encoded = value.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, ""); const binary = atob(encoded); return Uint8Array.from(binary, (character) => character.charCodeAt(0)); }
function startOfUtcDay(value: Date) { return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())); }
function isoDate(value: Date) { return value.toISOString().slice(0, 10); }
function normalizePagePath(value: string) { const path = value.split("?")[0].split("#")[0].trim(); return path.startsWith("/") ? path || "/" : `/${path}`; }
function isCustomerPath(value: string) { const path = normalizePagePath(value); return path !== "/admin" && !path.startsWith("/admin/") && path !== "/api" && !path.startsWith("/api/"); }
function normalizeSource(value: string) { return !value || value === "(direct)" ? "Direct" : value; }
function searchConsolePagePath(value: string) { try { return normalizePagePath(new URL(value).pathname); } catch { return normalizePagePath(value); } }
function normalizeQuery(value: string) { return value.trim().toLocaleLowerCase(); }
function safeError(error: unknown) { const message = error instanceof Error ? error.message : "Google reporting sync failed."; return message.replace(/-----BEGIN [A-Z ]+-----[\s\S]*?-----END [A-Z ]+-----/g, "[private key]").replace(/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, "[signed assertion]").slice(0, 500); }
function lighthouseScore(value: number | null | undefined) { return typeof value === "number" ? Math.round(value * 100) : null; }
function configuredSiteOrigin() { const raw = process.env.REGGIE_LIVE_URL || process.env.NEXT_PUBLIC_SITE_URL || ""; if (!raw) throw new Error("Set NEXT_PUBLIC_SITE_URL or REGGIE_LIVE_URL before running PageSpeed checks."); const url = new URL(raw); if (!["https:", "http:"].includes(url.protocol)) throw new Error("The configured website URL must use HTTP or HTTPS."); return url.origin; }
function googleTokenUrl() { return (process.env.GOOGLE_OAUTH_TOKEN_URL || DEFAULT_GOOGLE_TOKEN_URL).replace(/\/$/, ""); }
function googleAnalyticsApiBase() { return (process.env.GOOGLE_ANALYTICS_API_BASE || DEFAULT_GA_API_BASE).replace(/\/$/, ""); }
function searchConsoleApiBase() { return (process.env.GOOGLE_SEARCH_CONSOLE_API_BASE || DEFAULT_SEARCH_CONSOLE_API_BASE).replace(/\/$/, ""); }
function pageSpeedApiUrl() { return process.env.GOOGLE_PAGESPEED_API_URL || DEFAULT_PAGESPEED_API_URL; }
