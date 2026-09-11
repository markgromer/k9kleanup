#!/usr/bin/env node

import { generateKeyPairSync } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";

const sitePort = Number(process.env.GOOGLE_REPORTING_QA_SITE_PORT || 3217);
const googlePort = Number(process.env.GOOGLE_REPORTING_QA_GOOGLE_PORT || 3218);
const baseUrl = `http://127.0.0.1:${sitePort}`;
const googleBase = `http://127.0.0.1:${googlePort}`;
const password = "reggie-google-reporting-qa";
const syncToken = "reggie-google-sync-qa";
const outDir = path.resolve("tmp-reggie-google-reporting-qa");
const storageDir = path.join(outDir, "storage");
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(storageDir, { recursive: true });

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const serviceAccount = JSON.stringify({
  type: "service_account",
  client_email: "reggie-reporting-qa@example.iam.gserviceaccount.com",
  private_key_id: "reggie-qa-key",
  private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  token_uri: `${googleBase}/token`,
});

const requests = [];
const google = http.createServer(async (req, res) => {
  const body = await readBody(req);
  requests.push({ method: req.method, url: redactRequestUrl(req.url), body: req.url === "/token" ? "[signed service-account assertion]" : body });
  if (req.url === "/token" && req.method === "POST") return json(res, 200, { access_token: "reggie-google-access-token", expires_in: 3600, token_type: "Bearer" });
  if (req.url?.startsWith("/pagespeedonline/v5/runPagespeed?") && req.method === "GET") return pageSpeedReport(res);
  if (req.headers.authorization !== "Bearer reggie-google-access-token") return json(res, 401, { error: { message: "Missing mock bearer token" } });
  if (req.url?.startsWith("/v1beta/properties/123456:runReport") && req.method === "POST") return analyticsReport(res, body);
  if (req.url?.startsWith("/webmasters/v3/sites/sc-domain%3Anopoop.life/searchAnalytics/query") && req.method === "POST") return searchConsoleReport(res, body);
  if (req.url === "/webmasters/v3/sites/sc-domain%3Anopoop.life" && req.method === "GET") return json(res, 200, { siteUrl: "sc-domain:nopoop.life", permissionLevel: "siteOwner" });
  return json(res, 404, { error: { message: `Unexpected mock Google request: ${req.method} ${req.url}` } });
});

await new Promise((resolve, reject) => google.listen(googlePort, "127.0.0.1", resolve).once("error", reject));

const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
const usesVinext = Boolean(packageJson.dependencies?.vinext || packageJson.devDependencies?.vinext);
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const server = usesVinext
  ? spawn(npmCommand, ["run", "dev", "--", "--port", String(sitePort)], { ...serverOptions(), shell: process.platform === "win32" })
  : spawn(process.execPath, [path.resolve("node_modules", "next", "dist", "bin", "next"), "start", "-p", String(sitePort)], serverOptions());

function serverOptions() {
  return {
  cwd: process.cwd(),
  env: {
    ...process.env,
    ADMIN_PASSWORD: password,
    REGGIE_STORAGE_DIR: storageDir,
    ADMIN_ENCRYPTION_KEY: "reggie-google-reporting-qa-encryption-key",
    INTEGRATION_SYNC_TOKEN: syncToken,
    GOOGLE_OAUTH_TOKEN_URL: `${googleBase}/token`,
    GOOGLE_ANALYTICS_API_BASE: googleBase,
    GOOGLE_SEARCH_CONSOLE_API_BASE: googleBase,
    GOOGLE_PAGESPEED_API_URL: `${googleBase}/pagespeedonline/v5/runPagespeed`,
    NEXT_PUBLIC_SITE_URL: baseUrl,
  },
  stdio: ["ignore", "pipe", "pipe"],
  };
}

let serverLog = "";
server.stdout.on("data", (chunk) => { serverLog += chunk.toString(); });
server.stderr.on("data", (chunk) => { serverLog += chunk.toString(); });

