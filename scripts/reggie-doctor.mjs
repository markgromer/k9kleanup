#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

import { inspectRenderPersistentStorage } from "./reggie-render-storage.mjs";

const root = process.cwd();
const results = { root, ok: true, required: [], warnings: [] };
const manifest = readOptionalJson(".reggie/manifest.json") ?? {};
const sourceRoot = manifest.sourceRoot === "" ? "" : "src";
const platform = manifest.platform === "pages" ? "pages" : manifest.platform === "render" ? "render" : "worker";
const source = (file) => `${sourceRoot ? `${sourceRoot}/` : ""}${file}`;

const requiredFiles = [
  ".github/workflows/reggie-quality.yml",
  "docs/admin-revision-system.md",
  "docs/reggie-site-context.md",
  "scripts/reggie-api-qa.mjs",
  "scripts/reggie-doctor.mjs",
  "scripts/reggie-full-qa.mjs",
  "scripts/reggie-lens-browser-qa.mjs",
  "scripts/reggie-lens-retry.mjs",
  "scripts/reggie-lint-baseline.mjs",
  "scripts/reggie-lint-compat.mjs",
  "scripts/reggie-page-registry.mjs",
  "scripts/reggie-page-registry-qa.mjs",
  "scripts/reggie-render-storage.mjs",
  "scripts/reggie-source-map.mjs",
  "scripts/reggie-workflow-qa.mjs",
  source("app/admin/reggie-deploy/page.tsx"),
  source("app/admin/reggie-lens/page.tsx"),
  source("app/admin/reggie-queue/page.tsx"),
  source("app/admin/layout.tsx"),
  source("app/admin/page.tsx"),
  source("app/admin/analytics/page.tsx"),
  source("app/admin/seo/page.tsx"),
  source("app/admin/rankings/page.tsx"),
  source("app/admin/integrations/page.tsx"),
  source("components/admin-shell/AdminShell.tsx"),
  source("components/admin-portal/AdminPortal.tsx"),
  source("components/admin-portal/domains/shell.tsx"),
  source("components/reggie-lens/ReggieLensWorkspace.tsx"),
  source("components/reggie-mission-queue/ReggieMissionQueue.tsx"),
  source("components/reggie-progress/ReggieProgress.tsx"),
  source("lib/admin-revision.ts"),
  source("lib/reggie-lens.ts"),
  source("lib/reggie-section-recipes.ts"),
  source("generated/reggie-source-map.ts"),
  source("generated/reggie-page-registry.ts"),
];
if (platform === "pages") {
  requiredFiles.push("functions/api/admin/session.ts", "functions/api/admin/settings.ts", "functions/api/admin/dashboard-overview.ts", "functions/api/admin/reggie-connect.ts", "functions/api/admin/reggie-lens/auth.ts", "functions/api/admin/reggie-mission.ts", "functions/api/admin/reggie-source-map.ts", "functions/api/admin/[[platform]].ts", "functions/api/admin/media.ts", "functions/api/analytics/collect.ts", "functions/api/media/[id].ts", "functions/_lib/admin-password-kdf.ts", "functions/_lib/admin-platform.ts", "functions/_generated/reggie-source-map.ts");
} else {
  requiredFiles.push(source("app/api/admin/session/route.ts"), source("app/api/admin/dashboard-overview/route.ts"), source("app/api/admin/reggie-connect/route.ts"), source("app/api/admin/reggie-lens/auth/route.ts"), source("app/api/admin/reggie-mission/route.ts"), source("app/api/admin/reggie-source-map/route.ts"), source("app/api/admin/dashboard/route.ts"), source("app/api/admin/analytics/route.ts"), source("app/api/admin/seo/route.ts"), source("app/api/admin/rankings/route.ts"), source("app/api/admin/integrations/route.ts"), source("app/api/admin/site-health/route.ts"), source("app/api/analytics/collect/route.ts"), source("app/api/media/[id]/route.ts"), source("lib/admin-auth.ts"), source("lib/admin-password-kdf.ts"), source("lib/admin-platform.ts"), source("lib/site-health.ts"));
  if (platform === "render") requiredFiles.push(source("app/api/reggie/release/route.ts"));
}

for (const file of requiredFiles) requireFile(file);

