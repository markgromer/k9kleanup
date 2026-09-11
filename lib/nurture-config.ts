import {
  getAdminIntegrationSecretStorageStatus,
  readStoredAdminIntegrationSecret,
  saveStoredAdminIntegrationSecret,
} from "@/lib/cloudinary-config";

export const NURTURE_CONFIG_STORAGE_KEY = "quote-nurture-openphone";

export type NurtureDripStep = {
  id: string;
  delayHours: number;
  message: string;
};

export type NurtureEntrySources = {
  quoteDisplayed: boolean;
  externalWebhook: boolean;
};

export type NurtureExclusions = {
  excludeExistingCustomers: boolean;
  excludedSources: string[];
  excludedZipCodes: string[];
  excludedFrequencies: string[];
  minimumQuoteTotal: number | null;
  maximumQuoteTotal: number | null;
  cooldownDays: number;
};

export type NurtureStopRules = {
  signup: boolean;
  booking: boolean;
  payment: boolean;
  customerCreated: boolean;
  inboundReply: true;
  optOut: true;
};

export type NurtureConfig = {
  openPhoneApiKey: string;
  openPhonePhoneNumberId: string;
  openPhoneWebhookSecret: string;
  enabled: boolean;
  entrySources: NurtureEntrySources;
  /** Retained so existing stored configurations continue to load. */
  quoteTrigger: "quote_created" | "quote_sent";
  businessName: string;
  timezone: string;
  quietHoursStart: string;
  quietHoursEnd: string;
  exclusions: NurtureExclusions;
  stopRules: NurtureStopRules;
  steps: NurtureDripStep[];
};

export type NurtureConfigStatus = {
  configured: boolean;
  enabled: boolean;
  source: "env" | "stored" | "none";
  openPhoneApiKeyMasked: string;
  openPhonePhoneNumberId: string;
  openPhoneWebhookSecretMasked: string;
  entrySources: NurtureEntrySources;
  businessName: string;
  timezone: string;
  quietHoursStart: string;
  quietHoursEnd: string;
  exclusions: NurtureExclusions;
  stopRules: NurtureStopRules;
  steps: NurtureDripStep[];
  bindingReady: boolean;
  encryptionReady: boolean;
  storageReady: boolean;
  eventTokenReady: boolean;
  usesEnvOverride: boolean;
  lastUpdatedAt?: string;
};

type StoredNurtureConfig = {
  config: NurtureConfig;
  updatedAt: string;
};

export const defaultNurtureSteps: NurtureDripStep[] = [
  {
    id: "day-0",
    delayHours: 2,
    message: "Hi {{firstName}}, this is {{businessName}}. Just checking that you received your quote. Any questions I can answer? Reply STOP to opt out.",
  },
  {
    id: "day-2",
    delayHours: 48,
    message: "Hi {{firstName}}, wanted to follow up on your quote. We can still get you on the schedule if you would like to move ahead. Reply STOP to opt out.",
  },
  {
    id: "day-5",
    delayHours: 120,
    message: "Hi {{firstName}}, should I keep your quote open or close it out for now? Reply STOP to opt out.",
  },
];

export const defaultNurtureExclusions: NurtureExclusions = {
  excludeExistingCustomers: true,
  excludedSources: [],
  excludedZipCodes: [],
  excludedFrequencies: [],
  minimumQuoteTotal: null,
  maximumQuoteTotal: null,
  cooldownDays: 30,
};

export const defaultNurtureStopRules: NurtureStopRules = {
  signup: true,
  booking: true,
  payment: true,
  customerCreated: true,
  inboundReply: true,
  optOut: true,
};

function normalizeText(value: string | undefined | null) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeTime(value: string | undefined | null, fallback: string) {
  const normalized = normalizeText(value);
  return /^\d{2}:\d{2}$/.test(normalized) ? normalized : fallback;
}

function normalizeList(value: unknown, limit = 50) {
  const entries = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[\n,]/)
      : [];
  return Array.from(new Set(entries.map((entry) => normalizeText(typeof entry === "string" ? entry : "").toLowerCase()).filter(Boolean)))
    .slice(0, limit)
    .map((entry) => entry.slice(0, 120));
}

function normalizeNullableNumber(value: unknown, min: number, max: number) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : null;
}

function normalizeTimezone(value: string | undefined | null) {
  const timezone = normalizeText(value) || "America/Phoenix";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
    return timezone;
  } catch {
    return "America/Phoenix";
  }
}

