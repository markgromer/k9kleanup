import { reggiePageRegistry, reggiePageRegistryFingerprint } from "@/generated/reggie-page-registry";

export type ReggiePageKind = "page" | "service" | "location" | "blog";
export type ReggieRouterKind = "app" | "pages";
export type ReggiePageDiscovery = "source" | "sitemap" | "legacy-profile" | "registry" | "mission";
export type ReggiePageOwnership = "structured" | "source" | "hybrid" | "generated";

export type ReggiePageRegistryEntry = {
  id: string;
  path: string;
  title: string;
  kind: ReggiePageKind;
  router: ReggieRouterKind;
  sourceFile: string;
  dynamic: boolean;
  pattern: string;
  discoveredBy: ReggiePageDiscovery;
  ownership: ReggiePageOwnership;
  authority: "site-git";
};

export type PagePathValidation = {
  ok: boolean;
  path: string;
  reason: string;
  conflict?: ReggiePageRegistryEntry;
};

export const reservedPagePrefixes = ["/admin", "/api", "/_next", "/.well-known"] as const;
export const reservedPageFiles = ["/favicon.ico", "/robots.txt", "/sitemap.xml"] as const;

const registry = (reggiePageRegistry as readonly ReggiePageRegistryEntry[])
  .map((entry) => {
    const path = normalizePagePath(entry.path);
    return {
      ...entry,
      id: entry.id || `page:${path.toLowerCase()}`,
      path,
      pattern: normalizePagePath(entry.pattern || entry.path),
      ownership: entry.ownership || (entry.discoveredBy === "source" ? "source" : "hybrid"),
      authority: "site-git" as const,
    };
  })
  .filter((entry) => isPublicPagePath(entry.path))
  .sort(comparePages);

export { reggiePageRegistryFingerprint };

export function listRegisteredPages(options: { includeDynamic?: boolean } = {}) {
  return registry.filter((entry) => options.includeDynamic !== false || !entry.dynamic).map((entry) => ({ ...entry }));
}

export function findRegisteredPage(value: string, options: { matchDynamic?: boolean } = {}) {
  const pagePath = normalizePagePath(value);
  const exact = registry.find((entry) => entry.path === pagePath);
  if (exact || options.matchDynamic === false) return exact ? { ...exact } : undefined;
  const pattern = registry.find((entry) => entry.dynamic && routePatternMatches(entry.path, pagePath));
  return pattern ? { ...pattern } : undefined;
}

export function validateNewPagePath(value: string): PagePathValidation {
  const raw = String(value ?? "").trim();
  const pagePath = normalizePagePath(raw);
  if (!raw || !raw.startsWith("/")) return { ok: false, path: pagePath, reason: "Page paths must start with /." };
  if (raw.includes("?") || raw.includes("#") || raw.includes("\\")) return { ok: false, path: pagePath, reason: "Page paths cannot include a query, fragment, or backslash." };
  if (["[", "]", "(", ")", "@", "*"].some((character) => pagePath.includes(character)) || /%2f|%5c/i.test(pagePath)) return { ok: false, path: pagePath, reason: "Use a concrete public path without route syntax or encoded slashes." };
  if (pagePath.split("/").some(unsafeRequestedPageSegment)) return { ok: false, path: pagePath, reason: "The page path contains an unsafe, encoded, or overly long segment." };
  if (!isPublicPagePath(pagePath)) return { ok: false, path: pagePath, reason: "That path is reserved for site infrastructure." };
  const conflict = findRegisteredPage(pagePath, { matchDynamic: false });
  if (conflict) return { ok: false, path: pagePath, reason: "A public page already exists at this path.", conflict };
  return { ok: true, path: pagePath, reason: "This path is available." };
}

export function normalizePagePath(value: string) {
  let candidate = String(value ?? "").trim();
  try { if (/^https?:\/\//i.test(candidate)) candidate = new URL(candidate).pathname; } catch { /* Preserve the original value for normalization. */ }
  candidate = candidate.split("?")[0].split("#")[0].replace(/\\/g, "/").replace(/\/{2,}/g, "/");
  if (!candidate || candidate === "/") return "/";
  return `/${candidate.replace(/^\/+|\/+$/g, "")}`;
}

export function isPublicPagePath(value: string) {
  const pagePath = normalizePagePath(value).toLowerCase();
  if (reservedPagePrefixes.some((prefix) => pagePath === prefix || pagePath.startsWith(`${prefix}/`))) return false;
  return !reservedPageFiles.includes(pagePath as typeof reservedPageFiles[number]);
}

export function routePatternMatches(patternValue: string, pathValue: string) {
  const pattern = normalizePagePath(patternValue);
  const pagePath = normalizePagePath(pathValue);
  if (!pattern.includes("[")) return pattern === pagePath;
  const segments = pattern.split("/").slice(1);
  let expression = "^";
  for (const segment of segments) {
    if (/^\[\[\.\.\.[A-Za-z0-9_]+\]\]$/.test(segment)) expression += "(?:/[^/?#]+(?:/[^/?#]+)*)?";
    else if (/^\[\.\.\.[A-Za-z0-9_]+\]$/.test(segment)) expression += "/[^/?#]+(?:/[^/?#]+)*";
    else if (/^\[[A-Za-z0-9_]+\]$/.test(segment)) expression += "/[^/?#]+";
    else expression += `/${escapeRegExp(segment)}`;
  }
  return new RegExp(`${expression}/?$`).test(pagePath);
}

function comparePages(left: ReggiePageRegistryEntry, right: ReggiePageRegistryEntry) {
  if (left.path === "/") return -1;
  if (right.path === "/") return 1;
  return left.path.localeCompare(right.path);
}

function unsafeRequestedPageSegment(segment: string) {
  if (segment.length > 100) return true;
  let decoded = "";
  try { decoded = decodeURIComponent(segment); } catch { return true; }
  const containsControl = [...decoded].some((character) => character.charCodeAt(0) <= 31);
  return decoded === "." || decoded === ".." || containsControl || ["\\", "/", "?", "#", "[", "]", "(", ")", "@", "*"].some((character) => decoded.includes(character));
}

function escapeRegExp(value: string) { return [...value].map((character) => "\\^$.*+?()[]{}|".includes(character) ? `\\${character}` : character).join(""); }
