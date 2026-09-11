import { NextRequest, NextResponse } from "next/server";

import { checkAdminAuth, unauthorizedResponse } from "@/lib/admin-auth";
import { getAnalyticsSummary } from "@/lib/admin-platform";
import { getIntegrationSyncRecord, type GoogleAnalyticsSnapshot } from "@/lib/google-reporting";
import { fetchWarrenDashboard } from "@/lib/warren-reporting";

export async function GET(req: NextRequest) {
  if (!(await checkAdminAuth(req))) return unauthorizedResponse();
  try {
    const days = Number(req.nextUrl.searchParams.get("days") ?? 30);
    const [firstParty, google, warren] = await Promise.all([getAnalyticsSummary(days), getIntegrationSyncRecord<GoogleAnalyticsSnapshot>("google-analytics"), fetchWarrenDashboard(days).catch(() => null)]);
    const warrenAnalytics = warren?.connections.googleAnalytics.connected ? warren.analytics : null;
    if (warrenAnalytics) {
      const report = warrenAnalytics;
      return NextResponse.json({ ok: true, analytics: { ...firstParty, visitors: report.activeUsers, topPages: report.topPages.map((item) => ({ path: item.page, count: item.sessions })), topSources: report.trafficSources.map((item) => ({ source: item.source, count: item.sessions })), dataSource: "warren", sessions: report.sessions, newUsers: report.newUsers, engagedSessions: report.engagedSessions, engagementRate: report.engagementRate, averageSessionDuration: report.averageSessionDuration, screenPageViews: report.screenPageViews, googleConversions: report.conversions, devices: report.devices, locations: report.locations, daily: report.daily, market: warren?.market, lastSyncedAt: warren?.lastSyncedAt, warnings: warren?.warnings } });
    }
    const report = google.data?.provider === "google-analytics" && google.data.rangeDays === firstParty.rangeDays ? google.data : null;
    const firstPartyComparison = firstParty as typeof firstParty & { previousVisitors?: number; previousConversions?: number };
    return NextResponse.json({ ok: true, analytics: { ...firstParty, visitors: report?.visitors ?? firstParty.visitors, previousVisitors: report?.previousVisitors ?? firstPartyComparison.previousVisitors ?? 0, previousConversions: firstPartyComparison.previousConversions ?? 0, topPages: report?.topPages.length ? report.topPages : firstParty.topPages, topSources: report?.topSources.length ? report.topSources : firstParty.topSources, dataSource: report ? "google-analytics" : "first-party", market: warren?.market, googleAnalytics: { state: google.state, lastSyncedAt: google.lastSuccessAt, error: google.error } } });
  }
  catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Analytics request failed." }, { status: 503 }); }
}
