import {
  readAdminSetting,
  writeAdminSetting,
  type IntegrationSyncState,
} from "@/lib/admin-platform";

const SITE_HEALTH_KEY = "site-health:current";
const FRESH_FOR_MS = 6 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 15_000;

export type SiteHealthProbe = {
  ok: boolean;
  status: number;
  responseMs: number;
  url: string;
  detail: string;
};

export type SiteHealthSnapshot = {
  provider: "site-health";
  siteUrl: string;
  checkedAt: string;
  homepage: SiteHealthProbe;
  ssl: { ok: boolean; detail: string };
  sitemap: SiteHealthProbe;
  robots: SiteHealthProbe & { allowsCrawling: boolean };
  quoteEndpoint: SiteHealthProbe;
};

export type SiteHealthRecord = IntegrationSyncState & { provider: "site-health"; data?: SiteHealthSnapshot };

export async function getSiteHealthRecord(refreshIfStale = true): Promise<SiteHealthRecord> {
  const record = await storedRecord();
  const age = Date.now() - Date.parse(record.lastSuccessAt || "");
  if (!refreshIfStale || (record.state === "success" && Number.isFinite(age) && age < FRESH_FOR_MS)) return record;
  try { return await syncSiteHealth(); }
  catch { return storedRecord(); }
}

export async function syncSiteHealth(): Promise<SiteHealthRecord> {
  const previous = await storedRecord();
  const lastAttemptAt = new Date().toISOString();
  await writeAdminSetting(SITE_HEALTH_KEY, { ...previous, provider: "site-health", state: "syncing", lastAttemptAt, error: "" } satisfies SiteHealthRecord);
  try {
    const siteUrl = configuredSiteOrigin();
    const [homepage, sitemapResponse, robotsResponse, quoteResponse] = await Promise.all([
      probe(siteUrl),
      probe(new URL("/sitemap.xml", siteUrl).toString(), "sitemap"),
      probe(new URL("/robots.txt", siteUrl).toString(), "robots"),
      probe(new URL("/api/quote/settings", siteUrl).toString(), "quote"),
    ]);
    const robotsAllowsCrawling = robotsResponse.ok && !blocksAllCrawlers(robotsResponse.body);
    const checkedAt = new Date().toISOString();
    const data: SiteHealthSnapshot = {
      provider: "site-health",
      siteUrl,
      checkedAt,
      homepage: publicProbe(homepage, homepage.ok ? "Website responded normally" : "Homepage could not be reached"),
      ssl: {
        ok: siteUrl.startsWith("https://") && homepage.ok && homepage.finalUrl.startsWith("https://"),
        detail: siteUrl.startsWith("https://") && homepage.ok && homepage.finalUrl.startsWith("https://") ? "Secure HTTPS connection validated" : "Secure HTTPS needs attention",
      },
      sitemap: publicProbe(sitemapResponse, sitemapResponse.ok && /<(urlset|sitemapindex)\b/i.test(sitemapResponse.body) ? "Sitemap is available" : "Sitemap could not be validated", sitemapResponse.ok && /<(urlset|sitemapindex)\b/i.test(sitemapResponse.body)),
      robots: {
        ...publicProbe(robotsResponse, robotsAllowsCrawling ? "Search crawlers are allowed" : "Crawler access needs attention", robotsAllowsCrawling),
        allowsCrawling: robotsAllowsCrawling,
      },
      quoteEndpoint: publicProbe(quoteResponse, quoteResponse.ok && quoteSettingsReady(quoteResponse.body) ? "Quote tool is responding" : "Quote tool needs attention", quoteResponse.ok && quoteSettingsReady(quoteResponse.body)),
    };
    const record: SiteHealthRecord = { provider: "site-health", state: "success", lastAttemptAt, lastSuccessAt: checkedAt, error: "", data };
    await writeAdminSetting(SITE_HEALTH_KEY, record);
    return record;
  } catch (error) {
    const message = safeError(error);
    await writeAdminSetting(SITE_HEALTH_KEY, { ...previous, provider: "site-health", state: "error", lastAttemptAt, error: message } satisfies SiteHealthRecord);
    throw new Error(message);
  }
}

type ProbeResult = SiteHealthProbe & { body: string; finalUrl: string };

async function probe(url: string, kind: "page" | "sitemap" | "robots" | "quote" = "page"): Promise<ProbeResult> {
  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      redirect: "follow",
      cache: "no-store",
      headers: { "User-Agent": "PoopSites-Site-Health/1.0", Accept: kind === "quote" ? "application/json" : "text/html,text/plain,application/xml;q=0.9,*/*;q=0.5" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const body = kind === "page" ? "" : (await response.text()).slice(0, 250_000);
    return { ok: response.ok, status: response.status, responseMs: Date.now() - startedAt, url, finalUrl: response.url || url, detail: "", body };
  } catch (error) {
    return { ok: false, status: 0, responseMs: Date.now() - startedAt, url, finalUrl: url, detail: safeError(error), body: "" };
  }
}

function publicProbe(probeResult: ProbeResult, detail: string, ok = probeResult.ok): SiteHealthProbe {
  return { ok, status: probeResult.status, responseMs: probeResult.responseMs, url: probeResult.url, detail: probeResult.detail || detail };
}

function configuredSiteOrigin() {
  const raw = process.env.REGGIE_LIVE_URL || process.env.NEXT_PUBLIC_SITE_URL || "";
  if (!raw) throw new Error("Set NEXT_PUBLIC_SITE_URL or REGGIE_LIVE_URL before running site-health checks.");
  const url = new URL(raw);
  if (!["https:", "http:"].includes(url.protocol)) throw new Error("The configured website URL must use HTTP or HTTPS.");
  return url.origin;
}

function quoteSettingsReady(body: string) {
  try { const value = JSON.parse(body) as { ok?: boolean; settings?: unknown }; return value.ok === true && Boolean(value.settings); }
  catch { return false; }
}

function blocksAllCrawlers(body: string) {
  let appliesToAll = false;
  let groupHasRules = false;
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, "").trim();
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (field === "user-agent") {
      if (groupHasRules) { appliesToAll = false; groupHasRules = false; }
      if (value === "*") appliesToAll = true;
      continue;
    }
    if (!appliesToAll) continue;
    groupHasRules = true;
    if (field === "disallow" && value === "/") return true;
  }
  return false;
}

async function storedRecord(): Promise<SiteHealthRecord> {
  const fallback: SiteHealthRecord = { provider: "site-health", state: "never", lastAttemptAt: "", lastSuccessAt: "", error: "" };
  const stored = await readAdminSetting<SiteHealthRecord>(SITE_HEALTH_KEY, fallback);
  return { ...fallback, ...stored, provider: "site-health" };
}

function safeError(error: unknown) {
  return (error instanceof Error ? error.message : "Site-health check failed.").replace(/https?:\/\/[^\s]+/g, "[site URL]").slice(0, 300);
}
