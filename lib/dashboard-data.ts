import type {
  CustomerStatus,
  DashboardActivity,
  DashboardApiData,
  DashboardIntegration,
  DashboardMetric,
  DashboardMission,
  DashboardRecommendation,
  DashboardSiteProfile,
  SiteHealthCheck,
} from "@/lib/dashboard-models";
import { missionQueuePresentation } from "@/lib/reggie-mission-state.mjs";

const conversionEventNames = new Set(["quote_submitted", "quote_completed", "lead_created", "booking_completed", "purchase", "conversion"]);

export function missionCustomerStatus(mission: DashboardMission): CustomerStatus {
  if (mission.status === "ready_for_review") return "ready";
  if (["drafting", "checking", "working"].includes(mission.status ?? "")) return "working";
  if (mission.status === "publishing" || (mission.status === "published" && mission.deployStatus !== "success")) return "publishing";
  if (mission.status === "live" || (mission.status === "published" && mission.deployStatus === "success")) return "published";
  if (["failed", "needs_attention"].includes(mission.status ?? "")) return "attention";
  return "requested";
}

export function customerStatusLabel(status: CustomerStatus) {
  return ({ requested: "Requested", working: "Working", ready: "Ready to Publish", publishing: "Publishing", published: "Published", attention: "Needs Attention" })[status];
}

export function dashboardMetrics(data: DashboardApiData, healthy: boolean): DashboardMetric[] {
  const analytics = data.analytics;
  const leads = analytics?.conversions;
  const visitors = analytics?.visitors;
  const conversion = visitors && leads !== undefined ? (leads / visitors) * 100 : null;
  return [
    { id: "leads", label: "Leads", value: leads === undefined ? "-" : String(leads), change: trend(leads, analytics?.previousConversions), detail: analytics ? "Last 30 days" : "Connect analytics to begin", available: leads !== undefined },
    { id: "visitors", label: "Website Visitors", value: visitors === undefined ? "-" : String(visitors), change: trend(visitors, analytics?.previousVisitors), detail: analytics ? "Last 30 days" : "Visitor data is not connected", available: visitors !== undefined },
    { id: "conversion", label: "Conversion Rate", value: conversion === null ? "-" : `${conversion.toFixed(1)}%`, detail: conversion === null ? "Waiting for visitor and lead data" : "Visitors who became leads", available: conversion !== null },
    { id: "health", label: "Site Health", value: healthy ? "Healthy" : "Check setup", detail: healthy ? "Core website checks passed" : "One or more checks need attention", available: true },
  ];
}

export function healthChecks(data: DashboardApiData): SiteHealthCheck[] {
  const integrations = data.integrations?.integrations ?? [];
  const connected = (provider: string) => integrations.some((item) => item.provider === provider && integrationConnected(item));
  const latestMission = data.missions?.find((mission) => !["cancelled", "superseded"].includes(mission.status ?? ""));
  const latestStatus = latestMission ? missionCustomerStatus(latestMission) : null;
  const health = data.siteHealth?.data;
  const performance = data.siteHealth?.pageSpeed?.data?.scores.performance;
  return [
    { id: "online", label: "Website online", detail: health ? health.homepage.detail : data.siteHealth?.state === "error" ? data.siteHealth.error || "Website check failed" : "Website check is being prepared", state: health ? health.homepage.ok ? "healthy" : "attention" : "unknown" },
    { id: "ssl", label: "Secure connection", detail: health?.ssl.detail || "HTTPS check is being prepared", state: health ? health.ssl.ok ? "healthy" : "attention" : "unknown" },
    { id: "storage", label: "Website workspace", detail: data.dashboard?.health?.database ? "Website data is available" : "Website data needs setup", state: data.dashboard?.health?.database ? "healthy" : "attention" },
    { id: "forms", label: "Quote tool", detail: health?.quoteEndpoint.detail || "Quote tool check is being prepared", state: health ? health.quoteEndpoint.ok ? "healthy" : "attention" : "unknown" },
    { id: "performance", label: "Mobile performance", detail: performance === null || performance === undefined ? "Connect PageSpeed for a Lighthouse score" : `${performance}/100 PageSpeed score`, state: performance === null || performance === undefined ? "unknown" : performance < 50 ? "attention" : performance >= 75 ? "healthy" : "unknown" },
    { id: "analytics", label: "Google Analytics", detail: connected("google-analytics") ? "Connected" : "Optional connection available", state: connected("google-analytics") ? "healthy" : "unknown" },
    { id: "search", label: "Search Console", detail: connected("google-search-console") ? "Connected" : "Connect for search insights", state: connected("google-search-console") ? "healthy" : "unknown" },
    { id: "sitemap", label: "Sitemap available", detail: health?.sitemap.detail || "Sitemap check is being prepared", state: health ? health.sitemap.ok ? "healthy" : "attention" : "unknown" },
    { id: "robots", label: "Search access", detail: health?.robots.detail || "Crawler check is being prepared", state: health ? health.robots.ok && health.robots.allowsCrawling ? "healthy" : "attention" : "unknown" },
    { id: "changes", label: "Recent website changes", detail: latestStatus === "attention" ? "A recent request needs attention" : latestStatus ? customerStatusLabel(latestStatus) : "No recent Reggie requests", state: latestStatus === "attention" ? "attention" : latestStatus ? "healthy" : "unknown" },
  ];
}

