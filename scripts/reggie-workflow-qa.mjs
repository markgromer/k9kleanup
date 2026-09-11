#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const checks = [];
const manifest = readJson(".reggie/manifest.json") ?? {};
const sourceRoot = manifest.sourceRoot === "" ? "" : "src";
const platform = manifest.platform === "pages" ? "pages" : "worker";
const source = (file) => `${sourceRoot ? `${sourceRoot}/` : ""}${file}`;
const connection = platform === "pages" ? "functions/_lib/reggie.ts" : source("lib/reggie-connection.ts");
const mission = platform === "pages" ? "functions/api/admin/reggie-mission.ts" : source("app/api/admin/reggie-mission/route.ts");
const auth = platform === "pages" ? "functions/_lib/reggie.ts" : source("lib/admin-auth.ts");

for (const workflow of cloudflareDeployWorkflows()) {
  checks.push({
    name: `${workflow.relative}: publishes the exact GitHub deployment commit`,
    ok: /^[ \t]*REGGIE_DEPLOY_COMMIT_SHA:[ \t]*["']?\$\{\{[ \t]*github\.sha[ \t]*\}\}["']?[ \t]*(?:#.*)?$/m.test(workflow.content),
  });
}

checkFile(connection, [
  ["uses a site-scoped connection token", /REGGIE_CONNECT_SITE_TOKEN/],
  ["keeps the Hub URL configurable", /REGGIE_CONNECT_URL/],
]);
checkFile(mission, [
  ["forwards requests to the Hub", /\/v1\/sites\//],
  ["supports mission submit", platform === "pages" ? /method === "POST"/ : /export async function POST/],
  ["supports mission refresh", platform === "pages" ? /method === "GET"/ : /export async function GET/],
  ["supports approved publish", platform === "pages" ? /method !== "PATCH"/ : /export async function PATCH/],
  ["does not contain legacy client automation", (content) => !/codex-jobs|github-secret|WARREN/i.test(content)],
]);
checkFile(source("components/reggie-mission-queue/ReggieMissionQueue.tsx"), [
  ["uses the Hub-only mission API", /\/api\/admin\/reggie-mission/],
  ["uses the cross-platform Reggie auth check", /\/api\/admin\/reggie-lens\/auth/],
  ["opens a protected Landing Page Brief", /New Landing Page/],
  ["never permits landing pages to use the homepage", /Landing pages cannot replace the homepage/],
  ["keeps publish disabled until a pull request exists", /!selectedJob\.pullRequestNumber/],
  ["does not require screenshots", (content) => !/screenshot gate|Capturing screenshots|ReggieVisualReviewGallery/i.test(content)],
]);
checkFile(auth, [
  ["uses a secret-backed owner password", /REGGIE_ADMIN_PASSWORD|ADMIN_PASSWORD/],
  ["supports optional secret-backed web-team access", /REGGIE_ADMIN_SUPER_PASSWORD|ADMIN_SUPER_PASSWORD/],
  ["does not ship built-in production passwords", (content) => !/DEFAULT_ADMIN_PASSWORD|DEFAULT_DEV_PASSWORD/gi.test(content)],
  ["accepts signed browser sessions", /ADMIN_SESSION_COOKIE|reggie_admin_session/],
  ["supports persisted password changes", platform === "pages" ? /createAdminSession/ : /changeAdminPassword/],
]);
if (platform !== "pages") {
  checkFile(source("app/api/admin/settings/route.ts"), [
    ["supports admin password changes", /export async function PATCH/],
  ]);
}
checkFile(source("components/admin-shell/AdminShell.tsx"), [
  ["keeps Reggie Lens in customer navigation", /\/admin\/reggie-lens/],
  ["keeps infrastructure routes out of customer navigation", (content) => !/reggie-queue|reggie-deploy|codex-jobs|github-secret|cloudinary/i.test(content)],
]);
checkFile(source("components/internal-support/InternalSupport.tsx"), [
  ["preserves advanced tooling in support mode", /\/admin\/reggie-queue[\s\S]*\/admin\/reggie-lens[\s\S]*\/admin\/reggie-deploy/],
  ["checks support authorization before loading tools", /\/api\/admin\/support-auth/],
]);
if (platform !== "pages") {
  checkFile(source("app/api/admin/support-auth/route.ts"), [
    ["protects support mode with staff authentication", /checkSupportAuth/],
  ]);
}

const result = { root, checks };
fs.mkdirSync(path.join(root, "tmp-reggie-workflow-qa"), { recursive: true });
fs.writeFileSync(path.join(root, "tmp-reggie-workflow-qa", "results.json"), `${JSON.stringify(result, null, 2)}\n`);
if (checks.some((entry) => !entry.ok)) {
  console.error(JSON.stringify(result, null, 2));
  process.exit(1);
}
console.log(JSON.stringify(result, null, 2));

function checkFile(relative, assertions) {
  const file = path.join(root, relative);
  const content = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  for (const [name, assertion] of assertions) {
    const ok = Boolean(content) && (assertion instanceof RegExp ? assertion.test(content) : assertion(content));
    checks.push({ name: `${relative}: ${name}`, ok });
  }
}

function readJson(relative) {
  try { return JSON.parse(fs.readFileSync(path.join(root, relative), "utf8")); }
  catch { return null; }
}

function cloudflareDeployWorkflows() {
  const workflowRoot = path.join(root, ".github", "workflows");
  if (!fs.existsSync(workflowRoot)) return [];
  return fs.readdirSync(workflowRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.ya?ml$/i.test(entry.name))
    .map((entry) => ({
      relative: `.github/workflows/${entry.name}`,
      content: fs.readFileSync(path.join(workflowRoot, entry.name), "utf8"),
    }))
    .filter(({ content }) => /(?:npm(?:\.cmd)?\s+run\s+cf:deploy|(?:npx\s+)?wrangler\s+(?:pages\s+)?deploy|opennextjs-cloudflare\s+deploy)/i.test(content)
      && /CLOUDFLARE_(?:API_TOKEN|ACCOUNT_ID)|wrangler|opennextjs-cloudflare/i.test(content));
}
