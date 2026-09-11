import { NextRequest, NextResponse } from "next/server";

import { GET as analytics } from "@/app/api/admin/analytics/route";
import { GET as dashboard } from "@/app/api/admin/dashboard/route";
import { GET as integrations } from "@/app/api/admin/integrations/route";
import { GET as missions } from "@/app/api/admin/reggie-mission/route";
import { GET as rankings } from "@/app/api/admin/rankings/route";
import { GET as seo } from "@/app/api/admin/seo/route";
import { GET as siteHealth } from "@/app/api/admin/site-health/route";
import { checkAdminAuth, getAdminAuthSetupStatus, unauthorizedResponse } from "@/lib/admin-auth";
import { getReggieConnection } from "@/lib/reggie-connection";
import { getWarrenConnection } from "@/lib/warren-reporting";

type Payload = Record<string, unknown>;

export async function GET(req: NextRequest) {
  if (!(await checkAdminAuth(req))) return unauthorizedResponse();

  const loaders = [dashboard, analytics, seo, rankings, integrations, missions, siteHealth] as const;
  const results = await Promise.allSettled(loaders.map((loader) => loader(req)));
  const payloads = await Promise.all(results.map(async (result) => {
    if (result.status === "rejected") return { ok: false, error: result.reason instanceof Error ? result.reason.message : "Dashboard source failed." } as Payload;
    return await result.value.json().catch(() => ({ ok: false, error: "Dashboard source returned an invalid response." })) as Payload;
  }));

  if (results[0].status === "rejected" || payloads[0].ok === false) {
    return NextResponse.json({ ok: false, error: payloads[0].error ?? "The dashboard could not load." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  const partialFailures = payloads
    .map((payload, index) => payload.ok === false ? { source: ["dashboard", "analytics", "seo", "rankings", "integrations", "missions", "siteHealth"][index], error: String(payload.error ?? "Unavailable") } : null)
    .filter(Boolean);
  const [reggieConnection, authSetup] = await Promise.all([getReggieConnection(), getAdminAuthSetupStatus()]);
  const reggieSetup = buildReggieSetup(payloads[0].dashboard, reggieConnection, authSetup);

  const overview = {
    ok: true,
    dashboard: payloads[0].dashboard,
    analytics: payloads[1].analytics,
    seo: { pages: payloads[2].pages ?? [], searchConsole: payloads[2].searchConsole },
    rankings: { keywords: payloads[3].keywords ?? [] },
    integrations: { integrations: payloads[4].integrations ?? [] },
    missions: payloads[5].jobs ?? [],
    siteHealth: payloads[6].health,
    reggieSetup,
    partialFailures,
  };

  await Promise.allSettled([reportGlanceToHub(overview), reportSnapshotToWarren(overview)]);
  return NextResponse.json(overview, { headers: { "Cache-Control": "private, no-store" } });
}

function buildReggieSetup(dashboardPayload: unknown, connection: { siteId?: string; token?: string }, auth: { ownerConfigured: boolean; sessionConfigured: boolean }) {
  const health = objectValue(objectValue(dashboardPayload).health);
  const state = {
    database: health.database === true,
    media: health.media === true,
    encryption: health.encryption === true,
    connection: Boolean(connection.siteId && connection.token),
    authentication: auth.ownerConfigured && auth.sessionConfigured,
  };
  const issues = [
    !state.database ? "Admin database is not connected." : "",
    !state.media ? "Media storage is not connected." : "",
    !state.encryption ? "Credential encryption is not configured." : "",
    !state.connection ? "The site is not connected to the Reggie Hub." : "",
    !state.authentication ? "Owner authentication or signed sessions are not configured." : "",
  ].filter(Boolean);
  return { ...state, complete: issues.length === 0, issues };
}

async function reportSnapshotToWarren(overview: Record<string, unknown>) {
  const connection = await getWarrenConnection();
  if (!connection.apiUrl || !connection.siteId || !connection.token) return;
  const integrations = Array.isArray(objectValue(overview.integrations).integrations)
    ? objectValue(overview.integrations).integrations as Array<Record<string, unknown>> : [];
  const snapshot = {
    site: { dashboard: overview.dashboard },
    health: overview.siteHealth,
    analytics: overview.analytics,
    seo: overview.seo,
    rankings: overview.rankings,
    integrations: integrations.map((item) => ({
      provider: text(item.provider), label: text(item.label),
      enabled: Boolean(item.enabled), configured: Boolean(item.configured),
      state: text(item.connectionState), syncState: text(item.syncState),
      lastSyncedAt: text(item.lastSyncedAt),
    })),
    activity: { missions: overview.missions, partialFailures: overview.partialFailures },
    syncedAt: new Date().toISOString(),
  };
  await fetch(`${connection.apiUrl}/sites/${encodeURIComponent(connection.siteId)}/reggie-data`, {
    method: "PUT",
    headers: { "Authorization": `Bearer ${connection.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ schemaVersion: 1, snapshot }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  }).catch(() => undefined);
}

async function reportGlanceToHub(overview: Record<string, unknown>) {
  const connection = await getReggieConnection();
  if (!connection.siteId || !connection.token) return;
  const report = buildGlanceReport(overview);
  await fetch(`${connection.url}/v1/sites/${encodeURIComponent(connection.siteId)}/glance-report`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Reggie-Site-Key": connection.token },
    body: JSON.stringify({ report }),
    cache: "no-store",
    signal: AbortSignal.timeout(5_000),
  }).catch(() => undefined);
}

function buildGlanceReport(overview: Record<string, unknown>) {
  const dashboard = objectValue(overview.dashboard);
  const analytics = objectValue(overview.analytics);
  const seo = objectValue(overview.seo);
  const rankings = objectValue(overview.rankings);
  const integrations = Array.isArray(objectValue(overview.integrations).integrations) ? objectValue(overview.integrations).integrations as Array<Record<string, unknown>> : [];
  const missions = Array.isArray(overview.missions) ? overview.missions as Array<Record<string, unknown>> : [];
  const siteHealth = objectValue(overview.siteHealth);
  const healthData = objectValue(siteHealth.data);
  const pageSpeed = objectValue(objectValue(siteHealth.pageSpeed).data);
  const searchConsole = objectValue(seo.searchConsole);
  const searchData = objectValue(searchConsole.data);
  const seoInventory = Array.isArray(seo.pages) ? seo.pages as Array<Record<string, unknown>> : [];
  return {
    reportedAt: new Date().toISOString(),
    source: "dashboard-overview",
    site: { url: text(healthData.siteUrl), healthCheckedAt: text(healthData.checkedAt) || text(siteHealth.lastSuccessAt) },
    metrics: {
      leads30d: numberValue(analytics.conversions),
      visitors30d: numberValue(analytics.visitors),
      conversionRate30d: rate(numberValue(analytics.conversions), numberValue(analytics.visitors)),
      quoteStarts30d: numberValue(analytics.quoteStarts),
      sessions30d: numberValue(analytics.sessions),
      searchClicks30d: numberValue(searchData.clicks),
      searchImpressions30d: numberValue(searchData.impressions),
      trackedKeywords: Array.isArray(objectValue(rankings).keywords) ? (objectValue(rankings).keywords as unknown[]).length : 0,
      openReggieRequests: missions.filter((mission) => !["live", "published", "cancelled"].includes(text(mission.status))).length,
      pages: numberValue(objectValue(dashboard.counts).pages),
      services: numberValue(objectValue(dashboard.counts).services),
      locations: numberValue(objectValue(dashboard.counts).locations),
      blogPosts: numberValue(objectValue(dashboard.counts).blogPosts),
      mediaAssets: numberValue(objectValue(dashboard.counts).mediaAssets),
    },
    health: {
      homepage: booleanLabel(objectValue(healthData.homepage).ok),
      ssl: booleanLabel(objectValue(healthData.ssl).ok),
      sitemap: booleanLabel(objectValue(healthData.sitemap).ok),
      robots: booleanLabel(objectValue(healthData.robots).allowsCrawling),
      quoteEndpoint: booleanLabel(objectValue(healthData.quoteEndpoint).ok),
      performance: numberValue(objectValue(pageSpeed.scores).performance),
    },
    integrations: integrations.map((integration) => ({ provider: text(integration.provider), label: text(integration.label), state: text(integration.connectionState) || (integration.enabled && integration.configured ? "connected" : "not-connected"), syncState: text(integration.syncState), lastSyncedAt: text(integration.lastSyncedAt) })),
    topPages: Array.isArray(analytics.topPages) ? analytics.topPages : [],
    topQueries: Array.isArray(searchData.topQueries) ? searchData.topQueries : [],
    seoInventory: seoInventory.slice(0, 100).map((page) => ({
      path: text(page.path),
      title: text(page.title),
      description: text(page.description),
      canonicalUrl: text(page.canonicalUrl),
      indexStatus: text(page.indexStatus),
      focusKeyword: text(page.focusKeyword),
      score: numberValue(page.score),
      issues: Array.isArray(page.issues) ? page.issues.map(text).filter(Boolean).slice(0, 8) : [],
      updatedAt: text(page.updatedAt),
    })),
    latestMission: missions[0] ? { id: text(missions[0].id), title: text(missions[0].title) || text(missions[0].summary), status: text(missions[0].status), updatedAt: text(missions[0].updatedAt) } : null,
    partialFailures: Array.isArray(overview.partialFailures) ? overview.partialFailures : [],
  };
}

function objectValue(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function text(value: unknown) { return typeof value === "string" ? value : ""; }
function numberValue(value: unknown) {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}
function booleanLabel(value: unknown) { return typeof value === "boolean" ? (value ? "ok" : "attention") : "unknown"; }
function rate(numerator: number | null, denominator: number | null) { return numerator !== null && denominator ? Number(((numerator / denominator) * 100).toFixed(1)) : null; }