export function dashboardRecommendations(data: DashboardApiData, profile: DashboardSiteProfile): DashboardRecommendation[] {
  const recommendations: DashboardRecommendation[] = [];
  const integrations = data.integrations?.integrations ?? [];
  const connected = (provider: string) => integrations.some((item) => item.provider === provider && integrationConnected(item));
  const weakSeo = [...(data.seo?.pages ?? [])].filter((page) => page.score < 75).sort((left, right) => left.score - right.score)[0];
  const searchOpportunity = [...(data.seo?.searchConsole?.data?.topQueries ?? [])].filter((item) => item.impressions >= 10 && item.position >= 5).sort((left, right) => right.impressions - left.impressions)[0];
  const health = data.siteHealth?.data;
  const performance = data.siteHealth?.pageSpeed?.data?.scores.performance;
  const counts = data.dashboard?.counts ?? {};

  if (health && !health.homepage.ok) recommendations.push({ id: "website-offline", title: "Website availability needs attention", reason: health.homepage.detail, actionLabel: "Ask Reggie to investigate", href: `/admin/reggie?prompt=${encodeURIComponent("Investigate why the public website health check is failing and fix the underlying issue without changing approved content.")}`, priority: "high", category: "website" });
  if (health && !health.quoteEndpoint.ok) recommendations.push({ id: "quote-health", title: "Check the quote experience", reason: health.quoteEndpoint.detail, actionLabel: "Ask Reggie to investigate", href: `/admin/reggie?prompt=${encodeURIComponent("Investigate the quote tool health failure, preserve current pricing and lead behavior, and fix the customer-facing issue.")}`, priority: "high", category: "website" });
  if (health && (!health.sitemap.ok || !health.robots.allowsCrawling)) recommendations.push({ id: "crawl-health", title: "Restore search crawler access", reason: !health.sitemap.ok ? health.sitemap.detail : health.robots.detail, actionLabel: "Fix with Reggie", href: `/admin/reggie?prompt=${encodeURIComponent("Review sitemap.xml and robots.txt, then fix any issue preventing search engines from discovering approved public pages.")}`, priority: "high", category: "seo" });
  if (performance !== null && performance !== undefined && performance < 75) recommendations.push({ id: "mobile-performance", title: "Improve mobile website speed", reason: `The latest mobile PageSpeed score is ${performance}/100.`, actionLabel: "Improve with Reggie", href: `/admin/reggie?prompt=${encodeURIComponent("Use the latest PageSpeed findings to improve mobile performance without changing the approved design or breaking tracking, quote, or nurture behavior.")}`, priority: performance < 50 ? "high" : "medium", category: "website" });
  if (weakSeo) recommendations.push({ id: `seo-${weakSeo.path}`, title: `Improve ${pageName(weakSeo.path)}`, reason: `${weakSeo.issues.length || 1} search improvement${weakSeo.issues.length === 1 ? "" : "s"} can strengthen this page.`, actionLabel: "Improve with Reggie", href: `/admin/reggie?prompt=${encodeURIComponent(`Improve the SEO and quote conversion experience for ${weakSeo.path}.`)}`, priority: "high", category: "seo" });
  if (searchOpportunity) recommendations.push({ id: `search-${searchOpportunity.query}`, title: `Improve visibility for '${searchOpportunity.query}'`, reason: `Google showed your site ${searchOpportunity.impressions} times at an average position of ${searchOpportunity.position.toFixed(1)}.`, actionLabel: "Improve with Reggie", href: `/admin/reggie?prompt=${encodeURIComponent(`Review the query '${searchOpportunity.query}' and improve or create the best matching landing page using our actual services and locations.`)}`, priority: "high", category: "seo" });
  if (!connected("google-search-console")) recommendations.push({ id: "connect-search-console", title: "Connect Google Search Console", reason: "See the real searches that bring local customers to your website.", actionLabel: "Connect", href: "/admin/integrations#google-search-console", priority: "high", category: "integration" });
  if (!connected("google-analytics")) recommendations.push({ id: "connect-analytics", title: "Connect Google Analytics", reason: "Add visitor and traffic-source trends alongside your first-party lead data.", actionLabel: "Connect", href: "/admin/integrations#google-analytics", priority: "medium", category: "integration" });
  if ((counts.blogPosts ?? 0) === 0) recommendations.push({ id: "first-content", title: "Plan a useful local article", reason: "Fresh, service-focused content can answer customer questions and support search visibility.", actionLabel: "Create with Reggie", href: `/admin/reggie?prompt=${encodeURIComponent("Create a useful local article based on the questions our pet waste removal customers ask most often.")}`, priority: "medium", category: "content" });
  if (profile.locations.length === 0) recommendations.push({ id: "location-inventory", title: "Review your service-area coverage", reason: "Add your real service locations to reveal missing local landing-page opportunities.", actionLabel: "Review locations", href: "/admin/website/locations", priority: "low", category: "website" });
  if ((data.rankings?.keywords ?? []).length === 0 && (data.seo?.searchConsole?.data?.topQueries ?? []).length === 0) recommendations.push({ id: "rank-tracking", title: "Track your most valuable local searches", reason: "A focused keyword list makes growth visible without overwhelming reports.", actionLabel: "Add searches", href: "/admin/seo", priority: "low", category: "seo" });
  return recommendations.slice(0, 4);
}

