export type CustomerStatus = "requested" | "working" | "ready" | "publishing" | "published" | "attention";

export type DashboardMetric = {
  id: "leads" | "visitors" | "conversion" | "health";
  label: string;
  value: string;
  change?: number | null;
  detail: string;
  available: boolean;
};

export type DashboardRecommendation = {
  id: string;
  title: string;
  reason: string;
  actionLabel: string;
  href: string;
  priority: "high" | "medium" | "low";
  category: "website" | "seo" | "content" | "integration";
};

export type DashboardActivity = {
  id: string;
  title: string;
  detail: string;
  occurredAt: string;
  status: CustomerStatus;
};

export type DashboardSitePage = {
  id: string;
  title: string;
  path: string;
  kind: "page" | "service" | "location";
  status: "published" | "draft" | "opportunity";
  seoScore?: number | null;
  updatedAt?: string;
  lastReggieChange?: string;
};

export type DashboardIntegration = {
  provider: string;
  label: string;
  category: string;
  description: string;
  state: "connected" | "attention" | "not-connected";
  href: string;
};

export type DashboardSiteProfile = {
  name: string;
  pages: DashboardSitePage[];
  services: DashboardSitePage[];
  locations: DashboardSitePage[];
};

export type DashboardMission = {
  id: string;
  title?: string;
  summary?: string;
  prompt?: string;
  reviewDescription?: string;
  targetPath?: string;
  status?: string;
  deployStatus?: string;
  pullRequestNumber?: number | null;
  pullRequestUrl?: string;
  pullRequestMerged?: boolean;
  branchName?: string;
  liveUrl?: string;
  failureReason?: string;
  workflowRunUrl?: string;
  createdAt?: string;
  updatedAt?: string;
  attemptNumber?: number;
  maxAttempts?: number;
  queue?: { state: "waiting" | "dispatching" | "running" | "complete"; position: number | null; total: number };
  dispatchStatus?: string;
  dispatchAttempts?: number;
  clientChecksStatus?: string;
  clientChecksRunUrl?: string;
  evidenceStatus?: "pending" | "available" | "partial" | "unavailable";
  evidenceError?: string;
  reviewScreenshots?: Array<{ name: string; url: string; path?: string; kind?: "before" | "after" | "diff"; viewport?: string }>;
};

export type DashboardApiData = {
  reggieSetup?: {
    complete: boolean;
    database: boolean;
    media: boolean;
    encryption: boolean;
    connection: boolean;
    authentication: boolean;
    issues: string[];
  };
  dashboard?: {
    counts?: Record<string, number>;
    health?: { database?: boolean; media?: boolean; encryption?: boolean };
    recentContent?: Array<{ id: string; title: string; status: string; updatedAt: string; slug: string; type: string }>;
    topPages?: Array<{ path: string; count: number }>;
  };
  analytics?: {
    rangeDays?: number;
    events?: number;
    conversions?: number;
    visitors?: number;
    quoteStarts?: number;
    previousConversions?: number;
    previousVisitors?: number;
    dataSource?: "first-party" | "google-analytics" | "warren";
    sessions?: number;
    newUsers?: number;
    engagedSessions?: number;
    engagementRate?: number;
    averageSessionDuration?: number;
    screenPageViews?: number;
    googleConversions?: number;
    devices?: Array<{ device: string; sessions: number; activeUsers: number; conversions: number }>;
    locations?: Array<{ location: string; sessions: number; activeUsers: number; conversions: number }>;
    daily?: Array<Record<string, string | number>>;
    market?: {
      competitors: Array<{ name: string; website: string; positioning: string; offers: string[] }>;
      opportunities: Array<{ id: string; type: string; priority: string; title: string; reason: string; action: string; source: string }>;
    };
    lastSyncedAt?: string | null;
    warnings?: string[];
    googleAnalytics?: { state: "never" | "syncing" | "success" | "error"; lastSyncedAt: string; error: string };
    topPages?: Array<{ path: string; count: number }>;
    topSources?: Array<{ source: string; count: number }>;
    recentEvents?: Array<{ id: string; eventName: string; path: string; source: string; occurredAt: string }>;
  };
  seo?: {
    pages?: Array<{ path: string; title: string; score: number; issues: string[]; updatedAt: string }>;
    searchConsole?: {
      state: "never" | "syncing" | "success" | "error";
      lastSyncedAt: string;
      error: string;
      data?: {
        propertyUrl: string;
        permissionLevel: string;
        serviceAccountEmail: string;
        rangeDays: number;
        startDate: string;
        endDate: string;
        clicks: number;
        impressions: number;
        ctr: number;
        position: number;
        previousClicks: number;
        previousImpressions: number;
        topQueries: Array<{ query: string; clicks: number; impressions: number; ctr: number; position: number; previousPosition: number | null }>;
        topPages: Array<{ path: string; clicks: number; impressions: number; ctr: number; position: number }>;
      };
    };
  };
  rankings?: {
    keywords?: Array<{ id: string; keyword: string; location: string; targetUrl: string; latestPosition: number | null; previousPosition: number | null; checkedAt: string }>;
  };
  siteHealth?: {
    state: "never" | "syncing" | "success" | "error";
    lastSuccessAt: string;
    error: string;
    data?: {
      siteUrl: string;
      checkedAt: string;
      homepage: { ok: boolean; status: number; responseMs: number; detail: string };
      ssl: { ok: boolean; detail: string };
      sitemap: { ok: boolean; status: number; responseMs: number; detail: string };
      robots: { ok: boolean; status: number; responseMs: number; detail: string; allowsCrawling: boolean };
      quoteEndpoint: { ok: boolean; status: number; responseMs: number; detail: string };
    };
    pageSpeed?: {
      state: "never" | "syncing" | "success" | "error";
      lastSyncedAt: string;
      error: string;
      data?: {
        siteUrl: string;
        strategy: "mobile";
        fetchedAt: string;
        scores: { performance: number | null; accessibility: number | null; bestPractices: number | null; seo: number | null };
        metrics: Array<{ id: string; label: string; value: number; displayValue: string }>;
        opportunities: Array<{ id: string; title: string; displayValue: string; savingsMs: number }>;
      };
    };
  };
  integrations?: {
    integrations?: Array<{
      provider: string;
      label: string;
      category: string;
      description: string;
      enabled: boolean;
      configured: boolean;
      connectionState?: "not-connected" | "configured" | "connected" | "attention";
      syncState?: "never" | "syncing" | "success" | "error";
      lastSyncedAt?: string;
      syncError?: string;
      updatedAt: string;
      fields?: Array<{ key: string; label: string; type: "text" | "url" | "password" | "textarea"; secret: boolean; placeholder?: string }>;
      config?: Record<string, string>;
      maskedSecrets?: Record<string, string>;
    }>;
  };
  missions?: DashboardMission[];
};

export type SiteHealthCheck = {
  id: string;
  label: string;
  detail: string;
  state: "healthy" | "attention" | "unknown";
};
