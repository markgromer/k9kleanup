"use client";



export type AdminPortalMode =
  | "dashboard"
  | "quote"
  | "analytics"
  | "seo"
  | "rankings"
  | "landing-pages"
  | "blog-posts"
  | "media"
  | "integrations";

export type JsonRecord = Record<string, unknown>;

export type QuoteRequirementKey = "firstName" | "lastName" | "email" | "phone" | "smsConsent" | "zipCode" | "numberOfDogs" | "frequency" | "lastCleaned" | "yardSize" | "address";

export type QuoteBuilderTab = "intake" | "flow" | "design" | "display" | "conversion" | "crm" | "pricing";

export type DashboardData = {
  counts: Record<string, number>;
  health: { database: boolean; media: boolean; encryption: boolean };
  recentContent: ContentItem[];
  topPages: Array<{ path: string; count: number }>;
};

export type QuoteSettings = {
  businessName: string;
  currency: string;
  experienceName: string;
  quoteMode: "instant" | "request" | "hybrid";
  basePrice: number;
  includedDogs: number;
  extraDogPrice: number;
  oneTimePricingMode: "additional-dogs" | "time-blocks";
  oneTimeStartingPrice: number;
  oneTimeAdditionalDogPrice: number;
  oneTimeIncludedMinutes: number;
  oneTimeAdditionalIntervalMinutes: number;
  oneTimeAdditionalIntervalPrice: number;
  oneTimeDisclaimerTemplate: string;
  minimumPrice: number;
  depositAmount: number;
  taxRate: number;
  quoteExpirationDays: number;
  leadNotificationEmail: string;
  bookingUrl: string;
  serviceAreaMode: "zip" | "radius" | "open";
  serviceRadiusMiles: number;
  allowedZipCodes: string[];
  requiredFields: Record<QuoteRequirementKey, boolean>;
  quoteFlow: {
    entryStep: "zip" | "address" | "contact" | "service";
    introButtonText: string;
    introPlaceholder: string;
    loaderMessage: string;
    loaderMinTime: number;
    gateQuoteBehindContact: boolean;
    showPriceBeforeAddress: boolean;
    requireServiceAreaBeforePrice: boolean;
    allowCoupon: boolean;
    allowAddons: boolean;
    allowQuestions: boolean;
    enableYardMap: boolean;
    showProgress: boolean;
  };
  quoteDisplay: {
    style: "price-card" | "plan-comparison" | "estimate-range";
    showPerVisitPrice: boolean;
    showMonthlyPrice: boolean;
    showSavingsMessage: boolean;
    showQuoteExpiration: boolean;
    primaryCta: string;
    secondaryCta: string;
    disclaimer: string;
  };
  design: {
    fontFamily: string;
    headingFontFamily: string;
    baseFontSize: number;
    panelBg: string;
    textColor: string;
    mutedColor: string;
    accentColor: string;
    ctaBg: string;
    ctaText: string;
    inputBg: string;
    inputBorder: string;
    quoteBg: string;
    cardBorder: string;
    priceColor: string;
    cardRadius: number;
    inputRadius: number;
    buttonRadius: number;
    cardShadow: "none" | "sm" | "md" | "lg";
    maxWidth: number;
    customCss: string;
  };
  conversionFlow: {
    mode: "crm-handoff" | "booking-link" | "deposit" | "request-callback";
    requireDeposit: boolean;
    collectAddress: boolean;
    collectYardMap: boolean;
    successMessage: string;
    redirectUrl: string;
  };
  crm: {
    provider: string;
    leadAction: string;
    conversionAction: string;
    fallbackProvider: string;
    syncNurture: boolean;
    pricingSource: "crm" | "local" | "matrix";
    serviceDataSource: "crm" | "local";
    fieldMap: Array<{ quoteField: string; crmField: string; required: boolean }>;
  };
  frequencies: Array<{ id: string; label: string; multiplier: number; enabled: boolean }>;
};

export type ContentItem = {
  id: string;
  type: "landing-page" | "blog-post";
  slug: string;
  path: string;
  title: string;
  status: string;
  requestedStatus: string;
  publicationState: "source-backed" | "brief-only";
  publishBlocker: string;
  sourceBacked: boolean;
  sourceFile: string;
  excerpt: string;
  body: string;
  focusKeyword: string;
  metaTitle: string;
  metaDescription: string;
  canonicalUrl: string;
  publishedAt: string;
  updatedAt: string;
};

