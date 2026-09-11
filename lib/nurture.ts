import { getAdminIntegrationsDatabase } from "@/lib/cloudinary-config";
import { type NurtureConfig, type NurtureEntrySources, resolveNurtureConfig } from "@/lib/nurture-config";
import { sendOpenPhoneSms } from "@/lib/openphone-client";

const NURTURE_RECIPIENTS_TABLE = "admin_nurture_recipients";
const NURTURE_MESSAGES_TABLE = "admin_nurture_messages";
const NURTURE_EVENTS_TABLE = "admin_nurture_events";
const NURTURE_SUPPRESSIONS_TABLE = "admin_nurture_suppressions";
const NURTURE_RUNTIME_TABLE = "admin_nurture_runtime";

type NurtureDatabase = NonNullable<Awaited<ReturnType<typeof getAdminIntegrationsDatabase>>>;

export type NurtureQuoteEvent = {
  phone: string;
  entrySource?: keyof NurtureEntrySources;
  smsConsent?: boolean;
  consentSource?: string;
  consentText?: string;
  firstName?: string;
  lastName?: string;
  quoteId?: string;
  quoteTotal?: string | number;
  quoteLink?: string;
  source?: string;
  metadata?: Record<string, unknown>;
};

export type NurtureStopReason = "signup" | "booking" | "payment" | "customer_created";

export type NurtureSignupEvent = {
  phone: string;
  signupId?: string;
  source?: string;
  metadata?: Record<string, unknown>;
};

export type NurtureOptOutEvent = {
  phone: string;
  source?: string;
  metadata?: Record<string, unknown>;
};

export type NurtureReplyEvent = {
  phone: string;
  text?: string;
  providerMessageId?: string;
  source?: string;
  metadata?: Record<string, unknown>;
};

type NurtureRecipientStatus = "active" | "processing" | "signed_up" | "completed" | "paused" | "replied" | "opted_out";

export type NurtureRecipientSummary = {
  id: string;
  phoneE164: string;
  firstName: string;
  quoteId: string;
  quoteTotal: string;
  quoteLink: string;
  source: string;
  status: NurtureRecipientStatus;
  currentStepIndex: number;
  nextSendAt: string;
  lastSentAt: string;
  createdAt: string;
  updatedAt: string;
  signedUpAt: string;
  completedAt: string;
};

export type NurtureEventSummary = {
  id: string;
  recipientId: string;
  phoneE164: string;
  eventType: string;
  source: string;
  occurredAt: string;
  detail: Record<string, unknown>;
};

export type NurtureDashboard = {
  activeCount: number;
  signedUpCount: number;
  completedCount: number;
  optedOutCount: number;
  manualCount: number;
  failedCount: number;
  suppressionCount: number;
  sentCount: number;
  deliveredCount: number;
  lastProcessedAt: string;
  recentRecipients: NurtureRecipientSummary[];
  recentEvents: NurtureEventSummary[];
};

type StoredRecipient = {
  id: string;
  phone_e164: string;
  phone_key: string;
  first_name: string;
  last_name: string;
  quote_id: string;
  quote_total: string;
  quote_link: string;
  source: string;
  status: NurtureRecipientStatus;
  current_step_index: number;
  next_send_at: string;
  last_sent_at: string;
  created_at: string;
  updated_at: string;
  signed_up_at: string;
  completed_at: string;
  metadata_json: string;
};

type StoredNurtureEvent = {
  id: string;
  recipient_id: string;
  phone_e164: string;
  event_type: string;
  source: string;
  detail_json: string;
  occurred_at: string;
};

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeNurturePhone(value: string) {
  const raw = normalizeText(value);
  if (raw.startsWith("+")) {
    const digits = raw.slice(1).replace(/\D/g, "");
    return digits.length >= 10 && digits.length <= 15 ? `+${digits}` : "";
  }

  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return "";
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + Math.max(0, hours) * 60 * 60 * 1000);
}

function safeJson(value: unknown) {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return "{}";
  }
}

function parseJsonRecord(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function renderMessage(template: string, recipient: StoredRecipient, config: NurtureConfig) {
  const replacements: Record<string, string> = {
    firstName: recipient.first_name || "there",
    businessName: config.businessName || "us",
    quoteTotal: recipient.quote_total || "",
    quoteLink: recipient.quote_link || "",
  };

  return template.replace(/\{\{(firstName|businessName|quoteTotal|quoteLink)\}\}/g, (_, key: string) => replacements[key] ?? "");
}

function ensureOptOutLanguage(content: string) {
  if (/\bstop\b/i.test(content)) return content;
  return `${content.trim()} Reply STOP to opt out.`;
}

function localTimeParts(timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: timezone || "America/Phoenix",
  }).formatToParts(new Date());
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

function minutesForTime(value: string) {
  const [hour, minute] = value.split(":").map((part) => Number(part));
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return 0;
  return hour * 60 + minute;
}