const results = { ok: false, checks: [], googleRequests: requests };
try {
  await waitForServer();
  await check("Google integrations reject unauthenticated sync", async () => expectStatus(await fetch(`${baseUrl}/api/admin/integrations`, { method: "POST" }), 401));
  await saveIntegration("google-analytics", { measurementId: "G-REGGIEQA", propertyId: "123456", serviceAccountJson: serviceAccount });
  await saveIntegration("google-search-console", { propertyUrl: "sc-domain:nopoop.life", serviceAccountJson: serviceAccount });
  await saveIntegration("google-pagespeed", { apiKey: "reggie-pagespeed-qa-secret" });
  await check("Google Analytics validates and syncs", async () => syncIntegration("google-analytics"));
  await check("Search Console validates property access and syncs", async () => syncIntegration("google-search-console"));
  await check("PageSpeed validates and syncs mobile Lighthouse data", async () => syncIntegration("google-pagespeed"));
  await check("Integration states require a successful sync", verifyIntegrationStates);
  await check("Analytics uses cached GA visitors and first-party leads", verifyAnalytics);
  await check("SEO exposes cached Search Console opportunities", verifySearchConsole);
  await check("Rankings import real Search Console positions", verifyRankingsImport);
  await check("Site health verifies public routes and cached PageSpeed", verifySiteHealth);
  await check("Scheduled sync rejects a missing token", async () => expectStatus(await fetch(`${baseUrl}/api/integrations/sync`, { method: "POST" }), 401));
  await check("Scheduled sync refreshes configured Google providers", verifyScheduledSync);
  results.ok = true;
  fs.writeFileSync(path.join(outDir, "results.json"), `${JSON.stringify(results, null, 2)}\n`);
  console.log(JSON.stringify(results, null, 2));
} catch (error) {
  results.error = error instanceof Error ? error.message : String(error);
  fs.writeFileSync(path.join(outDir, "server.log"), serverLog);
  fs.writeFileSync(path.join(outDir, "results.json"), `${JSON.stringify(results, null, 2)}\n`);
  console.error(JSON.stringify(results, null, 2));
  process.exitCode = 1;
} finally {
  server.kill("SIGTERM");
  await new Promise((resolve) => google.close(resolve));
}

async function saveIntegration(provider, values) {
  const response = await fetch(`${baseUrl}/api/admin/integrations`, { method: "PATCH", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ provider, enabled: true, values }) });
  const data = await response.json().catch(() => ({}));
  assert(response.ok, data.error || `${provider} could not be saved`);
}

async function syncIntegration(provider) {
  const response = await fetch(`${baseUrl}/api/admin/integrations`, { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ provider }) });
  const data = await response.json().catch(() => ({}));
  assert(response.ok, data.error || `${provider} sync failed`);
  assert(data.state === "success" && data.lastSyncedAt, `${provider} did not report a successful sync`);
  return { state: data.state, lastSyncedAt: data.lastSyncedAt };
}

async function verifyIntegrationStates() {
  const response = await fetch(`${baseUrl}/api/admin/integrations`, { headers: authHeaders() });
  const data = await response.json();
  assert(response.ok && Array.isArray(data.integrations), "integration status response is invalid");
  const googleRows = data.integrations.filter((item) => ["google-analytics", "google-search-console", "google-pagespeed"].includes(item.provider));
  assert(googleRows.length === 3 && googleRows.every((item) => item.connectionState === "connected" && item.syncState === "success" && item.lastSyncedAt), "Google integrations are not truthfully marked connected");
  return googleRows.map(({ provider, connectionState, syncState }) => ({ provider, connectionState, syncState }));
}

async function verifyAnalytics() {
  const response = await fetch(`${baseUrl}/api/admin/analytics?days=30`, { headers: authHeaders() });
  const data = await response.json();
  assert(response.ok, data.error || "analytics response failed");
  assert(data.analytics.dataSource === "google-analytics", "analytics did not use the cached GA report");
  assert(data.analytics.visitors === 40 && data.analytics.previousVisitors === 32, "GA visitor comparison is incorrect");
  assert(data.analytics.conversions === 0 && data.analytics.previousConversions === 0, "first-party lead totals were replaced by GA key events");
  assert(data.analytics.topPages[0]?.path === "/" && !data.analytics.topPages.some((item) => item.path.startsWith("/admin")), "admin traffic leaked into GA page rankings");
  return { visitors: data.analytics.visitors, previousVisitors: data.analytics.previousVisitors, conversions: data.analytics.conversions, topPages: data.analytics.topPages };
}

