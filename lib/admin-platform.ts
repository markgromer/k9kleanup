import { env as workerEnv } from "cloudflare:workers";

import { findRegisteredPage, isPublicPagePath, listRegisteredPages, normalizePagePath, validateNewPagePath } from "@/lib/page-registry";

const DATABASE_BINDING = "INTEGRATIONS_DB";
const MEDIA_BINDING = "REGGIE_MEDIA";
const ENCRYPTION_KEY = "ADMIN_ENCRYPTION_KEY";
const SECRET_TABLE = "admin_integration_secrets";
const SCHEMA_VERSION = 1;

type D1Result<T = Record<string, unknown>> = { results: T[]; success?: boolean };
export type AdminDatabase = {
  prepare(query: string): AdminStatement;
  batch(statements: AdminStatement[]): Promise<Array<D1Result>>;
};
type AdminStatement = {
  bind(...values: unknown[]): AdminStatement;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<unknown>;
};
type MediaObject = {
  body?: ReadableStream;
  httpEtag?: string;
  writeHttpMetadata?(headers: Headers): void;
};
export type AdminMediaBucket = {
  put(key: string, value: ArrayBuffer, options?: Record<string, unknown>): Promise<unknown>;
  get(key: string, options?: Record<string, unknown>): Promise<MediaObject | null>;
  delete(key: string): Promise<void>;
};

export type IntegrationField = {
  key: string;
  label: string;
  type: "text" | "url" | "password" | "textarea";
  secret: boolean;
  placeholder?: string;
  env?: string[];
};

export type IntegrationDefinition = {
  provider: string;
  label: string;
  category: "Analytics" | "Search" | "Advertising" | "Communications" | "Operations" | "Sales" | "Media" | "PoopSites";
  description: string;
  fields: IntegrationField[];
};

export type IntegrationConnectionState = "not-connected" | "configured" | "connected" | "attention";
export type IntegrationSyncState = {
  provider: string;
  state: "never" | "syncing" | "success" | "error";
  lastAttemptAt: string;
  lastSuccessAt: string;
  error: string;
  data?: unknown;
};

const syncedIntegrationProviders = new Set(["google-analytics", "google-search-console", "google-pagespeed", "google-business-profile"]);
export function integrationSyncSettingKey(provider: string) { return `integration-sync:${provider}`; }

