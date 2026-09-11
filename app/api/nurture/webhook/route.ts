import { NextRequest, NextResponse } from "next/server";

import { recordNurtureQuoteEvent, type NurtureQuoteEvent } from "@/lib/nurture";

type WebhookRecord = Record<string, unknown>;
type WebhookResult = {
  input: NurtureQuoteEvent;
  result?: Awaited<ReturnType<typeof recordNurtureQuoteEvent>>;
  error?: string;
};

const phoneKeys = [
  "phone",
  "phone_number",
  "phoneNumber",
  "mobile",
  "mobile_phone",
  "mobilePhone",
  "cell",
  "cell_phone",
  "cellPhone",
];

const firstNameKeys = ["firstName", "first_name", "firstname", "first"];
const lastNameKeys = ["lastName", "last_name", "lastname", "last"];
const fullNameKeys = ["fullName", "full_name", "name", "contact_name", "contactName"];
const emailKeys = ["email", "email_address", "emailAddress"];
const quoteTotalKeys = ["quoteTotal", "quote_total", "price", "estimate", "estimate_total", "value"];
const quoteLinkKeys = ["quoteLink", "quote_link", "url", "lead_url", "leadUrl"];
const quoteIdKeys = ["quoteId", "quote_id", "lead_id", "leadId", "id"];
const consentKeys = ["smsConsent", "sms_consent", "text_consent", "tcpa_consent", "consent"];
const consentTextKeys = ["consentText", "consent_text", "sms_consent_text", "tcpa_consent_text"];
const zipKeys = ["zipCode", "zip_code", "zip", "postalCode", "postal_code"];
const frequencyKeys = ["frequency", "serviceFrequency", "service_frequency", "clean_up_frequency"];
const customerStatusKeys = ["customerStatus", "customer_status", "crmStage", "crm_stage", "status"];

function isAuthorized(req: NextRequest) {
  const token = process.env.NURTURE_EVENT_TOKEN ?? "";
  if (!token) return false;

  const header = req.headers.get("authorization") ?? req.headers.get("x-nurture-token") ?? "";
  return header.replace(/^Bearer\s+/i, "").trim() === token;
}

function normalizeText(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  return "";
}

function firstValue(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value;
}

function getFirst(record: WebhookRecord, keys: string[]) {
  for (const key of keys) {
    const direct = normalizeText(firstValue(record[key]));
    if (direct) return direct;
  }

  return "";
}

function getBoolean(record: WebhookRecord, keys: string[]) {
  for (const key of keys) {
    const value = firstValue(record[key]);
    if (value === true) return true;
    if (typeof value === "string" && /^(true|yes|y|1|on|checked|consented)$/i.test(value.trim())) return true;
  }

  return false;
}

function facebookFieldDataToRecord(value: unknown) {
  const record: WebhookRecord = {};
  if (!Array.isArray(value)) return record;

  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const field = item as WebhookRecord;
    const name = normalizeText(field.name);
    if (!name) continue;
    record[name] = firstValue(field.values);
  }

  return record;
}

function splitName(fullName: string) {
  const parts = fullName.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

function normalizeLeadRecord(input: unknown): NurtureQuoteEvent {
  const raw = input && typeof input === "object" ? input as WebhookRecord : {};
  const fieldData = facebookFieldDataToRecord(raw.field_data ?? raw.fieldData ?? raw.fields);
  const record = {
    ...raw,
    ...fieldData,
  };
  const fullName = getFirst(record, fullNameKeys);
  const split = splitName(fullName);
  const source = getFirst(record, ["source", "platform", "lead_source", "leadSource"]) ||
    (raw.field_data || raw.ad_id || raw.form_id ? "facebook-lead-ads" : "webhook");

  return {
    phone: getFirst(record, phoneKeys),
    entrySource: "externalWebhook",
    smsConsent: getBoolean(record, consentKeys),
    consentSource: source,
    consentText: getFirst(record, consentTextKeys),
    firstName: getFirst(record, firstNameKeys) || split.firstName,
    lastName: getFirst(record, lastNameKeys) || split.lastName,
    quoteId: getFirst(record, quoteIdKeys),
    quoteTotal: getFirst(record, quoteTotalKeys),
    quoteLink: getFirst(record, quoteLinkKeys),
    source,
    metadata: {
      email: getFirst(record, emailKeys),
      zipCode: getFirst(record, zipKeys),
      frequency: getFirst(record, frequencyKeys),
      customerStatus: getFirst(record, customerStatusKeys),
      isCustomer: getBoolean(record, ["isCustomer", "is_customer", "existingCustomer", "existing_customer"]),
      raw,
    },
  };
}

function normalizePayload(payload: unknown) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];

  const record = payload as WebhookRecord;
  for (const key of ["leads", "data", "records", "items"]) {
    if (Array.isArray(record[key])) return record[key] as unknown[];
  }

  return [payload];
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const payload = await req.json().catch(() => null);
  const records = normalizePayload(payload);
  if (records.length === 0) {
    return NextResponse.json({ ok: false, error: "Invalid webhook payload." }, { status: 400 });
  }

  const results: WebhookResult[] = [];
  for (const record of records.slice(0, 25)) {
    const event = normalizeLeadRecord(record);
    try {
      results.push({
        input: event,
        result: await recordNurtureQuoteEvent(event),
      });
    } catch (error) {
      results.push({
        input: event,
        error: error instanceof Error ? error.message : "Could not enroll webhook lead.",
      });
    }
  }

  const enrolled = results.filter((entry) => entry.result?.enrolled).length;
  const failed = results.filter((entry) => entry.error).length;
  return NextResponse.json({
    ok: failed === 0,
    received: records.length,
    processed: results.length,
    enrolled,
    failed,
    results,
  }, { status: failed > 0 && enrolled === 0 ? 400 : 200 });
}