function normalizeExclusions(value: unknown): NurtureExclusions {
  const input = value && typeof value === "object" ? value as Partial<NurtureExclusions> : {};
  return {
    excludeExistingCustomers: input.excludeExistingCustomers !== false,
    excludedSources: normalizeList(input.excludedSources),
    excludedZipCodes: normalizeList(input.excludedZipCodes).map((entry) => entry.replace(/\D/g, "").slice(0, 10)).filter(Boolean),
    excludedFrequencies: normalizeList(input.excludedFrequencies),
    minimumQuoteTotal: normalizeNullableNumber(input.minimumQuoteTotal, 0, 1_000_000),
    maximumQuoteTotal: normalizeNullableNumber(input.maximumQuoteTotal, 0, 1_000_000),
    cooldownDays: Math.round(normalizeNullableNumber(input.cooldownDays, 0, 3650) ?? defaultNurtureExclusions.cooldownDays),
  };
}

function normalizeStopRules(value: unknown): NurtureStopRules {
  const input = value && typeof value === "object" ? value as Partial<NurtureStopRules> : {};
  return {
    signup: input.signup !== false,
    booking: input.booking !== false,
    payment: input.payment !== false,
    customerCreated: input.customerCreated !== false,
    inboundReply: true,
    optOut: true,
  };
}

function maskValue(value: string) {
  if (!value) return "";
  if (value.length <= 10) return `${value.slice(0, 3)}${"*".repeat(Math.max(4, value.length - 3))}`;
  return `${value.slice(0, 4)}${"*".repeat(Math.max(4, value.length - 8))}${value.slice(-4)}`;
}

export function normalizeNurtureSteps(value: unknown): NurtureDripStep[] {
  if (!Array.isArray(value)) return defaultNurtureSteps;

  const steps = value
    .slice(0, 6)
    .map((entry, index) => {
      if (!entry || typeof entry !== "object") return null;
      const record = entry as Record<string, unknown>;
      const delayHours = Number(record.delayHours);
      const message = normalizeText(typeof record.message === "string" ? record.message : "");
      if (!Number.isFinite(delayHours) || delayHours < 0 || delayHours > 720 || message.length < 8) return null;

      return {
        id: normalizeText(typeof record.id === "string" ? record.id : "") || `step-${index + 1}`,
        delayHours: Math.round(delayHours),
        message: message.slice(0, 480),
      };
    })
    .filter((step): step is NurtureDripStep => Boolean(step));

  return steps.length > 0 ? steps : defaultNurtureSteps;
}

export function readEnvNurtureConfig(): Partial<NurtureConfig> | null {
  const openPhoneApiKey = normalizeText(process.env.OPENPHONE_API_KEY);
  const openPhonePhoneNumberId = normalizeText(process.env.OPENPHONE_PHONE_NUMBER_ID);
  const openPhoneWebhookSecret = normalizeText(process.env.OPENPHONE_WEBHOOK_SECRET);

  if (!openPhoneApiKey && !openPhonePhoneNumberId && !openPhoneWebhookSecret) return null;
  return { openPhoneApiKey, openPhonePhoneNumberId, openPhoneWebhookSecret };
}

export function normalizeNurtureConfig(input: Partial<NurtureConfig>): NurtureConfig {
  const entrySources = input.entrySources && typeof input.entrySources === "object"
    ? input.entrySources
    : { quoteDisplayed: true, externalWebhook: true };
  return {
    openPhoneApiKey: normalizeText(input.openPhoneApiKey),
    openPhonePhoneNumberId: normalizeText(input.openPhonePhoneNumberId),
    openPhoneWebhookSecret: normalizeText(input.openPhoneWebhookSecret),
    enabled: Boolean(input.enabled),
    entrySources: {
      quoteDisplayed: entrySources.quoteDisplayed !== false,
      externalWebhook: entrySources.externalWebhook !== false,
    },
    quoteTrigger: input.quoteTrigger === "quote_sent" ? "quote_sent" : "quote_created",
    businessName: normalizeText(input.businessName).slice(0, 80),
    timezone: normalizeTimezone(input.timezone),
    quietHoursStart: normalizeTime(input.quietHoursStart, "20:00"),
    quietHoursEnd: normalizeTime(input.quietHoursEnd, "08:00"),
    exclusions: normalizeExclusions(input.exclusions),
    stopRules: normalizeStopRules(input.stopRules),
    steps: normalizeNurtureSteps(input.steps),
  };
}

