#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { discoverPageRegistry, syncPageRegistry, validateRequestedPagePath } from "./reggie-page-registry.mjs";

const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "reggie-page-registry-"));
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const installedClientRoot = path.resolve(scriptDirectory, "..");

try {
  write("app/page.tsx", 'export const metadata = { title: "Fixture Home" }; export default function Page() { return null; }\n');
  write("app/about/page.tsx", 'export const metadata = { title: "About Our Team" }; export default function Page() { return null; }\n');
  write("app/(marketing)/offers/page.tsx", "export default function Page() { return null; }\n");
  write("app/services/dog-waste/page.tsx", "export default function Page() { return null; }\n");
  write("app/locations/[locationSlug]/page.tsx", "export default function Page() { return null; }\n");
  write("app/campaigns/[campaignSlug]/page.tsx", `const validCampaigns = ["summer", "referral"] as const;
export function generateStaticParams() { return validCampaigns.map(campaignSlug => ({ campaignSlug })); }
export default function Page() { return null; }\n`);
  write("app/areas/[areaSlug]/page.tsx", `const areas = [
  { areaSlug: "chandler", label: "Chandler display label", details: { title: "Never a route" } },
  { areaSlug: "gilbert", label: "Gilbert display label", description: "Braces in strings { do not end parsing }" },
] as const;
export function generateStaticParams() { return areas.map(({ areaSlug }) => ({ areaSlug })); }
export default function Page() { return null; }\n`);
  write("app/cities/[citySlug]/page.tsx", `export function generateStaticParams() {
  return [{ citySlug: "mesa" }, { citySlug: "tempe" }];
}
export default function Page() { return null; }\n`);
  write("app/regions/[regionSlug]/page.tsx", `export const generateStaticParams = () => {
  return [{ regionSlug: "north" }, { regionSlug: "south" }];
};
export default function Page() { return null; }\n`);
  write("app/offers/[offerSlug]/page.tsx", `const offers = [{ offerSlug: makeSlug("not-a-static-route"), label: "Phantom offer label" }];
export function generateStaticParams() { return offers.map((offer) => ({ offerSlug: offer.offerSlug })); }
export default function Page() { return null; }\n`);
  write("app/[slug]/page.tsx", "export default function Page() { return null; }\n");
  write("app/_private/internal/page.tsx", "export default function Page() { return null; }\n");
  write("app/admin/secret/page.tsx", "export default function Page() { return null; }\n");
  write("app/@modal/(.)preview/page.tsx", "export default function Page() { return null; }\n");
  write("pages/contact.tsx", "export default function Page() { return null; }\n");
  write("pages/api/private.ts", "export default function handler() {}\n");
  write("pages/404.tsx", "export default function Page() { return null; }\n");
  write("app/sitemap.ts", 'const routes = ["/", "/locations/tempe"]; export default function sitemap() { return routes; }\n');
  write("lib/dashboard-site-profile.ts", `export const dashboardSiteProfile = { pages: [
    { title: "Mesa service area", path: "/locations/mesa", kind: "location" },
    { title: "Fabricated pricing", path: "/pricing", kind: "page" },
  ] };\n`);
  write("generated/reggie-page-registry.ts", `// REGGIE_PAGE_REGISTRY_JSON_START
// [{"path":"/locations/phoenix","title":"Phoenix","kind":"location","router":"app","sourceFile":"app/locations/[locationSlug]/page.tsx","dynamic":false,"pattern":"/locations/[locationSlug]","discoveredBy":"mission"}]
// REGGIE_PAGE_REGISTRY_JSON_END
export const reggiePageRegistry = [] as const;\n`);
  write("functions/_lib/admin-platform.ts", "// Pages adapter fixture\n");

  const entries = discoverPageRegistry(fixture);
  const paths = entries.map((entry) => entry.path);
  for (const expected of ["/", "/about", "/offers", "/pricing", "/services/dog-waste", "/[slug]", "/campaigns/[campaignSlug]", "/campaigns/summer", "/campaigns/referral", "/areas/[areaSlug]", "/areas/chandler", "/areas/gilbert", "/cities/[citySlug]", "/cities/mesa", "/cities/tempe", "/regions/[regionSlug]", "/regions/north", "/regions/south", "/offers/[offerSlug]", "/locations/[locationSlug]", "/locations/mesa", "/locations/phoenix", "/locations/tempe", "/contact"]) {
    assert(paths.includes(expected), `expected ${expected} in ${paths.join(", ")}`);
  }
  for (const excluded of ["/admin/secret", "/api/private", "/404", "/preview", "/_private/internal", "/areas/Chandler display label", "/areas/Never a route", "/offers/not-a-static-route", "/offers/Phantom offer label"]) assert(!paths.includes(excluded), `did not expect ${excluded}`);
  assert.equal(entries.find((entry) => entry.path === "/")?.title, "Fixture Home");
  assert.equal(entries.find((entry) => entry.path === "/services/dog-waste")?.kind, "service");
  assert.equal(entries.find((entry) => entry.path === "/services/dog-waste")?.id, "page:/services/dog-waste");
  assert.equal(entries.find((entry) => entry.path === "/services/dog-waste")?.ownership, "source");
  assert.equal(entries.find((entry) => entry.path === "/services/dog-waste")?.authority, "site-git");
  assert.equal(entries.find((entry) => entry.path === "/locations/mesa")?.kind, "location");
  assert.equal(entries.find((entry) => entry.path === "/locations/phoenix")?.ownership, "hybrid", "mission-adopted pages participate as hybrid graph nodes");
  assert.equal(entries.find((entry) => entry.path === "/locations/[locationSlug]")?.dynamic, true);

  assert.equal(validateRequestedPagePath(fixture, "/admin/campaign").ok, false);
  assert.equal(validateRequestedPagePath(fixture, "/about").ok, false);
  assert.equal(validateRequestedPagePath(fixture, "/campaigns/summer").ok, false, "known generateStaticParams routes must conflict");
  assert.equal(validateRequestedPagePath(fixture, "/cities/tempe").ok, false, "all objects in a direct finite params array must conflict");
  assert.equal(validateRequestedPagePath(fixture, "/campaigns/winter").ok, true, "unknown values under a finite dynamic route must remain available");
  assert.equal(validateRequestedPagePath(fixture, "/locations/scottsdale").ok, true, "a generic dynamic handler must not reserve every possible path");
  assert.equal(validateRequestedPagePath(fixture, "/brand-new-root-slug").ok, true, "a root catch-all must not block new concrete landing pages");
  assert.equal(validateRequestedPagePath(fixture, "/spring-cleanup").ok, true);
  for (const unsafe of ["campaigns/no-leading-slash", "/campaigns/[campaignSlug]", "/safe/%2Fadmin", "/safe/%5cadmin", "/safe/../admin", "/safe/%2e%2e/admin", "/safe/%ZZ/admin"]) {
    assert.equal(validateRequestedPagePath(fixture, unsafe).ok, false, `expected unsafe route ${unsafe} to be rejected`);
  }

  const first = syncPageRegistry(fixture, { expectPath: "/about" });
  assert.equal(first.changed, true);
  assert.match(fs.readFileSync(first.target, "utf8"), /reggiePageRegistryFingerprint/);
  assert.match(fs.readFileSync(path.join(fixture, "functions", "_generated", "reggie-page-registry.ts"), "utf8"), /\/campaigns\/summer/);
  const second = syncPageRegistry(fixture, { expectPath: "/about" });
  assert.equal(second.changed, false, "unchanged source routes should not create generated-file churn");
  assert.throws(() => syncPageRegistry(fixture, { expectPath: "/locations/scottsdale" }), /only covered by dynamic route/);

  const adminPlatform = fs.readFileSync(path.resolve(scriptDirectory, "../lib/admin-platform.ts"), "utf8");
  assert.match(adminPlatform, /status === "published" && !sourcePage/);
  assert.match(adminPlatform, /still a content brief/);
  assert.match(adminPlatform, /publicationState: sourcePage \? "source-backed" : "brief-only"/);

  const pagesAdminPlatformPath = [
    path.resolve(scriptDirectory, "../../pages-functions/functions/_lib/admin-platform.ts"),
    path.resolve(installedClientRoot, "functions/_lib/admin-platform.ts"),
  ].find((candidate) => fs.existsSync(candidate));
  const installedClient = fs.existsSync(path.join(installedClientRoot, ".reggie", "manifest.json"));
  assert(pagesAdminPlatformPath || installedClient, "Could not locate the Pages adapter contract from the source tree.");
  if (pagesAdminPlatformPath) {
    const pagesAdminPlatform = fs.readFileSync(pagesAdminPlatformPath, "utf8");
    const pagesPathCheck = pagesAdminPlatform.match(/function checkPagePath\([^\n]+/)?.[0] ?? "";
    assert.match(pagesPathCheck, /requestedPagePath\(raw\)/, "Pages must validate the unslugified requested path");
    assert.doesNotMatch(pagesPathCheck, /landingPath\(raw\)/, "Pages must not slugify before validating a requested route");
    assert.match(pagesPathCheck, /%2f\|%5c/i, "Pages must reject encoded separators");
    assert.match(pagesPathCheck, /unsafeRequestedPageSegment/, "Pages must reject traversal, invalid encoding, and oversized segments");
  }

  console.log("Reggie page registry QA passed: source discovery, adoption, collision protection, deterministic sync, and publication safeguards.");
} finally {
  fs.rmSync(fixture, { recursive: true, force: true });
}

function write(relativePath, source) {
  const target = path.join(fixture, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, source);
}