const packageJson = readJson("package.json");
if (packageJson) {
  requirePackageScript(packageJson, "reggie:qa", "node scripts/reggie-api-qa.mjs");
  requirePackageScript(packageJson, "reggie:api-qa", "node scripts/reggie-api-qa.mjs");
  requirePackageScript(packageJson, "reggie:doctor", "node scripts/reggie-doctor.mjs");
  requirePackageScript(packageJson, "reggie:full-qa", "node scripts/reggie-full-qa.mjs");
  if (platform === "render") requirePackageScript(packageJson, "reggie:google-qa", "node scripts/google-reporting-qa.mjs");
  requirePackageScript(packageJson, "reggie:lens-qa", "node scripts/reggie-lens-browser-qa.mjs --skip-performance");
  requirePackageScript(packageJson, "reggie:workflow-qa", "node scripts/reggie-workflow-qa.mjs");
  requirePackageScript(packageJson, "reggie:routes", "node scripts/reggie-page-registry.mjs sync --root .");
  requirePackageScript(packageJson, "reggie:source-map", "node scripts/reggie-source-map.mjs");
  recordRequired(String(packageJson.scripts?.prebuild ?? "").indexOf("reggie:routes") >= 0 && String(packageJson.scripts?.prebuild ?? "").indexOf("reggie:routes") < String(packageJson.scripts?.prebuild ?? "").indexOf("reggie:source-map"), "route registry prebuild order", "reggie:routes must run before reggie:source-map");
  requirePackageDependency(packageJson, "@playwright/test");
}

const bridge = platform === "pages" ? "functions/api/admin/reggie-mission.ts" : source("app/api/admin/reggie-mission/route.ts");
const connection = platform === "pages" ? "functions/_lib/reggie.ts" : source("lib/reggie-connection.ts");
const auth = platform === "pages" ? "functions/_lib/reggie.ts" : source("lib/admin-auth.ts");
requireMarker(connection, "REGGIE_CONNECT_SITE_TOKEN", "Client reads only its Reggie connection secret");
requireAnyMarker(auth, ["REGGIE_ADMIN_PASSWORD", "ADMIN_PASSWORD"], "Admin auth has a secret-backed owner password path");
requireAnyMarker(auth, ["REGGIE_ADMIN_SUPER_PASSWORD", "ADMIN_SUPER_PASSWORD"], "Admin auth supports optional secret-backed web-team access");
requireMarker(auth, "ADMIN_SESSION_COOKIE", "Admin auth supports signed browser sessions");
requireAbsent(auth, /DEFAULT_ADMIN_PASSWORD|DEFAULT_DEV_PASSWORD|changeme123|password123/i, "Admin auth ships no built-in production passwords");
const settingsRoute = platform === "pages" ? "functions/api/admin/settings.ts" : source("app/api/admin/settings/route.ts");
requireMarker(settingsRoute, "changeAdminPassword", "Admin settings can change the owner password");
requireMarker(settingsRoute, "resetAdminPasswordForSupport", "Support can securely recover owner access");
if (platform === "worker" || platform === "pages") {
  const wranglerPath = ["wrangler.jsonc", "wrangler.json", "wrangler.toml"].find((file) => fs.existsSync(path.join(root, file))) ?? "";
  const wrangler = readText(wranglerPath);
  recordRequired(/(?:["']binding["']\s*:\s*["']INTEGRATIONS_DB["']|\bbinding\s*=\s*["']INTEGRATIONS_DB["'])/.test(wrangler), "Cloudflare D1 admin storage", "INTEGRATIONS_DB must be bound; run reggie connect --deploy");
  recordRequired(/(?:["']binding["']\s*:\s*["']REGGIE_MEDIA["']|\bbinding\s*=\s*["']REGGIE_MEDIA["'])/.test(wrangler), "Cloudflare R2 media storage", "REGGIE_MEDIA must be bound; run reggie connect --deploy");
} else if (platform === "render") {
  const storage = inspectRenderPersistentStorage(root);
  recordRequired(
    storage.ok,
    "Render persistent admin storage",
    storage.ok
      ? `${storage.storageKey} is declared inside the web service disk.mountPath`
      : `${storage.issues.join(" ")} Declare a persistent disk and set REGGIE_STORAGE_DIR or BLOG_STORAGE_DIR to a literal absolute path inside disk.mountPath before deploying or connecting Reggie.`,
  );
}
requireMarker(bridge, "/v1/sites/", "Mission API forwards requests to the Reggie Hub");
requireMarker(bridge, "Please describe the change", "Mission API validates requests before dispatch");
if (platform === "render") requireMarker(source("app/api/reggie/release/route.ts"), "RENDER_GIT_COMMIT", "Render exposes a non-secret release probe");
requireMarker(source("components/reggie-mission-queue/ReggieMissionQueue.tsx"), "/api/admin/reggie-mission", "Mission queue uses the Hub-only API");
requireMarker(source("components/reggie-mission-queue/ReggieMissionQueue.tsx"), "Publish Mission", "Mission queue exposes publish when a draft is ready");
requireMarker(source("components/reggie-mission-queue/ReggieMissionQueue.tsx"), "Approved page recipe", "Mission queue exposes approved landing-page recipes");
requireMarker(source("components/reggie-mission-queue/ReggieMissionQueue.tsx"), "Retry Mission", "Mission queue exposes bounded retries");
if (platform === "pages") requireMarker("functions/api/admin/reggie-mission.ts", "assetMissionId", "Pages mission adapter streams private review assets");
requireMarker(source("components/reggie-lens/ReggieLensWorkspace.tsx"), "/api/admin/reggie-mission", "Lens submits through the Hub-only API");
requireMarker(source("components/reggie-lens/ReggieLensWorkspace.tsx"), "/api/admin/reggie-source-map", "Lens loads source candidates");
requireMarker(source("components/reggie-lens/ReggieLensWorkspace.tsx"), "getFocusableElements", "Lens review dialog contains keyboard focus");
requireMarker(source("components/admin-shell/AdminShell.module.css"), "position: fixed", "Admin shell owns the application viewport");
requireMarker(source("components/admin-shell/AdminShell.module.css"), "overflow-y: auto", "Admin shell keeps scrolling inside the workspace");
requireMarker(source("components/admin-shell/AdminShell.tsx"), "/admin/integrations", "Admin shell exposes the integrations workspace");
requireAdminPortalMarker("SEO Inventory", "Admin portal includes SEO inventory");
requireAdminPortalMarker("Rank Tracking", "Admin portal includes rank tracking");
requireMarker("scripts/reggie-lens-browser-qa.mjs", "desktop layout editing and review focus", "Lens browser regression covers direct manipulation");
requireMarker(".github/workflows/reggie-quality.yml", "npm run reggie:lens-qa", "Linux quality workflow runs Lens browser regression");
if (platform === "render") requireMarker(".github/workflows/reggie-quality.yml", "reggie:google-qa", "Linux quality workflow runs Google reporting regression");
requireMarker(source("app/admin/reggie-deploy/page.tsx"), "You never need to enter OpenAI", "Connection page hides central credentials");
requireAbsent(source("components/reggie-mission-queue/ReggieMissionQueue.tsx"), /codex-jobs|github-secret|screenshot gate|Capturing screenshots/i, "Mission queue has no legacy client automation or screenshot gate");
requireAbsent(source("app/admin/reggie-deploy/page.tsx"), /WARREN|cloudflareApiToken|openAiKey/i, "Connection page has no WARREN or credential form");
requireAbsent(source("lib/reggie-lens.ts"), /screenshots are part of the workflow/i, "Lens prompt does not require screenshots");