function isQuietTime(config: NurtureConfig) {
  const now = localTimeParts(config.timezone);
  const start = minutesForTime(config.quietHoursStart);
  const end = minutesForTime(config.quietHoursEnd);
  if (start === end) return false;
  if (start < end) return now >= start && now < end;
  return now >= start || now < end;
}

async function ensureNurtureTables(database: NurtureDatabase) {
  await database.prepare(
    `CREATE TABLE IF NOT EXISTS ${NURTURE_RECIPIENTS_TABLE} (
      id TEXT PRIMARY KEY,
      phone_e164 TEXT NOT NULL,
      phone_key TEXT NOT NULL UNIQUE,
      first_name TEXT NOT NULL DEFAULT '',
      last_name TEXT NOT NULL DEFAULT '',
      quote_id TEXT NOT NULL DEFAULT '',
      quote_total TEXT NOT NULL DEFAULT '',
      quote_link TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL,
      current_step_index INTEGER NOT NULL DEFAULT 0,
      next_send_at TEXT NOT NULL DEFAULT '',
      last_sent_at TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      signed_up_at TEXT NOT NULL DEFAULT '',
      completed_at TEXT NOT NULL DEFAULT '',
      metadata_json TEXT NOT NULL DEFAULT '{}'
    );`,
  ).run();

  await database.prepare(
    `CREATE TABLE IF NOT EXISTS ${NURTURE_MESSAGES_TABLE} (
      id TEXT PRIMARY KEY,
      recipient_id TEXT NOT NULL,
      step_id TEXT NOT NULL,
      step_index INTEGER NOT NULL,
      phone_e164 TEXT NOT NULL,
      content TEXT NOT NULL,
      provider_message_id TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL,
      error TEXT NOT NULL DEFAULT '',
      sent_at TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );`,
  ).run();

  await database.prepare(
    `CREATE TABLE IF NOT EXISTS ${NURTURE_EVENTS_TABLE} (
      id TEXT PRIMARY KEY,
      recipient_id TEXT NOT NULL DEFAULT '',
      phone_e164 TEXT NOT NULL DEFAULT '',
      event_type TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT '',
      detail_json TEXT NOT NULL DEFAULT '{}',
      occurred_at TEXT NOT NULL
    );`,
  ).run();

  await database.prepare(
    `CREATE TABLE IF NOT EXISTS ${NURTURE_SUPPRESSIONS_TABLE} (
      phone_key TEXT PRIMARY KEY,
      phone_e164 TEXT NOT NULL,
      reason TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT '',
      detail_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );`,
  ).run();

  await database.prepare(
    `CREATE TABLE IF NOT EXISTS ${NURTURE_RUNTIME_TABLE} (
      runtime_key TEXT PRIMARY KEY,
      last_processed_at TEXT NOT NULL DEFAULT '',
      last_sent_count INTEGER NOT NULL DEFAULT 0,
      last_skipped_count INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );`,
  ).run();
}

async function getNurtureDatabase() {
  const database = await getAdminIntegrationsDatabase();
  if (!database) {
    throw new Error("Nurture storage is not ready. Bind a D1 database named INTEGRATIONS_DB.");
  }

  await ensureNurtureTables(database);
  return database;
}

function mapRecipient(row: StoredRecipient): NurtureRecipientSummary {
  return {
    id: row.id,
    phoneE164: row.phone_e164,
    firstName: row.first_name,
    quoteId: row.quote_id,
    quoteTotal: row.quote_total,
    quoteLink: row.quote_link,
    source: row.source,
    status: row.status,
    currentStepIndex: Number(row.current_step_index || 0),
    nextSendAt: row.next_send_at,
    lastSentAt: row.last_sent_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    signedUpAt: row.signed_up_at,
    completedAt: row.completed_at,
  };
}

function mapEvent(row: StoredNurtureEvent): NurtureEventSummary {
  return {
    id: row.id,
    recipientId: row.recipient_id,
    phoneE164: row.phone_e164,
    eventType: row.event_type,
    source: row.source,
    occurredAt: row.occurred_at,
    detail: parseJsonRecord(row.detail_json),
  };
}

