import type { DashboardSiteProfile } from "@/lib/dashboard-models";
import { listRegisteredPages } from "@/lib/page-registry";

const registeredPages = listRegisteredPages({ includeDynamic: false }).map((page) => ({
  id: `route:${page.path}`,
  title: page.title,
  path: page.path,
  kind: page.kind === "service" || page.kind === "location" ? page.kind : "page" as const,
  status: "published" as const,
}));

export const dashboardSiteProfile: DashboardSiteProfile = {
  name: "K9 Kleanup",
  pages: registeredPages,
  services: registeredPages.filter((page) => page.kind === "service"),
  locations: registeredPages.filter((page) => page.kind === "location"),
};
