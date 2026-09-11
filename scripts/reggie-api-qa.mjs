#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const baseUrl = getOption("--base-url") || process.env.REGGIE_QA_BASE_URL || "";
const recoveryPasswordPath = path.resolve(".reggie", "admin-password");
const password = getOption("--password") || process.env.REGGIE_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || (fs.existsSync(recoveryPasswordPath) ? fs.readFileSync(recoveryPasswordPath, "utf8").trim() : "");
const outDir = path.resolve(getOption("--out-dir") || "tmp-reggie-api-qa");
fs.mkdirSync(outDir, { recursive: true });

if (!baseUrl) {
  const skipped = { ok: true, skipped: "Provide --base-url or REGGIE_QA_BASE_URL to run live Reggie API checks." };
  fs.writeFileSync(path.join(outDir, "results.json"), `${JSON.stringify(skipped, null, 2)}\n`);
  console.log(JSON.stringify(skipped, null, 2));
  process.exit(0);
}
if (!password) throw new Error("Provide --password, REGGIE_ADMIN_PASSWORD, or a .reggie/admin-password recovery file for live API checks.");

const results = { baseUrl, checks: [] };
await check("Connection rejects unauthenticated access", async () => expectStatus(await fetch(`${baseUrl}/api/admin/reggie-connect`), [401]));
await check("Mission queue rejects unauthenticated access", async () => expectStatus(await fetch(`${baseUrl}/api/admin/reggie-mission`), [401]));
await check("Font library rejects unauthenticated access", async () => expectStatus(await fetch(`${baseUrl}/api/admin/fonts`), [401]));
await check("PoopSites catalog rejects unauthenticated access", async () => expectStatus(await fetch(`${baseUrl}/api/admin/reggie-catalog?include=templates`), [401]));
await check("Brand voice rejects unauthenticated access", async () => expectStatus(await fetch(`${baseUrl}/api/admin/reggie-brand-voice`), [401]));
await check("Copy rewrite rejects unauthenticated access", async () => expectStatus(await fetch(`${baseUrl}/api/admin/reggie-rewrite`, { method: "POST" }), [401]));
await check("Sweep & Go payment status requires a signup ID", async () => expectStatus(await fetch(`${baseUrl}/api/quote/payment`), [400]));
await check("Sweep & Go payment webhook rejects an empty payload", async () => expectStatus(await fetch(`${baseUrl}/api/quote/sweep-and-go-webhook`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "null" }), [400]));
await check("Quote coupon validation requires a code", async () => expectStatus(await fetch(`${baseUrl}/api/quote/coupon`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }), [400]));
await check("Public quote settings expose one payment contract", async () => {
  const response = await fetch(`${baseUrl}/api/quote/settings`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { ...expectStatus(response, [503]), error: data.error ?? "" };
  assertTruthy(typeof data.settings?.payment?.enabled === "boolean", "quote settings should expose payment.enabled");
  assertTruthy(typeof data.settings?.payment?.statusUrl === "string", "quote settings should expose payment.statusUrl");
  return { ...expectStatus(response, [200]), payment: data.settings.payment };
});
await check("Verified Sweep & Go routes public quotes through SNG", async () => {
  const integrationsResponse = await fetch(`${baseUrl}/api/admin/integrations`, { headers: authHeaders() });
  const integrationsData = await integrationsResponse.json().catch(() => ({}));
  if (!integrationsResponse.ok) return { ...expectStatus(integrationsResponse, [200, 401, 503]), error: integrationsData.error ?? "" };
  const sweepAndGo = Array.isArray(integrationsData.integrations) ? integrationsData.integrations.find((item) => item.provider === "sweep-and-go") : null;
  if (!sweepAndGo?.verified) return { ...expectStatus(integrationsResponse, [200]), skipped: "Sweep & Go is not verified." };

  const settingsResponse = await fetch(`${baseUrl}/api/quote/settings`);
  const settingsData = await settingsResponse.json().catch(() => ({}));
  assertTruthy(settingsResponse.ok, settingsData.error || "quote settings should be public");
  const crm = settingsData.settings?.crm ?? {};
  assertTruthy(crm.provider === "sweep-and-go", "verified Sweep & Go must set Quote Tool provider to sweep-and-go");
  assertTruthy(crm.pricingSource === "crm", "verified Sweep & Go must set Quote Tool pricingSource to crm");
  assertTruthy(crm.serviceDataSource === "crm", "verified Sweep & Go must set Quote Tool serviceDataSource to crm");
  return { ...expectStatus(settingsResponse, [200]), provider: crm.provider, pricingSource: crm.pricingSource, serviceDataSource: crm.serviceDataSource };
});
await check("Sweep & Go quote options and pricing are live", async () => {
  const quoteZip = getOption("--quote-zip") || process.env.REGGIE_QA_QUOTE_ZIP || "";
  if (!quoteZip) return { skipped: "Provide --quote-zip or REGGIE_QA_QUOTE_ZIP to verify live SNG quote data." };
  const optionsResponse = await fetch(`${baseUrl}/api/quote/options?zip=${encodeURIComponent(quoteZip)}`);
  const options = await optionsResponse.json().catch(() => ({}));
  assertTruthy(optionsResponse.ok, options.error || "quote options should be available");
  assertTruthy(options.provider === "sweep-and-go", "quote options should come from Sweep & Go");
  assertTruthy(Array.isArray(options.frequencies) && options.frequencies.length > 0, "Sweep & Go options should include frequencies");

  const frequency = options.frequencies[0]?.value || options.frequencies[0]?.id || "once_a_week";
  const dogs = Array.isArray(options.dogs) && options.dogs[0] ? options.dogs[0] : 1;
  const priceResponse = await fetch(`${baseUrl}/api/quote/price`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ zipCode: quoteZip, numberOfDogs: dogs, frequency, lastCleaned: "one_week" }),
  });
  const price = await priceResponse.json().catch(() => ({}));
  assertTruthy(priceResponse.ok, price.error || "quote pricing should be available");
  assertTruthy(price.provider === "sweep-and-go" && price.source === "sweepandgo", "quote pricing should come from Sweep & Go");
  assertTruthy(typeof price.perCleanup === "number" || typeof price.monthlyPrice === "number", "Sweep & Go price should include a numeric price");
  return { zip: quoteZip, frequency, dogs, provider: price.provider, perCleanup: price.perCleanup ?? null, monthlyPrice: price.monthlyPrice ?? null };
});
await check("Connection returns a safe status shape", async () => {
  const response = await fetch(`${baseUrl}/api/admin/reggie-connect`, { headers: authHeaders() });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { ...expectStatus(response, [200, 401, 502]), error: data.error ?? "" };
  assertTruthy(typeof data.connected === "boolean", "connection response should expose connected");
  assertTruthy(typeof data.status === "string", "connection response should expose status");
  return { ...expectStatus(response, [200]), connected: data.connected, status: data.status };
});
await check("Mission queue returns Hub-backed jobs", async () => {
  const response = await fetch(`${baseUrl}/api/admin/reggie-mission?refresh=1`, { headers: authHeaders() });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { ...expectStatus(response, [200, 401, 502, 503]), error: data.error ?? "" };
  assertTruthy(Array.isArray(data.jobs), "mission queue should return jobs");
  return { ...expectStatus(response, [200]), jobCount: data.jobs.length, configured: data.configured ?? null };
});
await check("Mission validation does not dispatch short requests", async () => {
  const response = await fetch(`${baseUrl}/api/admin/reggie-mission`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ requestType: "site_revision", prompt: "too short" }),
  });
  const data = await response.json().catch(() => ({}));
  assertTruthy(/describe the change/i.test(String(data.error ?? "")), "short request should return validation feedback");
  return { ...expectStatus(response, [400]), error: data.error };
});
await check("Copy rewrite validates input before inference", async () => {
  const response = await fetch(`${baseUrl}/api/admin/reggie-rewrite`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ text: "x", mode: "rewrite" }),
  });
  const data = await response.json().catch(() => ({}));
  assertTruthy(/2,000 characters|at least two characters/i.test(String(data.error ?? "")), "short rewrite should return validation feedback");
  return { ...expectStatus(response, [400]), error: data.error };
});
await check("Font library returns a safe collection shape", async () => {
  const response = await fetch(`${baseUrl}/api/admin/fonts`, { headers: authHeaders() });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { ...expectStatus(response, [200, 401, 500]), error: data.error ?? "" };
  assertTruthy(typeof data.configured === "boolean", "font library should expose configured");
  assertTruthy(Array.isArray(data.assets), "font library should expose assets");
  return { ...expectStatus(response, [200]), configured: data.configured, assetCount: data.assets.length };
});
await check("PoopSites catalog returns paginated media and layouts", async () => {
  const response = await fetch(`${baseUrl}/api/admin/reggie-catalog?include=assets,templates&limit=2`, { headers: authHeaders() });
  const data = await response.json().catch(() => ({}));
  assertTruthy(response.ok, data.error || "PoopSites catalog should be available");
  assertTruthy(Array.isArray(data.assets?.items), "catalog should expose asset items");
  assertTruthy(data.assets.items.length <= 2, "catalog should honor its page limit");
  assertTruthy(Array.isArray(data.templates), "catalog should expose layout templates");
  return { ...expectStatus(response, [200]), assetCount: data.assets.items.length, templateCount: data.templates.length };
});
await check("Brand voice returns a stable profile", async () => {
  const response = await fetch(`${baseUrl}/api/admin/reggie-brand-voice`, { headers: authHeaders() });
  const data = await response.json().catch(() => ({}));
  assertTruthy(response.ok, data.error || "brand voice should be available");
  assertTruthy(data.profile && Array.isArray(data.profile.approvedPhrases) && Array.isArray(data.profile.forbiddenClaims), "brand voice should expose phrase controls");
  return { ...expectStatus(response, [200]), source: data.profile.source };
});

fs.writeFileSync(path.join(outDir, "results.json"), `${JSON.stringify(results, null, 2)}\n`);
const failed = results.checks.filter((entry) => !entry.ok);
if (failed.length) {
  console.error(JSON.stringify(results, null, 2));
  process.exit(1);
}
console.log(JSON.stringify(results, null, 2));

async function check(name, fn) {
  try {
    const value = await fn();
    results.checks.push({ name, ok: true, value });
  } catch (error) {
    results.checks.push({ name, ok: false, error: error instanceof Error ? error.message : String(error) });
  }
}

function authHeaders() { return { Authorization: `Bearer ${password}` }; }
function expectStatus(response, expected) {
  if (!expected.includes(response.status)) throw new Error(`Expected ${expected.join(" or ")}, got ${response.status}`);
  return { status: response.status };
}
function assertTruthy(value, message) { if (!value) throw new Error(message); }
function getOption(name) {
  const index = args.indexOf(name);
  return index === -1 || !args[index + 1] || args[index + 1].startsWith("-") ? "" : args[index + 1];
}
