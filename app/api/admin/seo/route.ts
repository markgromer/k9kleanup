import { NextRequest, NextResponse } from "next/server";

import { checkAdminAuth, unauthorizedResponse } from "@/lib/admin-auth";
import { defaultSeoSettings, deleteSeoPage, listSeoPages, normalizeSeoSettings, readAdminSetting, saveSeoPage, writeAdminSetting } from "@/lib/admin-platform";
import { getIntegrationSyncRecord, type SearchConsoleSnapshot } from "@/lib/google-reporting";
import { fetchWarrenDashboard } from "@/lib/warren-reporting";

export async function GET(req: NextRequest) {
  if (!(await checkAdminAuth(req))) return unauthorizedResponse();
  try { const [pages, settings, searchConsole, warren] = await Promise.all([listSeoPages(), readAdminSetting("seo-site", defaultSeoSettings), getIntegrationSyncRecord<SearchConsoleSnapshot>("google-search-console"), fetchWarrenDashboard(30).catch(() => null)]); const report = warren?.connections.searchConsole.connected ? warren.search : null; return NextResponse.json({ ok: true, pages, settings, searchConsole: report ? { state: "success", lastSyncedAt: warren?.lastSyncedAt || "", error: (warren?.warnings || []).join(" "), data: { propertyUrl: warren?.connections.searchConsole.siteUrl || "", permissionLevel: "warren", serviceAccountEmail: "", rangeDays: warren?.rangeDays || 30, startDate: "", endDate: "", clicks: report.clicks, impressions: report.impressions, ctr: report.ctr, position: report.averagePosition, previousClicks: 0, previousImpressions: 0, topQueries: report.queries.map((item) => ({ ...item, position: item.averagePosition, previousPosition: null })), topPages: report.pages.map((item) => ({ path: item.page, clicks: item.clicks, impressions: item.impressions, ctr: item.ctr, position: item.averagePosition })) } } : { state: searchConsole.state, lastSyncedAt: searchConsole.lastSuccessAt, error: searchConsole.error, data: searchConsole.data } }); }
  catch (error) { return failure(error, 503); }
}

export async function PATCH(req: NextRequest) {
  if (!(await checkAdminAuth(req))) return unauthorizedResponse();
  try {
    const body = await req.json() as Record<string, unknown>;
    if (body.scope === "site") { const settings = normalizeSeoSettings(body); await writeAdminSetting("seo-site", settings); return NextResponse.json({ ok: true, settings }); }
    return NextResponse.json({ ok: true, page: await saveSeoPage(body) });
  }
  catch (error) { return failure(error, 400); }
}

export async function DELETE(req: NextRequest) {
  if (!(await checkAdminAuth(req))) return unauthorizedResponse();
  try { const body = await req.json() as Record<string, unknown>; await deleteSeoPage(String(body.path ?? "")); return NextResponse.json({ ok: true }); }
  catch (error) { return failure(error, 400); }
}

function failure(error: unknown, status: number) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "SEO request failed." }, { status }); }