async function recordEvent(
  database: NurtureDatabase,
  input: { recipientId?: string; phoneE164?: string; eventType: string; source?: string; detail?: Record<string, unknown>; occurredAt?: string },
) {
  const occurredAt = input.occurredAt || new Date().toISOString();
  await database.prepare(
    `INSERT INTO ${NURTURE_EVENTS_TABLE} (id, recipient_id, phone_e164, event_type, source, detail_json, occurred_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
  ).bind(
    makeId("event"),
    normalizeText(input.recipientId).slice(0, 120),
    normalizeText(input.phoneE164).slice(0, 40),
    normalizeText(input.eventType).slice(0, 80),
    normalizeText(input.source).slice(0, 120),
    safeJson(input.detail),
    occurredAt,
  ).run();
}

function normalizedRuleValue(value: unknown) {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function metadataValue(metadata: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  }
  return "";
}

function exclusionReason(config: NurtureConfig, input: NurtureQuoteEvent) {
  const exclusions = config.exclusions;
  const metadata = input.metadata ?? {};
  const source = normalizedRuleValue(input.source);
  const zipCode = normalizeText(metadataValue(metadata, ["zipCode", "zip_code", "zip"])).replace(/\D/g, "");
  const frequency = normalizedRuleValue(metadataValue(metadata, ["frequency", "serviceFrequency", "service_frequency"]));
  const quoteTotal = Number(String(input.quoteTotal ?? "").replace(/[^0-9.-]/g, ""));
  const customerState = normalizedRuleValue(metadataValue(metadata, ["customerStatus", "customer_status", "crmStage", "crm_stage", "status"]));
  const isExistingCustomer = metadataValue(metadata, ["isCustomer", "is_customer", "existingCustomer", "existing_customer"]) === true
    || ["customer", "active_customer", "signed_up", "won", "booked"].includes(customerState);

  if (exclusions.excludeExistingCustomers && isExistingCustomer) return "existing_customer";
  if (source && exclusions.excludedSources.some((value) => normalizedRuleValue(value) === source)) return "excluded_source";
  if (zipCode && exclusions.excludedZipCodes.includes(zipCode)) return "excluded_zip_code";
  if (frequency && exclusions.excludedFrequencies.some((value) => normalizedRuleValue(value) === frequency)) return "excluded_frequency";
  if (Number.isFinite(quoteTotal) && exclusions.minimumQuoteTotal !== null && quoteTotal < exclusions.minimumQuoteTotal) return "below_minimum_quote";
  if (Number.isFinite(quoteTotal) && exclusions.maximumQuoteTotal !== null && quoteTotal > exclusions.maximumQuoteTotal) return "above_maximum_quote";
  return "";
}

export async function recordNurtureQuoteEvent(input: NurtureQuoteEvent) {
  const config = await resolveNurtureConfig();
  const phoneE164 = normalizeNurturePhone(input.phone);
  if (!phoneE164) throw new Error("A valid phone number is required to enroll quote nurture.");
  if (input.smsConsent !== true) {
    return { ok: true, enrolled: false, reason: "sms_consent_required", phoneE164 };
  }
  if (!config?.enabled || config.steps.length === 0) {
    return { ok: true, enrolled: false, reason: "nurture_disabled", phoneE164 };
  }

  const entrySource = input.entrySource === "externalWebhook" ? "externalWebhook" : "quoteDisplayed";
  if (!config.entrySources[entrySource]) {
    return { ok: true, enrolled: false, reason: "entry_source_disabled", phoneE164 };
  }

  const database = await getNurtureDatabase();
  const now = new Date();
  const suppression = await database.prepare(
    `SELECT reason FROM ${NURTURE_SUPPRESSIONS_TABLE} WHERE phone_key = ?1`,
  ).bind(phoneE164).first<{ reason: string }>();
  if (suppression) {
    await recordEvent(database, {
      phoneE164,
      eventType: "enrollment_excluded",
      source: input.source,
      detail: { reason: "globally_suppressed", suppressionReason: suppression.reason, entrySource },
      occurredAt: now.toISOString(),
    });
    return { ok: true, enrolled: false, reason: "globally_suppressed", phoneE164 };
  }

  const ruleExclusion = exclusionReason(config, input);
  if (ruleExclusion) {
    await recordEvent(database, {
      phoneE164,
      eventType: "enrollment_excluded",
      source: input.source,
      detail: { reason: ruleExclusion, entrySource },
      occurredAt: now.toISOString(),
    });
    return { ok: true, enrolled: false, reason: ruleExclusion, phoneE164 };
  }

  const firstStep = config.steps[0];
  const nextSendAt = addHours(now, firstStep.delayHours).toISOString();
  const existing = await database
    .prepare(`SELECT * FROM ${NURTURE_RECIPIENTS_TABLE} WHERE phone_key = ?1`)
    .bind(phoneE164)
    .first<StoredRecipient>();

  if (existing?.status === "active" || existing?.status === "processing") {
    await recordEvent(database, {
      recipientId: existing.id,
      phoneE164,
      eventType: "enrollment_excluded",
      source: input.source,
      detail: { reason: "already_active", entrySource },
      occurredAt: now.toISOString(),
    });
    return { ok: true, enrolled: false, reason: "already_active", phoneE164 };
  }
  if (existing?.status === "replied" || existing?.status === "paused") {
    return { ok: true, enrolled: false, reason: "manual_handling", phoneE164 };
  }
  if (existing?.status === "signed_up") {
    return { ok: true, enrolled: false, reason: "already_signed_up", phoneE164 };
  }
  if (existing?.status === "opted_out") {
    return { ok: true, enrolled: false, reason: "opted_out", phoneE164 };
  }
  if (existing?.status === "completed" && config.exclusions.cooldownDays > 0) {
    const completedAt = Date.parse(existing.completed_at || existing.updated_at);
    const cooldownEndsAt = Number.isFinite(completedAt)
      ? completedAt + config.exclusions.cooldownDays * 24 * 60 * 60 * 1000
      : 0;
    if (cooldownEndsAt > now.getTime()) {
      await recordEvent(database, {
        recipientId: existing.id,
        phoneE164,
        eventType: "enrollment_excluded",
        source: input.source,
        detail: { reason: "cooldown_active", cooldownEndsAt: new Date(cooldownEndsAt).toISOString(), entrySource },
        occurredAt: now.toISOString(),
      });
      return { ok: true, enrolled: false, reason: "cooldown_active", phoneE164, cooldownEndsAt: new Date(cooldownEndsAt).toISOString() };
    }
  }

  const id = existing?.id || makeId("nurture");
  const metadata = {
    ...(input.metadata ?? {}),
    consent: {
      sms: true,
      source: normalizeText(input.consentSource).slice(0, 120),
      text: normalizeText(input.consentText).slice(0, 500),
      recordedAt: now.toISOString(),
    },
  };
  await database
    .prepare(
      `INSERT INTO ${NURTURE_RECIPIENTS_TABLE} (
        id, phone_e164, phone_key, first_name, last_name, quote_id, quote_total, quote_link, source,
        status, current_step_index, next_send_at, last_sent_at, created_at, updated_at, signed_up_at, completed_at, metadata_json
      )
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'active', 0, ?10, '', ?11, ?12, '', '', ?13)
      ON CONFLICT(phone_key) DO UPDATE SET
        phone_e164 = excluded.phone_e164,
        first_name = excluded.first_name,
        last_name = excluded.last_name,
        quote_id = excluded.quote_id,
        quote_total = excluded.quote_total,
        quote_link = excluded.quote_link,
        source = excluded.source,
        status = CASE
          WHEN ${NURTURE_RECIPIENTS_TABLE}.status IN ('signed_up', 'opted_out') THEN ${NURTURE_RECIPIENTS_TABLE}.status
          ELSE 'active'
        END,
        current_step_index = 0,
        next_send_at = CASE
          WHEN ${NURTURE_RECIPIENTS_TABLE}.status IN ('signed_up', 'opted_out') THEN ''
          ELSE excluded.next_send_at
        END,
        last_sent_at = CASE
          WHEN ${NURTURE_RECIPIENTS_TABLE}.status IN ('signed_up', 'opted_out') THEN ${NURTURE_RECIPIENTS_TABLE}.last_sent_at
          ELSE ''
        END,
        created_at = CASE
          WHEN ${NURTURE_RECIPIENTS_TABLE}.status IN ('signed_up', 'opted_out') THEN ${NURTURE_RECIPIENTS_TABLE}.created_at
          ELSE excluded.created_at
        END,
        updated_at = excluded.updated_at,
        signed_up_at = CASE
          WHEN ${NURTURE_RECIPIENTS_TABLE}.status = 'signed_up' THEN ${NURTURE_RECIPIENTS_TABLE}.signed_up_at
          ELSE ''
        END,
        completed_at = CASE
          WHEN ${NURTURE_RECIPIENTS_TABLE}.status = 'opted_out' THEN ${NURTURE_RECIPIENTS_TABLE}.completed_at
          ELSE ''
        END,
        metadata_json = excluded.metadata_json`,
    )
    .bind(
      id,
      phoneE164,
      phoneE164,
      normalizeText(input.firstName).slice(0, 80),
      normalizeText(input.lastName).slice(0, 80),
      normalizeText(input.quoteId).slice(0, 120),
      String(input.quoteTotal ?? "").trim().slice(0, 80),
      normalizeText(input.quoteLink).slice(0, 500),
      normalizeText(input.source).slice(0, 120),
      nextSendAt,
      now.toISOString(),
      now.toISOString(),
      safeJson(metadata),
    )
    .run();

  await recordEvent(database, {
    recipientId: id,
    phoneE164,
    eventType: "enrolled",
    source: input.source,
    detail: { entrySource, quoteId: normalizeText(input.quoteId), nextSendAt },
    occurredAt: now.toISOString(),
  });

  return { ok: true, enrolled: true, id, phoneE164, nextSendAt };
}

export async function recordNurtureSignupEvent(input: NurtureSignupEvent) {
  return recordNurtureStopEvent({ ...input, reason: "signup", referenceId: input.signupId });
}

export async function recordNurtureStopEvent(input: {
  phone: string;
  reason: NurtureStopReason;
  referenceId?: string;
  source?: string;
  metadata?: Record<string, unknown>;
}) {
  const phoneE164 = normalizeNurturePhone(input.phone);
  if (!phoneE164) throw new Error("A valid phone number is required to remove quote nurture.");

  const config = await resolveNurtureConfig();
  const stopRule = input.reason === "customer_created" ? "customerCreated" : input.reason;
  if (config && !config.stopRules[stopRule]) {
    return { ok: true, removed: false, reason: "stop_rule_disabled", phoneE164 };
  }

  const database = await getNurtureDatabase();
  const now = new Date().toISOString();
  const id = makeId("converted");
  const metadata = {
    ...(input.metadata ?? {}),
    stopReason: input.reason,
    referenceId: normalizeText(input.referenceId).slice(0, 120),
  };
  await database
    .prepare(
      `INSERT INTO ${NURTURE_RECIPIENTS_TABLE} (
        id, phone_e164, phone_key, source, status, current_step_index, next_send_at, last_sent_at,
        created_at, updated_at, signed_up_at, completed_at, metadata_json
      )
      VALUES (?1, ?2, ?3, ?4, 'signed_up', 0, '', '', ?5, ?5, ?5, '', ?6)
      ON CONFLICT(phone_key) DO UPDATE SET
        status = CASE
          WHEN ${NURTURE_RECIPIENTS_TABLE}.status = 'opted_out' THEN ${NURTURE_RECIPIENTS_TABLE}.status
          ELSE 'signed_up'
        END,
        source = excluded.source,
        signed_up_at = CASE
          WHEN ${NURTURE_RECIPIENTS_TABLE}.status = 'opted_out' THEN ${NURTURE_RECIPIENTS_TABLE}.signed_up_at
          ELSE excluded.signed_up_at
        END,
        updated_at = excluded.updated_at,
        next_send_at = '',
        metadata_json = excluded.metadata_json`,
    )
    .bind(id, phoneE164, phoneE164, normalizeText(input.source).slice(0, 120), now, safeJson(metadata))
    .run();

  const recipient = await database.prepare(
    `SELECT id FROM ${NURTURE_RECIPIENTS_TABLE} WHERE phone_key = ?1`,
  ).bind(phoneE164).first<{ id: string }>();
  await recordEvent(database, {
    recipientId: recipient?.id,
    phoneE164,
    eventType: input.reason,
    source: input.source,
    detail: { referenceId: normalizeText(input.referenceId) },
    occurredAt: now,
  });

  return { ok: true, removed: true, phoneE164, signedUpAt: now, stopReason: input.reason };
}

export async function recordNurtureOptOutEvent(input: NurtureOptOutEvent) {
  const phoneE164 = normalizeNurturePhone(input.phone);
  if (!phoneE164) throw new Error("A valid phone number is required to opt out of quote nurture.");

  const database = await getNurtureDatabase();
  const now = new Date().toISOString();
  const id = makeId("optout");
  await database.prepare(
    `INSERT INTO ${NURTURE_SUPPRESSIONS_TABLE} (phone_key, phone_e164, reason, source, detail_json, created_at, updated_at)
     VALUES (?1, ?2, 'opted_out', ?3, ?4, ?5, ?5)
     ON CONFLICT(phone_key) DO UPDATE SET reason = 'opted_out', source = excluded.source, detail_json = excluded.detail_json, updated_at = excluded.updated_at`,
  ).bind(phoneE164, phoneE164, normalizeText(input.source).slice(0, 120), safeJson(input.metadata), now).run();
  await database
    .prepare(
      `INSERT INTO ${NURTURE_RECIPIENTS_TABLE} (
        id, phone_e164, phone_key, source, status, current_step_index, next_send_at, last_sent_at,
        created_at, updated_at, signed_up_at, completed_at, metadata_json
      )
      VALUES (?1, ?2, ?3, ?4, 'opted_out', 0, '', '', ?5, ?5, '', ?5, ?6)
      ON CONFLICT(phone_key) DO UPDATE SET
        status = 'opted_out',
        source = excluded.source,
        next_send_at = '',
        completed_at = excluded.completed_at,
        updated_at = excluded.updated_at,
        metadata_json = excluded.metadata_json`,
    )
    .bind(id, phoneE164, phoneE164, normalizeText(input.source).slice(0, 120), now, safeJson(input.metadata))
    .run();

  const recipient = await database.prepare(
    `SELECT id FROM ${NURTURE_RECIPIENTS_TABLE} WHERE phone_key = ?1`,
  ).bind(phoneE164).first<{ id: string }>();
  await recordEvent(database, {
    recipientId: recipient?.id,
    phoneE164,
    eventType: "opted_out",
    source: input.source,
    detail: input.metadata,
    occurredAt: now,
  });

  return { ok: true, optedOut: true, phoneE164, optedOutAt: now };
}

export async function recordNurtureReplyEvent(input: NurtureReplyEvent) {
  const phoneE164 = normalizeNurturePhone(input.phone);
  if (!phoneE164) throw new Error("A valid phone number is required to record a nurture reply.");
  const text = normalizeText(input.text).slice(0, 2000);
  if (/^(stop|stopall|unsubscribe|cancel|end|quit)$/i.test(text)) {
    return recordNurtureOptOutEvent({ ...input, metadata: { ...(input.metadata ?? {}), text, providerMessageId: input.providerMessageId } });
  }

  const database = await getNurtureDatabase();
  const now = new Date().toISOString();
  const existing = await database.prepare(
    `SELECT * FROM ${NURTURE_RECIPIENTS_TABLE} WHERE phone_key = ?1`,
  ).bind(phoneE164).first<StoredRecipient>();
  const id = existing?.id || makeId("reply");
  const metadata = {
    ...(existing ? parseJsonRecord(existing.metadata_json) : {}),
    lastReply: { text, providerMessageId: normalizeText(input.providerMessageId), receivedAt: now },
    ...(input.metadata ?? {}),
  };
  await database.prepare(
    `INSERT INTO ${NURTURE_RECIPIENTS_TABLE} (
      id, phone_e164, phone_key, source, status, current_step_index, next_send_at, last_sent_at,
      created_at, updated_at, signed_up_at, completed_at, metadata_json
    ) VALUES (?1, ?2, ?3, ?4, 'replied', 0, '', '', ?5, ?5, '', ?5, ?6)
    ON CONFLICT(phone_key) DO UPDATE SET
      status = CASE WHEN ${NURTURE_RECIPIENTS_TABLE}.status = 'opted_out' THEN 'opted_out' ELSE 'replied' END,
      source = excluded.source,
      next_send_at = '',
      completed_at = CASE WHEN ${NURTURE_RECIPIENTS_TABLE}.status = 'opted_out' THEN ${NURTURE_RECIPIENTS_TABLE}.completed_at ELSE excluded.completed_at END,
      updated_at = excluded.updated_at,
      metadata_json = excluded.metadata_json`,
  ).bind(id, phoneE164, phoneE164, normalizeText(input.source || "openphone").slice(0, 120), now, safeJson(metadata)).run();
  await recordEvent(database, {
    recipientId: id,
    phoneE164,
    eventType: "inbound_reply",
    source: input.source || "openphone",
    detail: { text, providerMessageId: normalizeText(input.providerMessageId) },
    occurredAt: now,
  });
  return { ok: true, manualHandling: true, phoneE164, receivedAt: now };
}

export async function recordNurtureDeliveryEvent(input: { providerMessageId: string; phone?: string; source?: string; metadata?: Record<string, unknown> }) {
  const providerMessageId = normalizeText(input.providerMessageId);
  if (!providerMessageId) throw new Error("A provider message ID is required to record delivery.");
  const database = await getNurtureDatabase();
  const now = new Date().toISOString();
  const message = await database.prepare(
    `SELECT recipient_id, phone_e164 FROM ${NURTURE_MESSAGES_TABLE} WHERE provider_message_id = ?1`,
  ).bind(providerMessageId).first<{ recipient_id: string; phone_e164: string }>();
  await database.prepare(
    `UPDATE ${NURTURE_MESSAGES_TABLE} SET status = 'delivered' WHERE provider_message_id = ?1 AND status = 'sent'`,
  ).bind(providerMessageId).run();
  const phoneE164 = message?.phone_e164 || normalizeNurturePhone(input.phone || "");
  await recordEvent(database, {
    recipientId: message?.recipient_id,
    phoneE164,
    eventType: "message_delivered",
    source: input.source || "openphone",
    detail: { providerMessageId, matched: Boolean(message), ...(input.metadata ?? {}) },
    occurredAt: now,
  });
  return { ok: true, delivered: true, matched: Boolean(message), providerMessageId };
}

async function sendOpenPhoneMessage(config: NurtureConfig, to: string, content: string) {
  const result = await sendOpenPhoneSms({ apiKey: config.openPhoneApiKey, phoneNumberId: config.openPhonePhoneNumberId }, to, content);
  return result.providerMessageId;
}

export async function processDueNurtureMessages(limit = 10) {
  const config = await resolveNurtureConfig();
  if (!config?.enabled || !config.openPhoneApiKey || !config.openPhonePhoneNumberId) {
    return { ok: true, sent: 0, skipped: 0, reason: "nurture_not_ready" };
  }

  const database = await getNurtureDatabase();
  const now = new Date();
  const staleClaim = new Date(now.getTime() - 15 * 60 * 1000).toISOString();
  await database.prepare(
    `UPDATE ${NURTURE_RECIPIENTS_TABLE} SET status = 'active', updated_at = ?1
     WHERE status = 'processing' AND updated_at <= ?2`,
  ).bind(now.toISOString(), staleClaim).run();
  const rows = await database
    .prepare(
      `SELECT * FROM ${NURTURE_RECIPIENTS_TABLE}
       WHERE status = 'active' AND next_send_at != '' AND next_send_at <= ?1
       ORDER BY next_send_at ASC
       LIMIT ?2`,
    )
    .bind(now.toISOString(), Math.max(1, Math.min(25, limit)))
    .all<StoredRecipient>();

  const recipients = rows?.results ?? [];
  let sent = 0;
  let skipped = 0;

  for (const recipient of recipients) {
    if (isQuietTime(config)) {
      skipped += 1;
      await database
        .prepare(`UPDATE ${NURTURE_RECIPIENTS_TABLE} SET next_send_at = ?1, updated_at = ?2 WHERE id = ?3`)
        .bind(addHours(now, 1).toISOString(), now.toISOString(), recipient.id)
        .run();
      continue;
    }

    const stepIndex = Number(recipient.current_step_index || 0);
    const step = config.steps[stepIndex];
    if (!step) {
      await database
        .prepare(`UPDATE ${NURTURE_RECIPIENTS_TABLE} SET status = 'completed', completed_at = ?1, updated_at = ?1, next_send_at = '' WHERE id = ?2`)
        .bind(now.toISOString(), recipient.id)
        .run();
      await recordEvent(database, {
        recipientId: recipient.id,
        phoneE164: recipient.phone_e164,
        eventType: "sequence_completed",
        source: "processor",
        occurredAt: now.toISOString(),
      });
      continue;
    }

    const failedAttempts = await database.prepare(
      `SELECT COUNT(*) AS count FROM ${NURTURE_MESSAGES_TABLE}
       WHERE recipient_id = ?1 AND step_index = ?2 AND status = 'failed' AND created_at >= ?3`,
    ).bind(recipient.id, stepIndex, recipient.created_at).first<{ count: number }>();
    if (Number(failedAttempts?.count ?? 0) >= 3) {
      await database.prepare(
        `UPDATE ${NURTURE_RECIPIENTS_TABLE} SET status = 'paused', next_send_at = '', updated_at = ?1
         WHERE id = ?2 AND status = 'active'`,
      ).bind(now.toISOString(), recipient.id).run();
      await recordEvent(database, {
        recipientId: recipient.id,
        phoneE164: recipient.phone_e164,
        eventType: "delivery_paused",
        source: "processor",
        detail: { reason: "maximum_attempts", stepId: step.id, stepIndex },
        occurredAt: now.toISOString(),
      });
      skipped += 1;
      continue;
    }

    const claim = await database.prepare(
      `UPDATE ${NURTURE_RECIPIENTS_TABLE} SET status = 'processing', updated_at = ?1
       WHERE id = ?2 AND status = 'active' AND current_step_index = ?3`,
    ).bind(now.toISOString(), recipient.id, stepIndex).run() as { meta?: { changes?: number } };
    if (Number(claim.meta?.changes ?? 0) < 1) {
      skipped += 1;
      continue;
    }

    const content = ensureOptOutLanguage(renderMessage(step.message, recipient, config));
    const messageId = makeId("msg");
    try {
      const providerMessageId = await sendOpenPhoneMessage(config, recipient.phone_e164, content);
      const nextStep = config.steps[stepIndex + 1];
      const journeyStartedAt = new Date(recipient.created_at);
      const nextSendAt = nextStep
        ? addHours(Number.isNaN(journeyStartedAt.getTime()) ? now : journeyStartedAt, nextStep.delayHours).toISOString()
        : "";
      const nextStatus = nextStep ? "active" : "completed";
      await database
        .prepare(
          `INSERT INTO ${NURTURE_MESSAGES_TABLE} (
            id, recipient_id, step_id, step_index, phone_e164, content, provider_message_id, status, sent_at, created_at
          ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'sent', ?8, ?8)`,
        )
        .bind(messageId, recipient.id, step.id, stepIndex, recipient.phone_e164, content, providerMessageId, now.toISOString())
        .run();
      await database
        .prepare(
          `UPDATE ${NURTURE_RECIPIENTS_TABLE}
           SET current_step_index = ?1, next_send_at = ?2, last_sent_at = ?3, status = ?4, completed_at = ?5, updated_at = ?3
           WHERE id = ?6 AND status = 'processing'`,
        )
        .bind(stepIndex + 1, nextSendAt, now.toISOString(), nextStatus, nextStatus === "completed" ? now.toISOString() : "", recipient.id)
        .run();
      await recordEvent(database, {
        recipientId: recipient.id,
        phoneE164: recipient.phone_e164,
        eventType: nextStatus === "completed" ? "message_sent_sequence_completed" : "message_sent",
        source: "openphone",
        detail: { stepId: step.id, stepIndex, providerMessageId, nextSendAt },
        occurredAt: now.toISOString(),
      });
      sent += 1;
    } catch (error) {
      await database
        .prepare(
          `INSERT INTO ${NURTURE_MESSAGES_TABLE} (
            id, recipient_id, step_id, step_index, phone_e164, content, status, error, created_at
          ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'failed', ?7, ?8)`,
        )
        .bind(messageId, recipient.id, step.id, stepIndex, recipient.phone_e164, content, error instanceof Error ? error.message : "Unknown send error.", now.toISOString())
        .run();
      await database
        .prepare(`UPDATE ${NURTURE_RECIPIENTS_TABLE} SET status = 'active', next_send_at = ?1, updated_at = ?2 WHERE id = ?3 AND status = 'processing'`)
        .bind(addHours(now, 1).toISOString(), now.toISOString(), recipient.id)
        .run();
      await recordEvent(database, {
        recipientId: recipient.id,
        phoneE164: recipient.phone_e164,
        eventType: "message_failed",
        source: "openphone",
        detail: { stepId: step.id, stepIndex, error: error instanceof Error ? error.message : "Unknown send error." },
        occurredAt: now.toISOString(),
      });
      skipped += 1;
    }
  }

  await database.prepare(
    `INSERT INTO ${NURTURE_RUNTIME_TABLE} (runtime_key, last_processed_at, last_sent_count, last_skipped_count, updated_at)
     VALUES ('processor', ?1, ?2, ?3, ?1)
     ON CONFLICT(runtime_key) DO UPDATE SET
       last_processed_at = excluded.last_processed_at,
       last_sent_count = excluded.last_sent_count,
       last_skipped_count = excluded.last_skipped_count,
       updated_at = excluded.updated_at`,
  ).bind(now.toISOString(), sent, skipped).run();

  return { ok: true, sent, skipped };
}

export async function getNurtureDashboard(): Promise<NurtureDashboard> {
  const database = await getNurtureDatabase();
  const [active, signedUp, completed, optedOut, manual, sent, delivered, failed, suppressions, runtime, recent, recentEvents] = await Promise.all([
    database.prepare(`SELECT COUNT(*) AS count FROM ${NURTURE_RECIPIENTS_TABLE} WHERE status IN ('active', 'processing')`).first<{ count: number }>(),
    database.prepare(`SELECT COUNT(*) AS count FROM ${NURTURE_RECIPIENTS_TABLE} WHERE status = 'signed_up'`).first<{ count: number }>(),
    database.prepare(`SELECT COUNT(*) AS count FROM ${NURTURE_RECIPIENTS_TABLE} WHERE status = 'completed'`).first<{ count: number }>(),
    database.prepare(`SELECT COUNT(*) AS count FROM ${NURTURE_RECIPIENTS_TABLE} WHERE status = 'opted_out'`).first<{ count: number }>(),
    database.prepare(`SELECT COUNT(*) AS count FROM ${NURTURE_RECIPIENTS_TABLE} WHERE status IN ('replied', 'paused')`).first<{ count: number }>(),
    database.prepare(`SELECT COUNT(*) AS count FROM ${NURTURE_MESSAGES_TABLE} WHERE status IN ('sent', 'delivered')`).first<{ count: number }>(),
    database.prepare(`SELECT COUNT(*) AS count FROM ${NURTURE_MESSAGES_TABLE} WHERE status = 'delivered'`).first<{ count: number }>(),
    database.prepare(`SELECT COUNT(*) AS count FROM ${NURTURE_MESSAGES_TABLE} WHERE status = 'failed'`).first<{ count: number }>(),
    database.prepare(`SELECT COUNT(*) AS count FROM ${NURTURE_SUPPRESSIONS_TABLE}`).first<{ count: number }>(),
    database.prepare(`SELECT last_processed_at FROM ${NURTURE_RUNTIME_TABLE} WHERE runtime_key = 'processor'`).first<{ last_processed_at: string }>(),
    database
      .prepare(`SELECT * FROM ${NURTURE_RECIPIENTS_TABLE} ORDER BY updated_at DESC LIMIT 12`)
      .all<StoredRecipient>(),
    database
      .prepare(`SELECT * FROM ${NURTURE_EVENTS_TABLE} ORDER BY occurred_at DESC LIMIT 20`)
      .all<StoredNurtureEvent>(),
  ]);

  return {
    activeCount: Number(active?.count ?? 0),
    signedUpCount: Number(signedUp?.count ?? 0),
    completedCount: Number(completed?.count ?? 0),
    optedOutCount: Number(optedOut?.count ?? 0),
    manualCount: Number(manual?.count ?? 0),
    failedCount: Number(failed?.count ?? 0),
    suppressionCount: Number(suppressions?.count ?? 0),
    sentCount: Number(sent?.count ?? 0),
    deliveredCount: Number(delivered?.count ?? 0),
    lastProcessedAt: runtime?.last_processed_at ?? "",
    recentRecipients: (recent?.results ?? []).map(mapRecipient),
    recentEvents: (recentEvents?.results ?? []).map(mapEvent),
  };
}