export function dashboardActivity(data: DashboardApiData): DashboardActivity[] {
  const items: DashboardActivity[] = [];
  for (const mission of data.missions ?? []) {
    if (["cancelled", "superseded"].includes(mission.status ?? "")) continue;
    const status = missionCustomerStatus(mission);
    const queue = missionQueuePresentation(mission);
    const detail = status === "requested" && queue.state !== "complete" ? `${customerStatusLabel(status)} · ${queue.label}. ${queue.detail}` : customerStatusLabel(status);
    items.push({ id: `mission-${mission.id}`, title: status === "published" ? `${mission.title || mission.summary || "Website change"} published` : mission.title || mission.summary || "Reggie request", detail, occurredAt: mission.updatedAt || mission.createdAt || "", status });
  }
  for (const content of data.dashboard?.recentContent ?? []) {
    items.push({ id: `content-${content.id}`, title: content.title, detail: content.status === "published" ? "Content published" : "Content updated", occurredAt: content.updatedAt, status: content.status === "published" ? "published" : "working" });
  }
  for (const event of data.analytics?.recentEvents ?? []) {
    if (!conversionEventNames.has(event.eventName)) continue;
    items.push({ id: `event-${event.id}`, title: "New quote or form activity", detail: event.path ? `From ${pageName(event.path)}` : "New lead activity", occurredAt: event.occurredAt, status: "published" });
  }
  return items.filter((item) => item.occurredAt).sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt)).slice(0, 8);
}

export function dashboardIntegrations(data: DashboardApiData): DashboardIntegration[] {
  return (data.integrations?.integrations ?? []).map((item) => ({ ...item, state: item.connectionState === "connected" || (!item.connectionState && item.enabled && item.configured) ? "connected" : item.connectionState === "attention" || item.connectionState === "configured" || item.enabled ? "attention" : "not-connected", href: `/admin/integrations#${item.provider}` }));
}

function integrationConnected(item: NonNullable<NonNullable<DashboardApiData["integrations"]>["integrations"]>[number]) {
  return item.connectionState ? item.connectionState === "connected" : item.configured && item.enabled;
}

function trend(current?: number, previous?: number) {
  if (current === undefined || previous === undefined || previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

function pageName(path: string) {
  if (!path || path === "/") return "your homepage";
  return path.replace(/^\//, "").replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