const adminPage = source("app/admin/page.tsx");
warnUnlessMarker(adminPage, "CustomerDashboard", "Admin overview does not use the managed customer dashboard.");

fs.writeFileSync(path.join(root, "tmp-reggie-doctor.json"), `${JSON.stringify(results, null, 2)}\n`);
if (!results.ok) {
  console.error(JSON.stringify(results, null, 2));
  process.exit(1);
}
console.log(JSON.stringify(results, null, 2));

function requireFile(file) {
  const ok = fs.existsSync(path.join(root, file));
  recordRequired(ok, file, ok ? "present" : "missing required file");
}

function requirePackageScript(packageJson, name, expected) {
  const actual = packageJson.scripts?.[name];
  recordRequired(actual === expected, `package script ${name}`, actual === expected ? "present" : actual ? `expected ${expected}, got ${actual}` : `missing ${expected}`);
}

function requirePackageDependency(packageJson, name) {
  const actual = packageJson.dependencies?.[name] ?? packageJson.devDependencies?.[name];
  recordRequired(Boolean(actual), `package dependency ${name}`, actual ? `present (${actual})` : "missing");
}

function requireMarker(file, marker, name) {
  const content = readText(file);
  recordRequired(Boolean(content && content.includes(marker)), name, content?.includes(marker) ? "present" : `missing marker ${marker} in ${file}`);
}

function requireAdminPortalMarker(marker, name) {
  const directory = path.join(root, source("components/admin-portal/domains"));
  const content = fs.existsSync(directory)
    ? fs.readdirSync(directory).filter((file) => file.endsWith(".tsx")).map((file) => readText(source(`components/admin-portal/domains/${file}`))).join("\n")
    : readText(source("components/admin-portal/AdminPortal.tsx"));
  recordRequired(content.includes(marker), name, content.includes(marker) ? "present" : `missing marker ${marker} in admin portal modules`);
}

function requireAnyMarker(file, markers, name) {
  const content = readText(file);
  const matched = markers.find((marker) => content.includes(marker));
  recordRequired(Boolean(matched), name, matched ? `present (${matched})` : `missing one of ${markers.join(", ")} in ${file}`);
}

function requireAbsent(file, pattern, name) {
  const content = readText(file);
  recordRequired(!pattern.test(content), name, pattern.test(content) ? `unexpected legacy marker in ${file}` : "clear");
}

function warnUnlessMarker(file, marker, message) {
  const ok = readText(file).includes(marker);
  results.warnings.push({ ok, name: `${file}: ${marker}`, message: ok ? "present" : message });
}

function recordRequired(ok, name, message) {
  results.required.push({ ok, name, message });
  if (!ok) results.ok = false;
}

function readText(file) {
  const target = path.join(root, file);
  return fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "";
}

function readJson(file) {
  try { return JSON.parse(readText(file)); }
  catch { recordRequired(false, file, "could not parse JSON"); return null; }
}

function readOptionalJson(file) {
  try { return JSON.parse(readText(file)); }
  catch { return null; }
}