async function verifySearchConsole() {
  const response = await fetch(`${baseUrl}/api/admin/seo`, { headers: authHeaders() });
  const data = await response.json();
  assert(response.ok, data.error || "SEO response failed");
  assert(data.searchConsole.state === "success", "Search Console state is not successful");
  assert(data.searchConsole.data.clicks === 18 && data.searchConsole.data.impressions === 420, "Search Console totals are incorrect");
  assert(data.searchConsole.data.topQueries[0]?.query === "dog poop cleanup tucson", "Search Console query rows are incorrect");
  return { state: data.searchConsole.state, clicks: data.searchConsole.data.clicks, topQuery: data.searchConsole.data.topQueries[0]?.query };
}

async function verifyRankingsImport() {
  const beforeResponse = await fetch(`${baseUrl}/api/admin/rankings`, { headers: authHeaders() });
  const before = await beforeResponse.json();
  assert(beforeResponse.ok && before.discovered?.length === 2, "Search Console discoveries are missing from rankings");
  const importResponse = await fetch(`${baseUrl}/api/admin/rankings`, { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ action: "import-search-console" }) });
  const imported = await importResponse.json();
  assert(importResponse.ok && imported.imported === 2, imported.error || "Search Console rankings were not imported");
  const afterResponse = await fetch(`${baseUrl}/api/admin/rankings`, { headers: authHeaders() });
  const after = await afterResponse.json();
  const keyword = after.keywords?.find((item) => item.keyword === "dog poop cleanup tucson");
  assert(afterResponse.ok && keyword?.device === "all" && keyword?.location === "Google Search Console" && keyword.latestPosition === 7.2 && keyword.previousPosition === 8.4 && keyword.searchVolume === null, "Imported ranking does not preserve truthful Search Console metrics");
  return { imported: imported.imported, keyword: keyword.keyword, position: keyword.latestPosition, previousPosition: keyword.previousPosition };
}

async function verifyScheduledSync() {
  const response = await fetch(`${baseUrl}/api/integrations/sync`, { method: "POST", headers: { Authorization: `Bearer ${syncToken}` } });
  const data = await response.json();
  assert(response.ok && data.ok && data.results?.length === 3 && data.results.every((item) => item.ok), data.error || "scheduled sync failed");
  return { integrations: data.results, health: data.health };
}

async function verifySiteHealth() {
  const response = await fetch(`${baseUrl}/api/admin/site-health`, { method: "POST", headers: authHeaders() });
  const data = await response.json();
  assert(response.ok, data.error || "site-health response failed");
  const health = data.health?.data;
  assert(data.health?.pageSpeed?.state === "success" && data.health.pageSpeed.data?.scores?.performance === 82, "PageSpeed snapshot is missing from site health");
  return { homepage: health?.homepage?.status ?? 0, sitemap: health?.sitemap?.status ?? 0, robots: health?.robots?.status ?? 0, quote: health?.quoteEndpoint?.status ?? 0, performance: data.health.pageSpeed.data.scores.performance };
}

function analyticsReport(res, rawBody) {
  const body = JSON.parse(rawBody || "{}");
  const dimension = body.dimensions?.[0]?.name;
  const headers = (body.metrics ?? []).map((metric) => ({ name: metric.name }));
  if (dimension === "pagePath") return json(res, 200, gaRows("pagePath", "screenPageViews", [["/", 32], ["/services", 14], ["/admin", 12]]));
  if (dimension === "sessionSource") return json(res, 200, gaRows("sessionSource", "sessions", [["google", 20], ["(direct)", 10]]));
  const current = Date.now() - Date.parse(`${body.dateRanges?.[0]?.startDate}T00:00:00Z`) < 40 * 86400000;
  return json(res, 200, { metricHeaders: headers, rows: [{ metricValues: (current ? [40, 50, 4] : [32, 42, 2]).map((value) => ({ value: String(value) })) }] });
}