export const integrationDefinitions: IntegrationDefinition[] = [
  {
    provider: "google-drive",
    label: "Google Drive media folder",
    category: "Media",
    description: "Keep an approved shared folder one click away from the Media workspace.",
    fields: [
      { key: "folderUrl", label: "Shared folder URL", type: "url", secret: false, placeholder: "https://drive.google.com/drive/folders/...", env: ["GOOGLE_DRIVE_MEDIA_FOLDER_URL"] },
    ],
  },
  {
    provider: "google-analytics",
    label: "Google Analytics 4",
    category: "Analytics",
    description: "Paste the GA4 tag to turn on website tracking. Reporting credentials are used automatically when configured.",
    fields: [
      { key: "measurementId", label: "GA4 tag", type: "text", secret: false, placeholder: "G-XXXXXXXXXX", env: ["NEXT_PUBLIC_GA_MEASUREMENT_ID", "GA_MEASUREMENT_ID"] },
      { key: "propertyId", label: "GA4 property ID", type: "text", secret: false, placeholder: "123456789", env: ["GA_PROPERTY_ID"] },
      { key: "serviceAccountJson", label: "Reporting credential", type: "textarea", secret: true, env: ["GOOGLE_ANALYTICS_SERVICE_ACCOUNT_JSON", "GOOGLE_SERVICE_ACCOUNT_JSON"] },
    ],
  },
  {
    provider: "google-search-console",
    label: "Google Search Console",
    category: "Search",
    description: "Paste the Search Console domain property. Reporting credentials are used automatically when configured.",
    fields: [
      { key: "propertyUrl", label: "sc-domain", type: "text", secret: false, placeholder: "sc-domain:example.com", env: ["GOOGLE_SEARCH_CONSOLE_PROPERTY"] },
      { key: "serviceAccountJson", label: "Reporting credential", type: "textarea", secret: true, env: ["GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT_JSON", "GOOGLE_SERVICE_ACCOUNT_JSON"] },
    ],
  },
  {
    provider: "google-tag-manager",
    label: "Google Tag Manager",
    category: "Analytics",
    description: "Container configuration for browser tags and consent-aware triggers.",
    fields: [{ key: "containerId", label: "Container ID", type: "text", secret: false, placeholder: "GTM-XXXXXXX", env: ["NEXT_PUBLIC_GTM_ID", "GTM_CONTAINER_ID"] }],
  },
  {
    provider: "cloudflare-web-analytics",
    label: "Cloudflare Web Analytics",
    category: "Analytics",
    description: "Privacy-first page traffic and Core Web Vitals collection.",
    fields: [{ key: "beaconToken", label: "Beacon token", type: "password", secret: true, env: ["CLOUDFLARE_WEB_ANALYTICS_TOKEN"] }],
  },
  {
    provider: "bing-webmaster",
    label: "Bing Webmaster Tools",
    category: "Search",
    description: "Bing search performance, crawl data, and URL submission.",
    fields: [
      { key: "siteUrl", label: "Site URL", type: "url", secret: false, env: ["BING_WEBMASTER_SITE_URL"] },
      { key: "apiKey", label: "API key", type: "password", secret: true, env: ["BING_WEBMASTER_API_KEY"] },
    ],
  },
  {
    provider: "dataforseo",
    label: "DataForSEO",
    category: "Search",
    description: "Automated keyword positions, search volume, and competitor result data.",
    fields: [
      { key: "login", label: "API login", type: "text", secret: false, env: ["DATAFORSEO_LOGIN"] },
      { key: "password", label: "API password", type: "password", secret: true, env: ["DATAFORSEO_PASSWORD"] },
    ],
  },
  {
    provider: "semrush",
    label: "Semrush",
    category: "Search",
    description: "Keyword, domain, backlink, and competitive visibility data.",
    fields: [
      { key: "database", label: "Regional database", type: "text", secret: false, placeholder: "us", env: ["SEMRUSH_DATABASE"] },
      { key: "apiKey", label: "API key", type: "password", secret: true, env: ["SEMRUSH_API_KEY"] },
    ],
  },
  {
    provider: "ahrefs",
    label: "Ahrefs",
    category: "Search",
    description: "Organic visibility and backlink intelligence.",
    fields: [
      { key: "target", label: "Domain", type: "text", secret: false, env: ["AHREFS_TARGET"] },
      { key: "apiToken", label: "API token", type: "password", secret: true, env: ["AHREFS_API_TOKEN"] },
    ],
  },
  {
    provider: "google-pagespeed",
    label: "Google PageSpeed Insights",
    category: "Search",
    description: "Lab performance, accessibility, SEO, and Core Web Vitals diagnostics.",
    fields: [{ key: "apiKey", label: "API key", type: "password", secret: true, env: ["PAGESPEED_API_KEY", "GOOGLE_PAGESPEED_API_KEY"] }],
  },
  {
    provider: "meta-pixel",
    label: "Meta Pixel & Conversions API",
    category: "Advertising",
    description: "Browser and server-side Meta campaign attribution.",
    fields: [
      { key: "pixelId", label: "Pixel ID", type: "text", secret: false, env: ["NEXT_PUBLIC_META_PIXEL_ID", "META_PIXEL_ID"] },
      { key: "conversionApiToken", label: "Conversions API token", type: "password", secret: true, env: ["META_CONVERSIONS_API_TOKEN"] },
    ],
  },
  {
    provider: "plausible",
    label: "Plausible",
    category: "Analytics",
    description: "Lightweight traffic and goal reporting.",
    fields: [
      { key: "siteId", label: "Site ID", type: "text", secret: false, env: ["PLAUSIBLE_SITE_ID"] },
      { key: "apiKey", label: "Stats API key", type: "password", secret: true, env: ["PLAUSIBLE_API_KEY"] },
    ],
  },
  {
    provider: "posthog",
    label: "PostHog",
    category: "Analytics",
    description: "Product events, funnels, session replay, and feature flags.",
    fields: [
      { key: "host", label: "Host", type: "url", secret: false, placeholder: "https://us.i.posthog.com", env: ["NEXT_PUBLIC_POSTHOG_HOST", "POSTHOG_HOST"] },
      { key: "projectApiKey", label: "Project API key", type: "password", secret: true, env: ["NEXT_PUBLIC_POSTHOG_KEY", "POSTHOG_PROJECT_API_KEY"] },
    ],
  },
  {
    provider: "google-business-profile",
    label: "Google Business Profile",
    category: "Search",
    description: "Location insights, reviews, calls, and local search activity.",
    fields: [
      { key: "accountId", label: "Account ID", type: "text", secret: false, env: ["GOOGLE_BUSINESS_ACCOUNT_ID"] },
      { key: "locationId", label: "Location ID", type: "text", secret: false, env: ["GOOGLE_BUSINESS_LOCATION_ID"] },
      { key: "clientId", label: "OAuth client ID", type: "password", secret: true, env: ["GOOGLE_BUSINESS_CLIENT_ID"] },
      { key: "clientSecret", label: "OAuth client secret", type: "password", secret: true, env: ["GOOGLE_BUSINESS_CLIENT_SECRET"] },
      { key: "refreshToken", label: "OAuth refresh token", type: "password", secret: true, env: ["GOOGLE_BUSINESS_REFRESH_TOKEN"] },
    ],
  },
  {
    provider: "openphone",
    label: "OpenPhone",
    category: "Communications",
    description: "Quote follow-up, lead nurture, and call attribution.",
    fields: [
      { key: "phoneNumberId", label: "Phone number ID", type: "text", secret: false, env: ["OPENPHONE_PHONE_NUMBER_ID"] },
      { key: "apiKey", label: "API key", type: "password", secret: true, env: ["OPENPHONE_API_KEY"] },
    ],
  },
  {
    provider: "google-ads",
    label: "Google Ads",
    category: "Advertising",
    description: "Campaign attribution and lead conversion reporting.",
    fields: [
      { key: "customerId", label: "Customer ID", type: "text", secret: false, env: ["GOOGLE_ADS_CUSTOMER_ID"] },
      { key: "developerToken", label: "Developer token", type: "password", secret: true, env: ["GOOGLE_ADS_DEVELOPER_TOKEN"] },
      { key: "refreshToken", label: "OAuth refresh token", type: "password", secret: true, env: ["GOOGLE_ADS_REFRESH_TOKEN"] },
    ],
  },
  {
    provider: "sweep-and-go",
    label: "Sweep & Go",
    category: "Operations",
    description: "Live quotes, customer onboarding, invoices, payment requests, and billing readiness from Sweep & Go.",
    fields: [
      { key: "orgSlug", label: "Account slug", type: "text", secret: false, env: ["SWEEP_AND_GO_ORG_SLUG", "SWEEP_AND_GO_ORGANIZATION", "SNG_ORG_SLUG"] },
      { key: "priceOrgSlug", label: "Pricing organization slug", type: "text", secret: false, env: ["SWEEP_AND_GO_PRICE_ORG_SLUG", "SNG_PRICE_ORG_SLUG"] },
      { key: "accountId", label: "Account ID", type: "text", secret: false, env: ["SWEEP_AND_GO_ACCOUNT_ID"] },
      { key: "baseUrl", label: "API base URL", type: "url", secret: false, placeholder: "https://openapi.sweepandgo.com", env: ["SWEEP_AND_GO_BASE_URL", "SNG_BASE_URL"] },
      { key: "stripePublishableKey", label: "Stripe publishable key", type: "text", secret: false, placeholder: "pk_live_...", env: ["SWEEP_AND_GO_STRIPE_PUBLISHABLE_KEY", "SNG_STRIPE_PUBLISHABLE_KEY"] },
      { key: "stripeAccountVerified", label: "Stripe/Sweep & Go account confirmation", type: "text", secret: false, placeholder: "confirmed", env: ["SWEEP_AND_GO_STRIPE_ACCOUNT_VERIFIED", "SNG_STRIPE_ACCOUNT_VERIFIED"] },
      { key: "organizationFormId", label: "Organization form ID", type: "text", secret: false, env: ["SWEEP_AND_GO_ORGANIZATION_FORM_ID", "SNG_FORM_ID"] },
      { key: "locationId", label: "Location ID", type: "text", secret: false, env: ["SWEEP_AND_GO_LOCATION_ID", "SNG_LOCATION_ID"] },
      { key: "apiToken", label: "API token", type: "password", secret: true, env: ["SWEEP_AND_GO_API_TOKEN", "SNG_API_TOKEN"] },
      { key: "webhookSecret", label: "Payment webhook secret", type: "password", secret: true, env: ["SWEEP_AND_GO_WEBHOOK_SECRET", "SNG_WEBHOOK_SECRET"] },
    ],
  },
  {
    provider: "jobber",
    label: "Jobber",
    category: "Operations",
    description: "Keep lead and client activity connected to Jobber.",
    fields: [
      { key: "accountId", label: "Account ID", type: "text", secret: false, env: ["JOBBER_ACCOUNT_ID"] },
      { key: "apiVersion", label: "GraphQL version", type: "text", secret: false, env: ["JOBBER_GRAPHQL_VERSION"] },
      { key: "webhookUrl", label: "Webhook URL", type: "url", secret: false, env: ["JOBBER_WEBHOOK_URL"] },
      { key: "accessToken", label: "Access token", type: "password", secret: true, env: ["JOBBER_ACCESS_TOKEN"] },
      { key: "refreshToken", label: "Refresh token", type: "password", secret: true, env: ["JOBBER_REFRESH_TOKEN"] },
    ],
  },
  {
    provider: "scoopilot",
    label: "Scoopilot",
    category: "Operations",
    description: "Send quote leads, customers, and service setup data into Scoopilot.",
    fields: [
      { key: "workspaceId", label: "Workspace ID", type: "text", secret: false, env: ["SCOOPILOT_WORKSPACE_ID"] },
      { key: "apiKey", label: "API key", type: "password", secret: true, env: ["SCOOPILOT_API_KEY"] },
      { key: "webhookUrl", label: "Webhook URL", type: "url", secret: false, env: ["SCOOPILOT_WEBHOOK_URL"] },
    ],
  },
  {
    provider: "housecall-pro",
    label: "Housecall Pro",
    category: "Operations",
    description: "Connect customer and job activity from Housecall Pro.",
    fields: [
      { key: "webhookUrl", label: "Webhook URL", type: "url", secret: false, env: ["HOUSECALL_PRO_WEBHOOK_URL"] },
      { key: "apiKey", label: "API key", type: "password", secret: true, env: ["HOUSECALL_PRO_API_KEY"] },
    ],
  },
  {
    provider: "quote-tool",
    label: "Quote Tool",
    category: "Sales",
    description: "Connect an external quote provider or webhook destination.",
    fields: [
      { key: "webhookUrl", label: "Webhook URL", type: "url", secret: false, env: ["QUOTE_TOOL_WEBHOOK_URL"] },
      { key: "apiToken", label: "API token", type: "password", secret: true, env: ["QUOTE_TOOL_API_TOKEN"] },
    ],
  },
  {
    provider: "warren",
    label: "WARREN",
    category: "PoopSites",
    description: "PoopSites analytics and search reporting through the approved WARREN Google connection.",
    fields: [
      { key: "apiUrl", label: "WARREN API URL", type: "url", secret: false, env: ["REGGIE_WARREN_API_URL"] },
      { key: "siteId", label: "Site ID", type: "text", secret: false, env: ["REGGIE_WARREN_SITE_ID"] },
      { key: "token", label: "Connection token", type: "password", secret: true, env: ["REGGIE_WARREN_TOKEN"] },
    ],
  },
  {
    provider: "gohighlevel",
    label: "GoHighLevel",
    category: "Sales",
    description: "Push quote leads, opportunities, tags, and conversion events into GHL.",
    fields: [
      { key: "locationId", label: "Location ID", type: "text", secret: false, env: ["GHL_LOCATION_ID", "GOHIGHLEVEL_LOCATION_ID"] },
      { key: "pipelineId", label: "Pipeline ID", type: "text", secret: false, env: ["GHL_PIPELINE_ID", "GOHIGHLEVEL_PIPELINE_ID"] },
      { key: "opportunityStageId", label: "Opportunity stage ID", type: "text", secret: false, env: ["GHL_OPPORTUNITY_STAGE_ID", "GOHIGHLEVEL_OPPORTUNITY_STAGE_ID"] },
      { key: "apiKey", label: "API key", type: "password", secret: true, env: ["GHL_API_KEY", "GOHIGHLEVEL_API_KEY"] },
      { key: "webhookUrl", label: "Webhook URL", type: "url", secret: false, env: ["GHL_WEBHOOK_URL", "GOHIGHLEVEL_WEBHOOK_URL"] },
    ],
  },
];

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS reggie_admin_schema (id INTEGER PRIMARY KEY CHECK (id = 1), version INTEGER NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS reggie_admin_settings (setting_key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS reggie_content_items (id TEXT PRIMARY KEY, content_type TEXT NOT NULL, slug TEXT NOT NULL, title TEXT NOT NULL, status TEXT NOT NULL, excerpt TEXT NOT NULL DEFAULT '', body TEXT NOT NULL DEFAULT '', seo_json TEXT NOT NULL DEFAULT '{}', published_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(content_type, slug))`,
  `CREATE INDEX IF NOT EXISTS idx_reggie_content_type_updated ON reggie_content_items(content_type, updated_at DESC)`,
  `CREATE TABLE IF NOT EXISTS reggie_seo_pages (path TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '', canonical_url TEXT NOT NULL DEFAULT '', index_status TEXT NOT NULL DEFAULT 'index', focus_keyword TEXT NOT NULL DEFAULT '', schema_json TEXT NOT NULL DEFAULT '', score INTEGER NOT NULL DEFAULT 0, issues_json TEXT NOT NULL DEFAULT '[]', updated_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_reggie_seo_score ON reggie_seo_pages(score, updated_at DESC)`,
  `CREATE TABLE IF NOT EXISTS reggie_rank_keywords (id TEXT PRIMARY KEY, keyword TEXT NOT NULL, location TEXT NOT NULL, device TEXT NOT NULL, target_url TEXT NOT NULL DEFAULT '', latest_position REAL, previous_position REAL, search_volume INTEGER, checked_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(keyword, location, device))`,
  `CREATE INDEX IF NOT EXISTS idx_reggie_rank_checked ON reggie_rank_keywords(checked_at DESC)`,
  `CREATE TABLE IF NOT EXISTS reggie_analytics_events (id TEXT PRIMARY KEY, event_name TEXT NOT NULL, path TEXT NOT NULL, referrer TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT '', medium TEXT NOT NULL DEFAULT '', campaign TEXT NOT NULL DEFAULT '', value REAL, metadata_json TEXT NOT NULL DEFAULT '{}', occurred_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_reggie_events_time ON reggie_analytics_events(occurred_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_reggie_events_name_time ON reggie_analytics_events(event_name, occurred_at DESC)`,
  `CREATE TABLE IF NOT EXISTS reggie_media_assets (id TEXT PRIMARY KEY, object_key TEXT NOT NULL UNIQUE, public_url TEXT NOT NULL, file_name TEXT NOT NULL, content_type TEXT NOT NULL, size INTEGER NOT NULL, alt_text TEXT NOT NULL DEFAULT '', caption TEXT NOT NULL DEFAULT '', folder TEXT NOT NULL DEFAULT 'general', tags_json TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_reggie_media_folder_created ON reggie_media_assets(folder, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS reggie_integrations (provider TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 0, config_json TEXT NOT NULL DEFAULT '{}', updated_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS ${SECRET_TABLE} (secret_key TEXT PRIMARY KEY, encrypted_value TEXT NOT NULL, updated_at TEXT NOT NULL)`,
];

export async function getAdminPlatformEnvironment() {
  try {
    return workerEnv;
  } catch {
    return process.env;
  }
}

function runtimeEnvValue(env: object, key: string) {
  return Reflect.get(env, key);
}

export async function getAdminDatabase() {
  const value = runtimeEnvValue(await getAdminPlatformEnvironment(), DATABASE_BINDING);
  return value && typeof value === "object" ? value as AdminDatabase : null;
}

export async function getAdminMediaBucket() {
  const value = runtimeEnvValue(await getAdminPlatformEnvironment(), MEDIA_BINDING);
  return value && typeof value === "object" ? value as AdminMediaBucket : null;
}

export async function getAdminPlatformStatus() {
  const env = await getAdminPlatformEnvironment();
  const database = runtimeEnvValue(env, DATABASE_BINDING);
  const media = runtimeEnvValue(env, MEDIA_BINDING);
  const encryption = text(runtimeEnvValue(env, ENCRYPTION_KEY) ?? process.env[ENCRYPTION_KEY]);
  return { database: Boolean(database && typeof database === "object"), media: Boolean(media && typeof media === "object"), encryption: Boolean(encryption), provider: "r2" as const };
}

export async function requireAdminDatabase() {
  const database = await getAdminDatabase();
  if (!database) throw new Error("Admin data storage is not ready. Bind a D1 database named INTEGRATIONS_DB.");
  await ensureAdminSchema(database);
  return database;
}

async function ensureAdminSchema(database: AdminDatabase) {
  try {
    const current = await database.prepare("SELECT version FROM reggie_admin_schema WHERE id = 1").first<{ version: number }>();
    if (Number(current?.version) >= SCHEMA_VERSION) return;
  } catch {
    // First request creates the schema below.
  }
  await database.batch(schemaStatements.map((sql) => database.prepare(sql)));
  await database.prepare(
    "INSERT INTO reggie_admin_schema (id, version, updated_at) VALUES (1, ?1, ?2) ON CONFLICT(id) DO UPDATE SET version = excluded.version, updated_at = excluded.updated_at",
  ).bind(SCHEMA_VERSION, new Date().toISOString()).run();
}

export const defaultQuoteSettings = {
  businessName: "",
  currency: "USD",
  experienceName: "Standard residential quote",
  quoteMode: "instant",
  basePrice: 0,
  includedDogs: 1,
  extraDogPrice: 0,
  oneTimePricingMode: "additional-dogs",
  oneTimeStartingPrice: 120,
  oneTimeAdditionalDogPrice: 20,
  oneTimeIncludedMinutes: 60,
  oneTimeAdditionalIntervalMinutes: 15,
  oneTimeAdditionalIntervalPrice: 20,
  oneTimeDisclaimerTemplate: "One-time prices start at {startingPrice} and include the first {includedAmount}. Additional {additionalUnit} will be billed at {additionalPrice} per {additionalInterval}.",
  minimumPrice: 0,
  depositAmount: 0,
  taxRate: 0,
  quoteExpirationDays: 14,
  leadNotificationEmail: "",
  bookingUrl: "",
  serviceAreaMode: "zip",
  serviceRadiusMiles: 25,
  allowedZipCodes: [] as string[],
  requiredFields: {
    firstName: false,
    lastName: false,
    email: false,
    phone: true,
    smsConsent: true,
    zipCode: true,
    numberOfDogs: true,
    frequency: true,
    lastCleaned: true,
    yardSize: false,
    address: false,
  },
  quoteFlow: {
    entryStep: "zip",
    introButtonText: "Get Price",
    introPlaceholder: "Your ZIP code or street address",
    loaderMessage: "Creating your personalized quote...",
    loaderMinTime: 1000,
    gateQuoteBehindContact: true,
    showPriceBeforeAddress: true,
    requireServiceAreaBeforePrice: true,
    allowCoupon: true,
    allowAddons: true,
    allowQuestions: true,
    enableYardMap: true,
    showProgress: true,
  },
  quoteDisplay: {
    style: "price-card",
    showPerVisitPrice: true,
    showMonthlyPrice: true,
    showSavingsMessage: true,
    showQuoteExpiration: true,
    primaryCta: "Get Started",
    secondaryCta: "Ask a Question",
    disclaimer: "Final pricing may change if yard conditions are different from the quote details.",
  },
  design: {
    fontFamily: "Inter, Arial, sans-serif",
    headingFontFamily: "Inter, Arial, sans-serif",
    baseFontSize: 16,
    panelBg: "#f4f7f4",
    textColor: "#13221c",
    mutedColor: "#5a685f",
    accentColor: "#0f766e",
    ctaBg: "#0f766e",
    ctaText: "#ffffff",
    inputBg: "#ffffff",
    inputBorder: "#b9c3bd",
    quoteBg: "#ffffff",
    cardBorder: "#d4dad6",
    priceColor: "#0f4c44",
    cardRadius: 16,
    inputRadius: 8,
    buttonRadius: 8,
    cardShadow: "md",
    maxWidth: 520,
    customCss: "",
  },
  conversionFlow: {
    mode: "crm-handoff",
    requireDeposit: false,
    collectAddress: true,
    collectYardMap: false,
    successMessage: "Thanks. We received your quote and will help get service started.",
    redirectUrl: "",
  },
  crm: {
    provider: "sweep-and-go",
    leadAction: "create-lead",
    conversionAction: "create-customer",
    fallbackProvider: "gohighlevel",
    syncNurture: true,
    pricingSource: "crm",
    serviceDataSource: "crm",
    fieldMap: [
      { quoteField: "firstName", crmField: "first_name", required: true },
      { quoteField: "lastName", crmField: "last_name", required: false },
      { quoteField: "email", crmField: "email", required: false },
      { quoteField: "phone", crmField: "phone", required: true },
      { quoteField: "zipCode", crmField: "zip_code", required: true },
      { quoteField: "numberOfDogs", crmField: "number_of_dogs", required: true },
      { quoteField: "frequency", crmField: "clean_up_frequency", required: true },
      { quoteField: "yardSize", crmField: "yard_sqft", required: false },
      { quoteField: "quoteTotal", crmField: "price_per_cleanup", required: false },
    ],
  },
  frequencies: [
    { id: "once_a_week", label: "Weekly", multiplier: 1, enabled: true },
    { id: "two_times_a_week", label: "Twice weekly", multiplier: 1.8, enabled: true },
    { id: "bi_weekly", label: "Every other week", multiplier: 1.25, enabled: true },
    { id: "one_time", label: "One-time cleanup", multiplier: 2.5, enabled: true },
  ],
};

export const defaultSeoSettings = {
  siteName: "",
  titleTemplate: "%s | Site Name",
  defaultDescription: "",
  canonicalOrigin: "",
  defaultOgImage: "",
  robotsMode: "index" as "index" | "noindex",
  sitemapEnabled: true,
  localBusinessSchemaJson: "",
};

export function normalizeSeoSettings(input: Record<string, unknown>) {
  const localBusinessSchemaJson = text(input.localBusinessSchemaJson).slice(0, 50000);
  if (localBusinessSchemaJson) {
    try { JSON.parse(localBusinessSchemaJson); }
    catch { throw new Error("Local business structured data must be valid JSON."); }
  }
  return {
    siteName: text(input.siteName).slice(0, 120),
    titleTemplate: text(input.titleTemplate).slice(0, 120) || "%s | Site Name",
    defaultDescription: text(input.defaultDescription).slice(0, 220),
    canonicalOrigin: safeUrl(input.canonicalOrigin).replace(/\/$/, ""),
    defaultOgImage: safeUrl(input.defaultOgImage),
    robotsMode: input.robotsMode === "noindex" ? "noindex" : "index",
    sitemapEnabled: input.sitemapEnabled !== false,
    localBusinessSchemaJson,
  };
}

export async function readAdminSetting<T>(key: string, fallback: T): Promise<T> {
  const database = await requireAdminDatabase();
  const row = await database.prepare("SELECT value_json FROM reggie_admin_settings WHERE setting_key = ?1").bind(key).first<{ value_json: string }>();
  return row?.value_json ? parseJson(row.value_json, fallback) : fallback;
}

export async function writeAdminSetting(key: string, value: unknown) {
  const database = await requireAdminDatabase();
  const updatedAt = new Date().toISOString();
  await database.prepare("INSERT INTO reggie_admin_settings (setting_key, value_json, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(setting_key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at")
    .bind(key, JSON.stringify(value), updatedAt).run();
  return updatedAt;
}

export function normalizeQuoteSettings(input: Record<string, unknown>) {
  const frequencies = Array.isArray(input.frequencies) ? input.frequencies.slice(0, 12).map((item, index) => {
    const value = object(item);
    return { id: frequencySlug(text(value.id) || `frequency-${index + 1}`), label: text(value.label).slice(0, 60), multiplier: boundedNumber(value.multiplier, 0, 100), enabled: Boolean(value.enabled) };
  }).filter((item) => item.label) : defaultQuoteSettings.frequencies;
  const requiredInput = object(input.requiredFields);
  const flowInput = object(input.quoteFlow);
  const displayInput = object(input.quoteDisplay);
  const designInput = object(input.design);
  const conversionInput = object(input.conversionFlow);
  const crmInput = object(input.crm);
  const defaultFlow = defaultQuoteSettings.quoteFlow;
  const defaultDisplay = defaultQuoteSettings.quoteDisplay;
  const defaultDesign = defaultQuoteSettings.design;
  const defaultConversion = defaultQuoteSettings.conversionFlow;
  const defaultCrm = defaultQuoteSettings.crm;
  const crmProvider = text(crmInput.provider);
  const fallbackProvider = text(crmInput.fallbackProvider);
  const fieldMap = Array.isArray(crmInput.fieldMap) ? crmInput.fieldMap.slice(0, 40).map((item) => {
    const value = object(item);
    return { quoteField: slug(text(value.quoteField)).slice(0, 80), crmField: text(value.crmField).slice(0, 120), required: Boolean(value.required) };
  }).filter((item) => item.quoteField && item.crmField) : defaultCrm.fieldMap;
  return {
    businessName: text(input.businessName).slice(0, 100),
    currency: /^[A-Z]{3}$/.test(text(input.currency)) ? text(input.currency) : "USD",
    experienceName: text(input.experienceName).slice(0, 120) || defaultQuoteSettings.experienceName,
    quoteMode: ["instant", "request", "hybrid"].includes(text(input.quoteMode)) ? text(input.quoteMode) : defaultQuoteSettings.quoteMode,
    basePrice: boundedNumber(input.basePrice, 0, 100000), includedDogs: Math.round(boundedNumber(input.includedDogs, 0, 100)),
    extraDogPrice: boundedNumber(input.extraDogPrice, 0, 100000),
    oneTimePricingMode: ["additional-dogs", "time-blocks"].includes(text(input.oneTimePricingMode)) ? text(input.oneTimePricingMode) : defaultQuoteSettings.oneTimePricingMode,
    oneTimeStartingPrice: boundedNumber(input.oneTimeStartingPrice, 0, 100000) || defaultQuoteSettings.oneTimeStartingPrice,
    oneTimeAdditionalDogPrice: boundedNumber(input.oneTimeAdditionalDogPrice, 0, 100000),
    oneTimeIncludedMinutes: Math.round(boundedNumber(input.oneTimeIncludedMinutes, 0, 1440)),
    oneTimeAdditionalIntervalMinutes: Math.round(boundedNumber(input.oneTimeAdditionalIntervalMinutes, 1, 1440)),
    oneTimeAdditionalIntervalPrice: boundedNumber(input.oneTimeAdditionalIntervalPrice, 0, 100000),
    oneTimeDisclaimerTemplate: text(input.oneTimeDisclaimerTemplate).slice(0, 500) || defaultQuoteSettings.oneTimeDisclaimerTemplate,
    minimumPrice: boundedNumber(input.minimumPrice, 0, 100000),
    depositAmount: boundedNumber(input.depositAmount, 0, 100000), taxRate: boundedNumber(input.taxRate, 0, 100),
    quoteExpirationDays: Math.round(boundedNumber(input.quoteExpirationDays, 1, 365)),
    leadNotificationEmail: text(input.leadNotificationEmail).slice(0, 200), bookingUrl: safeUrl(input.bookingUrl),
    serviceAreaMode: ["zip", "radius", "open"].includes(text(input.serviceAreaMode)) ? text(input.serviceAreaMode) : "zip",
    serviceRadiusMiles: boundedNumber(input.serviceRadiusMiles, 1, 500),
    allowedZipCodes: stringArray(input.allowedZipCodes, 100).map((item) => item.slice(0, 12)),
    requiredFields: {
      firstName: Boolean(requiredInput.firstName),
      lastName: Boolean(requiredInput.lastName),
      email: Boolean(requiredInput.email),
      phone: requiredInput.phone !== false,
      smsConsent: requiredInput.smsConsent !== false,
      zipCode: requiredInput.zipCode !== false,
      numberOfDogs: requiredInput.numberOfDogs !== false,
      frequency: requiredInput.frequency !== false,
      lastCleaned: requiredInput.lastCleaned !== false,
      yardSize: Boolean(requiredInput.yardSize),
      address: Boolean(requiredInput.address),
    },
    quoteFlow: {
      entryStep: ["zip", "address", "contact", "service"].includes(text(flowInput.entryStep)) ? text(flowInput.entryStep) : defaultFlow.entryStep,
      introButtonText: text(flowInput.introButtonText).slice(0, 40) || defaultFlow.introButtonText,
      introPlaceholder: text(flowInput.introPlaceholder).slice(0, 120) || defaultFlow.introPlaceholder,
      loaderMessage: text(flowInput.loaderMessage).slice(0, 120) || defaultFlow.loaderMessage,
      loaderMinTime: Math.round(boundedNumber(flowInput.loaderMinTime, 0, 10000)),
      gateQuoteBehindContact: flowInput.gateQuoteBehindContact !== false,
      showPriceBeforeAddress: flowInput.showPriceBeforeAddress !== false,
      requireServiceAreaBeforePrice: flowInput.requireServiceAreaBeforePrice !== false,
      allowCoupon: flowInput.allowCoupon !== false,
      allowAddons: flowInput.allowAddons !== false,
      allowQuestions: flowInput.allowQuestions !== false,
      enableYardMap: flowInput.enableYardMap !== false,
      showProgress: flowInput.showProgress !== false,
    },
    quoteDisplay: {
      style: ["price-card", "plan-comparison", "estimate-range"].includes(text(displayInput.style)) ? text(displayInput.style) : defaultDisplay.style,
      showPerVisitPrice: displayInput.showPerVisitPrice !== false,
      showMonthlyPrice: displayInput.showMonthlyPrice !== false,
      showSavingsMessage: displayInput.showSavingsMessage !== false,
      showQuoteExpiration: displayInput.showQuoteExpiration !== false,
      primaryCta: text(displayInput.primaryCta).slice(0, 40) || defaultDisplay.primaryCta,
      secondaryCta: text(displayInput.secondaryCta).slice(0, 40) || defaultDisplay.secondaryCta,
      disclaimer: text(displayInput.disclaimer).slice(0, 300) || defaultDisplay.disclaimer,
    },
    design: {
      fontFamily: text(designInput.fontFamily).slice(0, 120) || defaultDesign.fontFamily,
      headingFontFamily: text(designInput.headingFontFamily).slice(0, 120) || defaultDesign.headingFontFamily,
      baseFontSize: boundedNumber(designInput.baseFontSize, 10, 24),
      panelBg: color(designInput.panelBg, defaultDesign.panelBg),
      textColor: color(designInput.textColor, defaultDesign.textColor),
      mutedColor: color(designInput.mutedColor, defaultDesign.mutedColor),
      accentColor: color(designInput.accentColor, defaultDesign.accentColor),
      ctaBg: color(designInput.ctaBg, defaultDesign.ctaBg),
      ctaText: color(designInput.ctaText, defaultDesign.ctaText),
      inputBg: color(designInput.inputBg, defaultDesign.inputBg),
      inputBorder: color(designInput.inputBorder, defaultDesign.inputBorder),
      quoteBg: color(designInput.quoteBg, defaultDesign.quoteBg),
      cardBorder: color(designInput.cardBorder, defaultDesign.cardBorder),
      priceColor: color(designInput.priceColor, defaultDesign.priceColor),
      cardRadius: Math.round(boundedNumber(designInput.cardRadius, 0, 40)),
      inputRadius: Math.round(boundedNumber(designInput.inputRadius, 0, 40)),
      buttonRadius: Math.round(boundedNumber(designInput.buttonRadius, 0, 60)),
      cardShadow: ["none", "sm", "md", "lg"].includes(text(designInput.cardShadow)) ? text(designInput.cardShadow) : defaultDesign.cardShadow,
      maxWidth: Math.round(boundedNumber(designInput.maxWidth, 280, 1200)),
      customCss: text(designInput.customCss).slice(0, 10000),
    },
    conversionFlow: {
      mode: ["crm-handoff", "booking-link", "deposit", "request-callback"].includes(text(conversionInput.mode)) ? text(conversionInput.mode) : defaultConversion.mode,
      requireDeposit: Boolean(conversionInput.requireDeposit),
      collectAddress: conversionInput.collectAddress !== false,
      collectYardMap: Boolean(conversionInput.collectYardMap),
      successMessage: text(conversionInput.successMessage).slice(0, 240) || defaultConversion.successMessage,
      redirectUrl: safeUrl(conversionInput.redirectUrl),
    },
    crm: {
      provider: ["sweep-and-go", "jobber", "scoopilot", "gohighlevel", "housecall-pro", "quote-tool", "none"].includes(crmProvider) ? crmProvider : defaultCrm.provider,
      leadAction: ["create-lead", "create-opportunity", "webhook-only", "none"].includes(text(crmInput.leadAction)) ? text(crmInput.leadAction) : defaultCrm.leadAction,
      conversionAction: ["create-customer", "create-job", "create-booking", "webhook-only", "none"].includes(text(crmInput.conversionAction)) ? text(crmInput.conversionAction) : defaultCrm.conversionAction,
      fallbackProvider: ["", "sweep-and-go", "jobber", "scoopilot", "gohighlevel", "housecall-pro", "quote-tool", "none"].includes(fallbackProvider) ? fallbackProvider : defaultCrm.fallbackProvider,
      syncNurture: crmInput.syncNurture !== false,
      pricingSource: ["crm", "local", "matrix"].includes(text(crmInput.pricingSource)) ? text(crmInput.pricingSource) : defaultCrm.pricingSource,
      serviceDataSource: ["crm", "local"].includes(text(crmInput.serviceDataSource)) ? text(crmInput.serviceDataSource) : defaultCrm.serviceDataSource,
      fieldMap,
    },
    frequencies,
  };
}

export async function listContent(contentType?: string) {
  const database = await requireAdminDatabase();
  const allowedType = contentType === "landing-page" || contentType === "blog-post" ? contentType : "";
  const result = allowedType
    ? await database.prepare("SELECT * FROM reggie_content_items WHERE content_type = ?1 ORDER BY updated_at DESC LIMIT 250").bind(allowedType).all<ContentRow>()
    : await database.prepare("SELECT * FROM reggie_content_items ORDER BY updated_at DESC LIMIT 250").all<ContentRow>();
  return result.results.map(mapContentRow);
}

export function listPageInventory() {
  return listRegisteredPages().map((page) => ({
    ...page,
    status: page.dynamic ? "dynamic" as const : "published" as const,
    url: page.dynamic ? "" : page.path,
  }));
}

export function checkPagePath(value: unknown) { return validateNewPagePath(text(value)); }

export async function saveContent(input: Record<string, unknown>) {
  const database = await requireAdminDatabase();
  const contentType = input.type === "blog-post" ? "blog-post" : "landing-page";
  const title = text(input.title).slice(0, 180);
  const requestedLandingPath = contentType === "landing-page" ? normalizeLandingContentPath(input.path ?? input.routePath ?? input.slug ?? title) : "";
  const contentSlug = contentType === "landing-page" ? requestedLandingPath.slice(1).slice(0, 240) : slug(text(input.slug) || title);
  if (!title || !contentSlug) throw new Error("Title and slug are required.");
  if (contentType === "landing-page" && !isPublicPagePath(requestedLandingPath)) throw new Error("That landing-page path is reserved for site infrastructure.");
  const id = text(input.id) || crypto.randomUUID();
  const now = new Date().toISOString();
  const status = ["draft", "review", "scheduled", "published", "archived"].includes(text(input.status)) ? text(input.status) : "draft";
  const sourcePage = contentType === "landing-page" ? findRegisteredPage(requestedLandingPath, { matchDynamic: false }) : undefined;
  if (contentType === "landing-page" && status === "published" && !sourcePage) {
    throw new Error(`/${contentSlug} is still a content brief. Create and publish the source route before marking it published.`);
  }
  const seo = {
    focusKeyword: text(input.focusKeyword).slice(0, 120), metaTitle: text(input.metaTitle).slice(0, 80),
    metaDescription: text(input.metaDescription).slice(0, 220), canonicalUrl: safeUrl(input.canonicalUrl),
    routePath: contentType === "landing-page" ? requestedLandingPath : "",
  };
  await database.prepare(`INSERT INTO reggie_content_items (id, content_type, slug, title, status, excerpt, body, seo_json, published_at, created_at, updated_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)
    ON CONFLICT(id) DO UPDATE SET content_type=excluded.content_type, slug=excluded.slug, title=excluded.title, status=excluded.status, excerpt=excluded.excerpt, body=excluded.body, seo_json=excluded.seo_json, published_at=excluded.published_at, updated_at=excluded.updated_at`)
    .bind(id, contentType, contentSlug, title, status, text(input.excerpt).slice(0, 1000), text(input.body).slice(0, 250000), JSON.stringify(seo), status === "published" ? text(input.publishedAt) || now : null, now).run();
  return { id, slug: contentSlug, path: requestedLandingPath, status, sourceBacked: Boolean(sourcePage), updatedAt: now };
}

export async function deleteContent(id: string) {
  const database = await requireAdminDatabase();
  await database.prepare("DELETE FROM reggie_content_items WHERE id = ?1").bind(id).run();
}

export async function listSeoPages() {
  const database = await requireAdminDatabase();
  const result = await database.prepare("SELECT * FROM reggie_seo_pages ORDER BY score ASC, path ASC LIMIT 500").all<SeoRow>();
  return result.results.map(mapSeoRow);
}

export async function saveSeoPage(input: Record<string, unknown>) {
  const database = await requireAdminDatabase();
  const path = normalizePath(input.path);
  const title = text(input.title).slice(0, 80);
  const description = text(input.description).slice(0, 220);
  const canonicalUrl = safeUrl(input.canonicalUrl);
  const indexStatus = ["index", "noindex", "redirect"].includes(text(input.indexStatus)) ? text(input.indexStatus) : "index";
  const focusKeyword = text(input.focusKeyword).slice(0, 120);
  const schemaJson = text(input.schemaJson).slice(0, 50000);
  if (schemaJson) { try { JSON.parse(schemaJson); } catch { throw new Error("Structured data must be valid JSON."); } }
  const { score, issues } = scoreSeo({ path, title, description, canonicalUrl, indexStatus, focusKeyword, schemaJson });
  const updatedAt = new Date().toISOString();
  await database.prepare(`INSERT INTO reggie_seo_pages (path, title, description, canonical_url, index_status, focus_keyword, schema_json, score, issues_json, updated_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
    ON CONFLICT(path) DO UPDATE SET title=excluded.title, description=excluded.description, canonical_url=excluded.canonical_url, index_status=excluded.index_status, focus_keyword=excluded.focus_keyword, schema_json=excluded.schema_json, score=excluded.score, issues_json=excluded.issues_json, updated_at=excluded.updated_at`)
    .bind(path, title, description, canonicalUrl, indexStatus, focusKeyword, schemaJson, score, JSON.stringify(issues), updatedAt).run();
  return { path, score, issues, updatedAt };
}

export async function deleteSeoPage(path: string) {
  const database = await requireAdminDatabase();
  await database.prepare("DELETE FROM reggie_seo_pages WHERE path = ?1").bind(normalizePath(path)).run();
}

function scoreSeo(page: { path: string; title: string; description: string; canonicalUrl: string; indexStatus: string; focusKeyword: string; schemaJson: string }) {
  let score = 100; const issues: string[] = []; const keyword = page.focusKeyword.toLowerCase();
  if (!page.title) { score -= 25; issues.push("Missing SEO title"); } else if (page.title.length < 30 || page.title.length > 65) { score -= 8; issues.push("SEO title length"); }
  if (!page.description) { score -= 20; issues.push("Missing meta description"); } else if (page.description.length < 110 || page.description.length > 165) { score -= 8; issues.push("Meta description length"); }
  if (!page.canonicalUrl) { score -= 10; issues.push("Missing canonical URL"); }
  if (!page.focusKeyword) { score -= 15; issues.push("Missing focus keyword"); }
  else {
    if (!page.title.toLowerCase().includes(keyword)) { score -= 7; issues.push("Keyword absent from title"); }
    if (!page.description.toLowerCase().includes(keyword)) { score -= 5; issues.push("Keyword absent from description"); }
  }
  if (!page.schemaJson) { score -= 5; issues.push("No structured data"); }
  if (page.indexStatus !== "index") issues.push(`Page is ${page.indexStatus}`);
  return { score: Math.max(0, score), issues };
}

export async function listRankings() {
  const database = await requireAdminDatabase();
  const result = await database.prepare("SELECT * FROM reggie_rank_keywords ORDER BY keyword ASC LIMIT 1000").all<RankingRow>();
  return result.results.map(mapRankingRow);
}

export async function saveRanking(input: Record<string, unknown>) {
  const database = await requireAdminDatabase();
  const keyword = text(input.keyword).slice(0, 180);
  if (!keyword) throw new Error("Keyword is required.");
  const location = text(input.location).slice(0, 120) || "United States";
  const requestedDevice = text(input.device);
  const device = requestedDevice === "desktop" || requestedDevice === "all" ? requestedDevice : "mobile";
  const existing = await database.prepare("SELECT id, latest_position FROM reggie_rank_keywords WHERE keyword = ?1 AND location = ?2 AND device = ?3").bind(keyword, location, device).first<{ id: string; latest_position: number | null }>();
  const id = existing?.id || text(input.id) || crypto.randomUUID();
  const latest = optionalNumber(input.latestPosition, 1, 1000);
  const previous = latest === null ? existing?.latest_position ?? null : existing?.latest_position ?? optionalNumber(input.previousPosition, 1, 1000);
  const checkedAt = latest === null ? text(input.checkedAt) || null : new Date().toISOString();
  const now = new Date().toISOString();
  await database.prepare(`INSERT INTO reggie_rank_keywords (id, keyword, location, device, target_url, latest_position, previous_position, search_volume, checked_at, created_at, updated_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)
    ON CONFLICT(id) DO UPDATE SET keyword=excluded.keyword, location=excluded.location, device=excluded.device, target_url=excluded.target_url, latest_position=excluded.latest_position, previous_position=excluded.previous_position, search_volume=excluded.search_volume, checked_at=excluded.checked_at, updated_at=excluded.updated_at`)
    .bind(id, keyword, location, device, text(input.targetUrl).slice(0, 500), latest ?? existing?.latest_position ?? null, previous, optionalNumber(input.searchVolume, 0, 100000000), checkedAt, now).run();
  return { id, updatedAt: now };
}

export async function deleteRanking(id: string) {
  const database = await requireAdminDatabase();
  await database.prepare("DELETE FROM reggie_rank_keywords WHERE id = ?1").bind(id).run();
}

export async function collectAnalyticsEvent(input: Record<string, unknown>) {
  const database = await requireAdminDatabase();
  const eventName = text(input.eventName || input.event).toLowerCase();
  if (!/^[a-z][a-z0-9_-]{1,63}$/.test(eventName)) throw new Error("Invalid event name.");
  const metadata = sanitizeMetadata(input.metadata);
  const id = crypto.randomUUID(); const occurredAt = new Date().toISOString(); const eventPath = normalizePath(input.path); const eventSource = text(input.source).slice(0, 120);
  if (!isCustomerAnalyticsEvent(eventPath, eventSource)) return { id, occurredAt, ignored: true };
  await database.prepare(`INSERT INTO reggie_analytics_events (id, event_name, path, referrer, source, medium, campaign, value, metadata_json, occurred_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`)
    .bind(id, eventName, eventPath, text(input.referrer).slice(0, 1000), eventSource, text(input.medium).slice(0, 120), text(input.campaign).slice(0, 180), optionalNumber(input.value, -100000000, 100000000), JSON.stringify(metadata), occurredAt).run();
  return { id, occurredAt };
}

export async function getAnalyticsSummary(days = 30) {
  const database = await requireAdminDatabase();
  const rangeDays = Math.round(boundedNumber(days, 1, 365));
  const since = new Date(Date.now() - rangeDays * 86400000).toISOString();
  const previousSince = new Date(Date.now() - rangeDays * 2 * 86400000).toISOString();
  const conversionNames = "('quote_submitted','quote_completed','lead_created','booking_completed','purchase','conversion')";
  const [totals, previousTotals, topPages, topSources, recent] = await database.batch([
    database.prepare(`SELECT COUNT(*) AS events, COUNT(DISTINCT COALESCE(json_extract(metadata_json, '$.sessionId'), id)) AS visitors, SUM(CASE WHEN event_name IN ${conversionNames} THEN 1 ELSE 0 END) AS conversions FROM reggie_analytics_events WHERE occurred_at >= ?1 AND ${customerAnalyticsSql}`).bind(since),
    database.prepare(`SELECT COUNT(DISTINCT COALESCE(json_extract(metadata_json, '$.sessionId'), id)) AS visitors, SUM(CASE WHEN event_name IN ${conversionNames} THEN 1 ELSE 0 END) AS conversions FROM reggie_analytics_events WHERE occurred_at >= ?1 AND occurred_at < ?2 AND ${customerAnalyticsSql}`).bind(previousSince, since),
    database.prepare(`SELECT path, COUNT(*) AS count FROM reggie_analytics_events WHERE occurred_at >= ?1 AND event_name IN ('page_view','pageview') AND ${customerAnalyticsSql} GROUP BY path ORDER BY count DESC LIMIT 10`).bind(since),
    database.prepare(`SELECT CASE WHEN source = '' THEN 'Direct' ELSE source END AS source, COUNT(*) AS count FROM reggie_analytics_events WHERE occurred_at >= ?1 AND ${customerAnalyticsSql} GROUP BY source ORDER BY count DESC LIMIT 10`).bind(since),
    database.prepare(`SELECT id, event_name, path, source, occurred_at FROM reggie_analytics_events WHERE occurred_at >= ?1 AND ${customerAnalyticsSql} ORDER BY occurred_at DESC LIMIT 50`).bind(since),
  ]);
  const total = totals.results[0] as Record<string, unknown> | undefined;
  const previous = previousTotals.results[0] as Record<string, unknown> | undefined;
  return {
    rangeDays, events: Number(total?.events ?? 0), visitors: Number(total?.visitors ?? 0), conversions: Number(total?.conversions ?? 0),
    previousVisitors: Number(previous?.visitors ?? 0), previousConversions: Number(previous?.conversions ?? 0),
    topPages: topPages.results.map((row) => ({ path: text(row.path), count: Number(row.count ?? 0) })),
    topSources: topSources.results.map((row) => ({ source: text(row.source), count: Number(row.count ?? 0) })),
    recentEvents: recent.results.map((row) => ({ id: text(row.id), eventName: text(row.event_name), path: text(row.path), source: text(row.source), occurredAt: text(row.occurred_at) })),
  };
}

export async function getIntegrationStatuses() {
  const database = await requireAdminDatabase();
  const env = await getAdminPlatformEnvironment();
  const result = await database.prepare("SELECT provider, enabled, config_json, updated_at FROM reggie_integrations").all<IntegrationRow>();
  const rows = new Map(result.results.map((row) => [row.provider, row]));
  return Promise.all(integrationDefinitions.map(async (definition) => {
    const connection = await resolveIntegrationConnection(database, env, definition, rows.get(definition.provider));
    const sync = syncedIntegrationProviders.has(definition.provider) ? normalizeIntegrationSyncState(definition.provider, await readAdminSetting(integrationSyncSettingKey(definition.provider), null)) : normalizeIntegrationSyncState(definition.provider, null);
    const connectionState: IntegrationConnectionState = !connection.configured ? "not-connected" : !connection.enabled ? "attention" : definition.provider === "warren" ? "connected" : syncedIntegrationProviders.has(definition.provider) ? sync.state === "success" ? "connected" : sync.state === "error" ? "attention" : "configured" : "configured";
    const fields = definition.fields.map(({ key, label, type, secret, placeholder }) => ({ key, label, type, secret, placeholder }));
    return { provider: definition.provider, label: definition.label, category: definition.category, description: definition.description, fields, enabled: connection.enabled, configured: connection.configured, connectionState, syncState: sync.state, lastAttemptAt: sync.lastAttemptAt, lastSyncedAt: sync.lastSuccessAt, syncError: sync.error, source: connection.source, config: connection.config, maskedSecrets: connection.maskedSecrets, updatedAt: connection.updatedAt };
  }));
}

export async function getIntegrationConnection(provider: string) {
  const definition = integrationDefinitions.find((item) => item.provider === provider);
  if (!definition) throw new Error("Unknown integration provider.");
  const database = await requireAdminDatabase(); const env = await getAdminPlatformEnvironment();
  const row = await database.prepare("SELECT provider, enabled, config_json, updated_at FROM reggie_integrations WHERE provider = ?1").bind(provider).first<IntegrationRow>();
  const connection = await resolveIntegrationConnection(database, env, definition, row ?? undefined);
  return { provider, enabled: connection.enabled, configured: connection.configured, source: connection.source, values: connection.values };
}

export async function saveIntegration(provider: string, input: Record<string, unknown>) {
  const definition = integrationDefinitions.find((item) => item.provider === provider);
  if (!definition) throw new Error("Unknown integration provider.");
  const database = await requireAdminDatabase();
  const values = object(input.values); const config: Record<string, string> = {}; const secretPatch: Record<string, string> = {};
  const existing = await readEncryptedIntegrationSecret(database, provider).catch(() => null);
  const existingSecrets = existing ? parseJson<Record<string, string>>(existing.value, {}) : {};
  for (const field of definition.fields) {
    const value = text(values[field.key]).slice(0, field.type === "textarea" ? 50000 : 2000);
    if (value && field.key.toLowerCase().endsWith("json")) {
      try { JSON.parse(value); } catch { throw new Error(`${field.label} must be valid JSON.`); }
    }
    if (field.secret) { if (value) secretPatch[field.key] = value; }
    else config[field.key] = value;
  }
  if (provider === "google-drive" && config.folderUrl) {
    try {
      const folder = new URL(config.folderUrl);
      if (folder.protocol !== "https:" || folder.hostname !== "drive.google.com" || !folder.pathname.startsWith("/drive/folders/")) throw new Error();
    } catch {
      throw new Error("Google Drive media folder must be a shared https://drive.google.com/drive/folders/... URL.");
    }
  }
  const updatedAt = new Date().toISOString();
  await database.prepare("INSERT INTO reggie_integrations (provider, enabled, config_json, updated_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(provider) DO UPDATE SET enabled=excluded.enabled, config_json=excluded.config_json, updated_at=excluded.updated_at")
    .bind(provider, input.enabled ? 1 : 0, JSON.stringify(config), updatedAt).run();
  const mergedSecrets = { ...existingSecrets, ...secretPatch };
  if (provider === "openphone" && config.phoneNumberId) mergedSecrets.phoneNumberId = config.phoneNumberId;
  if (Object.values(mergedSecrets).some(Boolean)) await writeEncryptedIntegrationSecret(database, provider, JSON.stringify(mergedSecrets));
  if (syncedIntegrationProviders.has(provider)) await writeAdminSetting(integrationSyncSettingKey(provider), { provider, state: "never", lastAttemptAt: "", lastSuccessAt: "", error: "" } satisfies IntegrationSyncState);
  return updatedAt;
}

export async function deleteIntegration(provider: string) {
  const database = await requireAdminDatabase();
  await database.batch([
    database.prepare("DELETE FROM reggie_integrations WHERE provider = ?1").bind(provider),
    database.prepare(`DELETE FROM ${SECRET_TABLE} WHERE secret_key = ?1`).bind(`integration:${provider}`),
    database.prepare("DELETE FROM reggie_admin_settings WHERE setting_key = ?1").bind(integrationSyncSettingKey(provider)),
  ]);
}

async function writeEncryptedIntegrationSecret(database: AdminDatabase, provider: string, value: string) {
  const updatedAt = new Date().toISOString(); const encrypted = await encrypt(value);
  await database.prepare(`INSERT INTO ${SECRET_TABLE} (secret_key, encrypted_value, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(secret_key) DO UPDATE SET encrypted_value=excluded.encrypted_value, updated_at=excluded.updated_at`)
    .bind(`integration:${provider}`, encrypted, updatedAt).run();
}

async function readEncryptedIntegrationSecret(database: AdminDatabase, provider: string) {
  const row = await database.prepare(`SELECT encrypted_value, updated_at FROM ${SECRET_TABLE} WHERE secret_key = ?1`).bind(`integration:${provider}`).first<{ encrypted_value: string; updated_at: string }>();
  return row ? { value: await decrypt(row.encrypted_value), updatedAt: row.updated_at } : null;
}

async function resolveIntegrationConnection(database: AdminDatabase, env: object, definition: IntegrationDefinition, row?: IntegrationRow) {
  const storedSecrets = await readEncryptedIntegrationSecret(database, definition.provider).catch(() => null);
  const config = parseJson<Record<string, string>>(row?.config_json ?? "{}", {}); const maskedSecrets: Record<string, string> = {}; const secretValues = storedSecrets ? parseJson<Record<string, string>>(storedSecrets.value, {}) : {}; const values: Record<string, string> = { ...config, ...secretValues }; let environmentConfigured = false;
  for (const field of definition.fields) {
    const envValue = firstEnv(env, field.env ?? []);
    if (envValue) { environmentConfigured = true; values[field.key] = envValue; if (!field.secret) config[field.key] = envValue; else maskedSecrets[field.key] = mask(envValue); }
    else if (field.secret && secretValues[field.key]) maskedSecrets[field.key] = mask(secretValues[field.key]);
  }
  const configured = environmentConfigured || Object.values(config).some(Boolean) || Object.values(secretValues).some(Boolean);
  return { enabled: environmentConfigured || Boolean(row?.enabled), configured, source: environmentConfigured ? "environment" as const : configured ? "stored" as const : "none" as const, config, values, maskedSecrets, updatedAt: row?.updated_at ?? storedSecrets?.updatedAt ?? "" };
}

function normalizeIntegrationSyncState(provider: string, value: unknown): IntegrationSyncState {
  const record = object(value); const state = ["syncing", "success", "error"].includes(text(record.state)) ? text(record.state) as IntegrationSyncState["state"] : "never";
  return { provider, state, lastAttemptAt: text(record.lastAttemptAt), lastSuccessAt: text(record.lastSuccessAt), error: text(record.error), data: record.data };
}

async function encryptionKey() {
  const env = await getAdminPlatformEnvironment(); const secret = text(runtimeEnvValue(env, ENCRYPTION_KEY) ?? process.env[ENCRYPTION_KEY]);
  if (!secret) throw new Error("Encrypted integration storage is not ready. Set ADMIN_ENCRYPTION_KEY.");
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}
async function encrypt(value: string) { const key = await encryptionKey(); const iv = crypto.getRandomValues(new Uint8Array(12)); const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(value)); return `${base64(iv)}.${base64(new Uint8Array(cipher))}`; }
async function decrypt(value: string) { const [iv, cipher] = value.split("."); if (!iv || !cipher) throw new Error("Stored integration credentials are unreadable."); const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unbase64(iv) }, await encryptionKey(), unbase64(cipher)); return new TextDecoder().decode(plain); }

export async function listMediaAssets() {
  const database = await requireAdminDatabase();
  const result = await database.prepare("SELECT * FROM reggie_media_assets ORDER BY created_at DESC LIMIT 500").all<MediaRow>();
  return result.results.map(mapMediaRow);
}

export async function uploadMediaAsset(file: File, input: Record<string, unknown>, requestUrl: string) {
  const database = await requireAdminDatabase(); const bucket = await getAdminMediaBucket();
  if (!bucket) throw new Error("Media storage is not ready. Bind an R2 bucket named REGGIE_MEDIA.");
  if (file.size < 1 || file.size > 25 * 1024 * 1024) throw new Error("Files must be between 1 byte and 25 MB.");
  const allowed = /^(image\/(?:jpeg|png|webp|gif|avif)|video\/(?:mp4|webm)|application\/pdf)$/i;
  if (!allowed.test(file.type)) throw new Error("Use JPEG, PNG, WebP, GIF, AVIF, MP4, WebM, or PDF files.");
  const env = await getAdminPlatformEnvironment(); const site = slug(text(runtimeEnvValue(env, "REGGIE_CONNECT_SITE_ID")) || new URL(requestUrl).hostname) || "site";
  const folder = sanitizeFolder(input.folder); const id = crypto.randomUUID(); const safeName = safeFileName(file.name || "upload"); const date = new Date();
  const objectKey = `sites/${site}/media/${folder}/${date.getUTCFullYear()}/${String(date.getUTCMonth() + 1).padStart(2, "0")}/${id}-${safeName}`;
  const bytes = await file.arrayBuffer(); const digest = await crypto.subtle.digest("SHA-256", bytes);
  const generatedTags = autoTags(file.name, file.type, folder); const suppliedTags = text(input.tags).split(",").map((item) => slug(item)).filter(Boolean);
  const tags = Array.from(new Set([...suppliedTags, ...generatedTags])).slice(0, 24);
  const altText = text(input.altText).slice(0, 300) || titleFromFile(file.name).slice(0, 160);
  await bucket.put(objectKey, bytes, { httpMetadata: { contentType: file.type, cacheControl: "public, max-age=31536000, immutable" }, customMetadata: { assetId: id, folder, tags: tags.join(",").slice(0, 1500) }, sha256: digest });
  const now = new Date().toISOString(); const publicUrl = `/api/media/${id}`;
  try {
    await database.prepare(`INSERT INTO reggie_media_assets (id, object_key, public_url, file_name, content_type, size, alt_text, caption, folder, tags_json, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11)`)
      .bind(id, objectKey, publicUrl, file.name.slice(0, 240), file.type, file.size, altText, text(input.caption).slice(0, 1000), folder, JSON.stringify(tags), now).run();
  } catch (error) { await bucket.delete(objectKey); throw error; }
  return withLensMediaFields({ id, objectKey, url: publicUrl, fileName: file.name, contentType: file.type, size: file.size, altText, caption: text(input.caption), folder, tags, createdAt: now });
}

export async function updateMediaAsset(input: Record<string, unknown>) {
  const database = await requireAdminDatabase(); const id = text(input.id); if (!id) throw new Error("Asset ID is required.");
  const existing = await database.prepare("SELECT * FROM reggie_media_assets WHERE id = ?1").bind(id).first<MediaRow>(); if (!existing) throw new Error("Media asset was not found.");
  const tags = input.tags === undefined ? parseJson<string[]>(existing.tags_json, []) : stringArray(input.tags, 24).map(slug).filter(Boolean);
  const updatedAt = new Date().toISOString();
  await database.prepare("UPDATE reggie_media_assets SET alt_text=?2, caption=?3, folder=?4, tags_json=?5, updated_at=?6 WHERE id=?1")
    .bind(id, input.altText === undefined ? existing.alt_text : text(input.altText).slice(0, 300), input.caption === undefined ? existing.caption : text(input.caption).slice(0, 1000), input.folder === undefined ? existing.folder : sanitizeFolder(input.folder), JSON.stringify(tags), updatedAt).run();
  return { id, updatedAt };
}

export async function deleteMediaAsset(id: string) {
  const database = await requireAdminDatabase(); const row = await database.prepare("SELECT object_key FROM reggie_media_assets WHERE id = ?1").bind(id).first<{ object_key: string }>();
  if (!row) return; const bucket = await getAdminMediaBucket(); if (bucket) await bucket.delete(row.object_key);
  await database.prepare("DELETE FROM reggie_media_assets WHERE id = ?1").bind(id).run();
}

export async function getMediaDelivery(id: string, ifNoneMatch = "") {
  const database = await requireAdminDatabase(); const bucket = await getAdminMediaBucket(); if (!bucket) return null;
  const row = await database.prepare("SELECT object_key, file_name, content_type FROM reggie_media_assets WHERE id = ?1").bind(id).first<{ object_key: string; file_name: string; content_type: string }>();
  if (!row) return null;
  const object = await bucket.get(row.object_key, ifNoneMatch ? { onlyIf: { etagDoesNotMatch: ifNoneMatch.replaceAll('"', "") } } : undefined);
  return object ? { object, row } : null;
}

export async function getDashboardData() {
  const status = await getAdminPlatformStatus();
  if (!status.database) return { counts: {}, health: status, recentContent: [], topPages: [] };
  const database = await requireAdminDatabase(); const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const results = await database.batch([
    database.prepare("SELECT COUNT(*) AS count FROM reggie_content_items WHERE content_type='landing-page'"), database.prepare("SELECT COUNT(*) AS count FROM reggie_content_items WHERE content_type='blog-post'"),
    database.prepare("SELECT COUNT(*) AS count FROM reggie_seo_pages"), database.prepare("SELECT COUNT(*) AS count FROM reggie_rank_keywords"), database.prepare("SELECT COUNT(*) AS count FROM reggie_media_assets"),
    database.prepare(`SELECT COUNT(*) AS count FROM reggie_analytics_events WHERE occurred_at >= ?1 AND ${customerAnalyticsSql}`).bind(since), database.prepare("SELECT COUNT(*) AS count FROM reggie_integrations WHERE enabled=1"),
    database.prepare("SELECT * FROM reggie_content_items ORDER BY updated_at DESC LIMIT 8"), database.prepare(`SELECT path, COUNT(*) AS count FROM reggie_analytics_events WHERE occurred_at >= ?1 AND event_name IN ('page_view','pageview') AND ${customerAnalyticsSql} GROUP BY path ORDER BY count DESC LIMIT 8`).bind(since),
  ]);
  const count = (index: number) => Number((results[index].results[0] as Record<string, unknown> | undefined)?.count ?? 0);
  return { counts: { landingPages: listRegisteredPages({ includeDynamic: false }).length, landingBriefs: count(0), blogPosts: count(1), seoPages: count(2), trackedKeywords: count(3), mediaAssets: count(4), events30d: count(5), integrations: count(6) }, health: status, recentContent: results[7].results.map((row) => mapContentRow(row as ContentRow)), topPages: results[8].results.map((row) => ({ path: text(row.path), count: Number(row.count ?? 0) })) };
}

type ContentRow = { id: string; content_type: string; slug: string; title: string; status: string; excerpt: string; body: string; seo_json: string; published_at: string | null; updated_at: string };
type SeoRow = { path: string; title: string; description: string; canonical_url: string; index_status: string; focus_keyword: string; schema_json: string; score: number; issues_json: string; updated_at: string };
type RankingRow = { id: string; keyword: string; location: string; device: string; target_url: string; latest_position: number | null; previous_position: number | null; search_volume: number | null; checked_at: string | null };
type IntegrationRow = { provider: string; enabled: number; config_json: string; updated_at: string };
type MediaRow = { id: string; public_url: string; file_name: string; content_type: string; size: number; alt_text: string; caption: string; folder: string; tags_json: string; created_at: string };
function mapContentRow(row: ContentRow) {
  const seo = parseJson<Record<string, string>>(row.seo_json, {});
  const routePath = row.content_type === "landing-page" ? normalizeLandingContentPath(seo.routePath || row.slug) : "";
  const sourcePage = routePath ? findRegisteredPage(routePath, { matchDynamic: false }) : undefined;
  const phantomPublished = row.content_type === "landing-page" && row.status === "published" && !sourcePage;
  return {
    id: row.id, type: row.content_type, slug: row.slug, path: routePath, title: row.title,
    status: phantomPublished ? "draft" : row.status,
    requestedStatus: row.status,
    publicationState: sourcePage ? "source-backed" : "brief-only",
    publishBlocker: phantomPublished ? "No public source route exists for this record. It remains a draft brief." : "",
    sourceBacked: Boolean(sourcePage), sourceFile: sourcePage?.sourceFile ?? "",
    excerpt: row.excerpt, body: row.body, focusKeyword: seo.focusKeyword ?? "", metaTitle: seo.metaTitle ?? "",
    metaDescription: seo.metaDescription ?? "", canonicalUrl: seo.canonicalUrl ?? "", publishedAt: phantomPublished ? "" : row.published_at ?? "", updatedAt: row.updated_at,
  };
}
function mapSeoRow(row: SeoRow) { return { path: row.path, title: row.title, description: row.description, canonicalUrl: row.canonical_url, indexStatus: row.index_status, focusKeyword: row.focus_keyword, schemaJson: row.schema_json, score: Number(row.score), issues: parseJson<string[]>(row.issues_json, []), updatedAt: row.updated_at }; }
function mapRankingRow(row: RankingRow) { return { id: row.id, keyword: row.keyword, location: row.location, device: row.device, targetUrl: row.target_url, latestPosition: row.latest_position, previousPosition: row.previous_position, searchVolume: row.search_volume, checkedAt: row.checked_at ?? "" }; }
function withLensMediaFields<T extends { id: string; url: string; fileName: string }>(asset: T) {
  return { ...asset, assetId: asset.id, publicId: asset.id, secureUrl: asset.url, previewUrl: asset.url, displayName: asset.fileName.trim() || "Uploaded image" };
}
function mapMediaRow(row: MediaRow) { return withLensMediaFields({ id: row.id, url: row.public_url, fileName: row.file_name, contentType: row.content_type, size: Number(row.size), altText: row.alt_text, caption: row.caption, folder: row.folder, tags: parseJson<string[]>(row.tags_json, []), createdAt: row.created_at }); }
function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function text(value: unknown) { return typeof value === "string" ? value.trim() : value === null || value === undefined ? "" : String(value).trim(); }
function parseJson<T>(value: string, fallback: T): T { try { return JSON.parse(value) as T; } catch { return fallback; } }
function boundedNumber(value: unknown, min: number, max: number) { const number = Number(value); return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : min; }
function optionalNumber(value: unknown, min: number, max: number) { if (value === "" || value === null || value === undefined) return null; const number = Number(value); return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : null; }
function color(value: unknown, fallback: string) { const candidate = text(value); return /^#[0-9a-f]{6}$/i.test(candidate) ? candidate : fallback; }
function safeUrl(value: unknown) { const candidate = text(value); if (!candidate) return ""; try { const url = new URL(candidate); return ["http:", "https:"].includes(url.protocol) ? url.toString() : ""; } catch { return ""; } }
function normalizePath(value: unknown) { const candidate = text(value).split("?")[0].split("#")[0]; if (!candidate || candidate === "/") return "/"; return `/${candidate.replace(/^\/+|\/+$/g, "")}`.slice(0, 500); }
function normalizeLandingContentPath(value: unknown) {
  const raw = text(value);
  if (!raw) return "/";
  const segments = normalizePagePath(raw).split("/").filter(Boolean).map((segment) => slug(segment)).filter(Boolean);
  return segments.length ? `/${segments.join("/")}`.slice(0, 250) : "/";
}
const customerAnalyticsSql = "path <> '/admin' AND path NOT LIKE '/admin/%' AND path <> '/api' AND path NOT LIKE '/api/%' AND lower(source) NOT IN ('reggie-qa','reggie-lens') AND lower(source) NOT LIKE 'reggie-qa-%' AND lower(source) NOT LIKE 'reggie-lens-%'";
function isCustomerAnalyticsEvent(eventPath: string, eventSource: string) { const source = eventSource.toLowerCase(); return eventPath !== "/admin" && !eventPath.startsWith("/admin/") && eventPath !== "/api" && !eventPath.startsWith("/api/") && source !== "reggie-qa" && !source.startsWith("reggie-qa-") && source !== "reggie-lens" && !source.startsWith("reggie-lens-"); }
function slug(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100); }
function frequencySlug(value: string) {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 100);
  const aliases: Record<string, string> = {
    weekly: "once_a_week",
    once_weekly: "once_a_week",
    twice_weekly: "two_times_a_week",
    biweekly: "bi_weekly",
    every_other_week: "bi_weekly",
    one_time_cleanup: "one_time",
    one_time_clean: "one_time",
  };
  return aliases[normalized] ?? normalized;
}
function sanitizeFolder(value: unknown) { return text(value).toLowerCase().replace(/\\/g, "/").split("/").map(slug).filter(Boolean).slice(0, 5).join("/") || "general"; }
function safeFileName(value: string) { const extension = value.includes(".") ? `.${slug(value.split(".").pop() ?? "")}` : ""; const base = slug(value.replace(/\.[^.]+$/, "")) || "upload"; return `${base}${extension}`.slice(0, 180); }
function titleFromFile(value: string) { return value.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()).trim(); }
function autoTags(name: string, contentType: string, folder: string) { const stop = new Set(["and", "the", "for", "with", "img", "image", "photo", "copy", "final"]); const words = slug(name.replace(/\.[^.]+$/, "")).split("-").filter((word) => word.length > 2 && !stop.has(word)); const type = contentType.split("/")[0]; return Array.from(new Set([folder.split("/").pop() ?? "general", type, ...words])).slice(0, 12); }
function stringArray(value: unknown, max: number) { return Array.isArray(value) ? value.map(text).filter(Boolean).slice(0, max) : text(value).split(",").map((item) => item.trim()).filter(Boolean).slice(0, max); }
function sanitizeMetadata(value: unknown) { const source = object(value); const result: Record<string, string | number | boolean> = {}; for (const [key, item] of Object.entries(source).slice(0, 30)) if (/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(key) && ["string", "number", "boolean"].includes(typeof item)) result[key] = typeof item === "string" ? item.slice(0, 500) : item as number | boolean; return result; }
function firstEnv(env: object, keys: string[]) { for (const key of keys) { const value = text(runtimeEnvValue(env, key) ?? process.env[key]); if (value) return value; } return ""; }
function mask(value: string) { if (value.length < 9) return `${value.slice(0, 2)}${"*".repeat(Math.max(4, value.length - 2))}`; return `${value.slice(0, 4)}${"*".repeat(Math.min(12, value.length - 8))}${value.slice(-4)}`; }
function base64(value: Uint8Array) { let binary = ""; for (const byte of value) binary += String.fromCharCode(byte); return btoa(binary); }
function unbase64(value: string) { const binary = atob(value); return Uint8Array.from(binary, (character) => character.charCodeAt(0)); }