async function readStoredNurtureConfig(): Promise<StoredNurtureConfig | null> {
  const stored = await readStoredAdminIntegrationSecret(NURTURE_CONFIG_STORAGE_KEY);
  if (!stored?.value) {
    const integration = await readStoredAdminIntegrationSecret("integration:openphone");
    if (!integration?.value) return null;
    const parsedIntegration = JSON.parse(integration.value) as { apiKey?: string; phoneNumberId?: string };
    if (!normalizeText(parsedIntegration.apiKey)) return null;
    return {
      config: normalizeNurtureConfig({
        openPhoneApiKey: parsedIntegration.apiKey,
        openPhonePhoneNumberId: parsedIntegration.phoneNumberId,
      }),
      updatedAt: integration.updatedAt,
    };
  }

  const parsed = JSON.parse(stored.value) as Partial<NurtureConfig>;
  return {
    config: normalizeNurtureConfig(parsed),
    updatedAt: stored.updatedAt,
  };
}

export async function resolveNurtureConfig() {
  const envConfig = readEnvNurtureConfig();
  const stored = await readStoredNurtureConfig().catch(() => null);
  const storedConfig = stored?.config;

  if (!envConfig && !storedConfig) return null;
  return normalizeNurtureConfig({ ...storedConfig, ...envConfig });
}

export async function getNurtureConfigStatus(): Promise<NurtureConfigStatus> {
  const envConfig = readEnvNurtureConfig();
  const stored = await readStoredNurtureConfig().catch(() => null);
  const activeConfig = await resolveNurtureConfig();
  const storage = await getAdminIntegrationSecretStorageStatus();

  return {
    configured: Boolean(activeConfig?.openPhoneApiKey && activeConfig.openPhonePhoneNumberId),
    enabled: Boolean(activeConfig?.enabled && activeConfig.openPhoneApiKey && activeConfig.openPhonePhoneNumberId),
    source: envConfig?.openPhoneApiKey ? "env" : stored ? "stored" : "none",
    openPhoneApiKeyMasked: activeConfig?.openPhoneApiKey ? maskValue(activeConfig.openPhoneApiKey) : "",
    openPhonePhoneNumberId: activeConfig?.openPhonePhoneNumberId ?? "",
    openPhoneWebhookSecretMasked: activeConfig?.openPhoneWebhookSecret ? maskValue(activeConfig.openPhoneWebhookSecret) : "",
    entrySources: activeConfig?.entrySources ?? { quoteDisplayed: true, externalWebhook: true },
    businessName: activeConfig?.businessName ?? "",
    timezone: activeConfig?.timezone ?? "America/Phoenix",
    quietHoursStart: activeConfig?.quietHoursStart ?? "20:00",
    quietHoursEnd: activeConfig?.quietHoursEnd ?? "08:00",
    exclusions: activeConfig?.exclusions ?? defaultNurtureExclusions,
    stopRules: activeConfig?.stopRules ?? defaultNurtureStopRules,
    steps: activeConfig?.steps ?? defaultNurtureSteps,
    bindingReady: storage.bindingReady,
    encryptionReady: storage.encryptionReady,
    storageReady: storage.storageReady,
    eventTokenReady: Boolean(normalizeText(process.env.NURTURE_EVENT_TOKEN)),
    usesEnvOverride: Boolean(envConfig?.openPhoneApiKey && stored),
    lastUpdatedAt: stored?.updatedAt,
  };
}

export async function saveStoredNurtureConfig(input: Partial<NurtureConfig>) {
  const envConfig = readEnvNurtureConfig();
  const existing = await readStoredNurtureConfig().catch(() => null);
  const existingConfig = existing?.config;

  const config = normalizeNurtureConfig({
    ...existingConfig,
    ...input,
    openPhoneApiKey: normalizeText(input.openPhoneApiKey) || existingConfig?.openPhoneApiKey || envConfig?.openPhoneApiKey || "",
    openPhonePhoneNumberId:
      normalizeText(input.openPhonePhoneNumberId) ||
      existingConfig?.openPhonePhoneNumberId ||
      envConfig?.openPhonePhoneNumberId ||
      "",
    openPhoneWebhookSecret:
      normalizeText(input.openPhoneWebhookSecret) ||
      existingConfig?.openPhoneWebhookSecret ||
      envConfig?.openPhoneWebhookSecret ||
      "",
  });

  if (config.enabled && (!config.openPhoneApiKey || !config.openPhonePhoneNumberId)) {
    throw new Error("OpenPhone API key and phone number ID are required before nurture can be enabled.");
  }

  return saveStoredAdminIntegrationSecret(NURTURE_CONFIG_STORAGE_KEY, JSON.stringify(config));
}