export type PageRegistryItem = {
  path: string;
  title: string;
  kind: "page" | "service" | "location" | "blog";
  router: "app" | "pages";
  sourceFile: string;
  dynamic: boolean;
  pattern: string;
  discoveredBy: string;
  status: "published" | "dynamic";
  url: string;
};

export type SeoPage = {
  path: string;
  title: string;
  description: string;
  canonicalUrl: string;
  indexStatus: string;
  focusKeyword: string;
  schemaJson: string;
  score: number;
  issues: string[];
  updatedAt: string;
};

export type SeoSettings = {
  siteName: string;
  titleTemplate: string;
  defaultDescription: string;
  canonicalOrigin: string;
  defaultOgImage: string;
  robotsMode: "index" | "noindex";
  sitemapEnabled: boolean;
  localBusinessSchemaJson: string;
};

export type RankingKeyword = {
  id: string;
  keyword: string;
  location: string;
  device: string;
  targetUrl: string;
  latestPosition: number | null;
  previousPosition: number | null;
  searchVolume: number | null;
  checkedAt: string;
};

export type AnalyticsData = {
  rangeDays: number;
  events: number;
  conversions: number;
  visitors: number;
  topPages: Array<{ path: string; count: number }>;
  topSources: Array<{ source: string; count: number }>;
  recentEvents: Array<{ id: string; eventName: string; path: string; source: string; occurredAt: string }>;
};

export type IntegrationField = {
  key: string;
  label: string;
  type: "text" | "url" | "password" | "textarea";
  secret: boolean;
  placeholder?: string;
};

export type IntegrationStatus = {
  provider: string;
  label: string;
  category: string;
  description: string;
  enabled: boolean;
  configured: boolean;
  connectionState: "not-connected" | "configured" | "connected" | "attention";
  syncState: "never" | "syncing" | "success" | "error";
  lastAttemptAt: string;
  lastSyncedAt: string;
  syncError: string;
  source: "environment" | "stored" | "none";
  fields: IntegrationField[];
  config: Record<string, string>;
  maskedSecrets: Record<string, string>;
  updatedAt: string;
  verified?: boolean;
  verifiedAt?: string;
};

export type SweepAndGoAccess = {
  required: true;
  verified: boolean;
  configured: boolean;
  enabled: boolean;
  hasApiToken: boolean;
  accountSlug: string;
  accountName: string;
  verifiedAt: string;
  reason: string;
};

export type MediaAsset = {
  id: string;
  url: string;
  fileName: string;
  contentType: string;
  size: number;
  altText: string;
  caption: string;
  folder: string;
  tags: string[];
  createdAt: string;
};

export const emptyContent = (type: ContentItem["type"]): ContentItem => ({
  id: "",
  type,
  slug: "",
  path: "",
  title: "",
  status: "draft",
  requestedStatus: "draft",
  publicationState: "brief-only",
  publishBlocker: "",
  sourceBacked: false,
  sourceFile: "",
  excerpt: "",
  body: "",
  focusKeyword: "",
  metaTitle: "",
  metaDescription: "",
  canonicalUrl: "",
  publishedAt: "",
  updatedAt: "",
});

export const emptySeo: SeoPage = {
  path: "/",
  title: "",
  description: "",
  canonicalUrl: "",
  indexStatus: "index",
  focusKeyword: "",
  schemaJson: "",
  score: 0,
  issues: [],
  updatedAt: "",
};

export const modeTitles: Record<AdminPortalMode, { eyebrow: string; title: string }> = {
  dashboard: { eyebrow: "SITE OPERATIONS", title: "Overview" },
  quote: { eyebrow: "QUOTE TOOL", title: "Quote Tool" },
  analytics: { eyebrow: "GROWTH", title: "Analytics & Tracking" },
  seo: { eyebrow: "SEARCH", title: "SEO Inventory" },
  rankings: { eyebrow: "SEARCH", title: "Rank Tracking" },
  "landing-pages": { eyebrow: "CONTENT", title: "Landing Pages" },
  "blog-posts": { eyebrow: "CONTENT", title: "Blog Posts" },
  media: { eyebrow: "CONTENT", title: "Media Library" },
  integrations: { eyebrow: "CONNECTIONS", title: "Integrations" },
};