function gaRows(dimension, metric, rows) {
  return { dimensionHeaders: [{ name: dimension }], metricHeaders: [{ name: metric }], rows: rows.map(([label, value]) => ({ dimensionValues: [{ value: label }], metricValues: [{ value: String(value) }] })) };
}

function searchConsoleReport(res, rawBody) {
  const body = JSON.parse(rawBody || "{}");
  const dimension = body.dimensions?.[0];
  if (dimension === "query") { const current = Date.now() - Date.parse(`${body.startDate}T00:00:00Z`) < 40 * 86400000; return json(res, 200, { rows: current ? [{ keys: ["dog poop cleanup tucson"], clicks: 8, impressions: 180, ctr: 0.0444, position: 7.2 }, { keys: ["pooper scooper near me"], clicks: 4, impressions: 120, ctr: 0.0333, position: 9.8 }] : [{ keys: ["dog poop cleanup tucson"], clicks: 6, impressions: 150, ctr: 0.04, position: 8.4 }, { keys: ["pooper scooper near me"], clicks: 3, impressions: 95, ctr: 0.0315, position: 11.1 }] }); }
  if (dimension === "page") return json(res, 200, { rows: [{ keys: ["https://nopoop.life/"], clicks: 10, impressions: 220, ctr: 0.0454, position: 6.4 }] });
  const current = Date.now() - Date.parse(`${body.startDate}T00:00:00Z`) < 40 * 86400000;
  return json(res, 200, { rows: [{ clicks: current ? 18 : 12, impressions: current ? 420 : 300, ctr: current ? 0.0428 : 0.04, position: current ? 7.4 : 8.6 }] });
}

function pageSpeedReport(res) {
  return json(res, 200, { lighthouseResult: { fetchTime: new Date().toISOString(), finalUrl: baseUrl, categories: { performance: { score: 0.82 }, accessibility: { score: 0.96 }, "best-practices": { score: 0.91 }, seo: { score: 1 } }, audits: { "largest-contentful-paint": { title: "Largest Contentful Paint", numericValue: 2450, displayValue: "2.5 s" }, "first-contentful-paint": { title: "First Contentful Paint", numericValue: 1100, displayValue: "1.1 s" }, "cumulative-layout-shift": { title: "Cumulative Layout Shift", numericValue: 0.03, displayValue: "0.03" }, "total-blocking-time": { title: "Total Blocking Time", numericValue: 90, displayValue: "90 ms" }, "speed-index": { title: "Speed Index", numericValue: 1900, displayValue: "1.9 s" }, "render-blocking-resources": { title: "Eliminate render-blocking resources", displayValue: "Potential savings of 320 ms", details: { overallSavingsMs: 320 } } } } });
}

async function check(name, fn) {
  const value = await fn();
  results.checks.push({ name, ok: true, value });
}

function authHeaders(extra = {}) { return { Authorization: `Bearer ${password}`, ...extra }; }
function expectStatus(response, status) { assert(response.status === status, `Expected ${status}, got ${response.status}`); return { status }; }
function assert(value, message) { if (!value) throw new Error(message); }
function json(res, status, value) { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(value)); }
function readBody(req) { return new Promise((resolve) => { let body = ""; req.on("data", (chunk) => { body += chunk; }); req.on("end", () => resolve(body)); }); }
function redactRequestUrl(value = "") { try { const url = new URL(value, googleBase); if (url.searchParams.has("key")) url.searchParams.set("key", "[redacted]"); return `${url.pathname}${url.search}`; } catch { return value; } }
async function waitForServer() { for (let attempt = 0; attempt < 80; attempt += 1) { try { const response = await fetch(`${baseUrl}/admin`); if (response.ok) return; } catch { /* The bounded retry loop handles startup connection failures. */ } await new Promise((resolve) => setTimeout(resolve, 250)); } throw new Error(`Next.js did not start. ${serverLog.slice(-1000)}`); }
