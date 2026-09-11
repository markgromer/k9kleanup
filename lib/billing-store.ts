import { requireAdminDatabase, type AdminDatabase } from "@/lib/admin-platform";
import { createOpaquePaymentToken, hashOpaquePaymentToken } from "@/lib/billing-security";

const REQUESTS = "reggie_billing_payment_requests";
const EVENTS = "reggie_billing_events";
const LIMITS = "reggie_billing_rate_limits";

export type PaymentRequestStatus = "ready" | "sent" | "opened" | "processing" | "paid" | "failed" | "expired" | "revoked" | "reconciliation_required";
export type BillingPaymentRequest = {
  id: string; invoiceNumber: string; tokenHash: string; requestType: "payer" | "owner_take";
  recipientName: string; recipientPhone: string; recipientEmail: string; deliveryChannel: string;
  status: PaymentRequestStatus; lastKnownBalanceCents: number; createdAt: string; updatedAt: string;
  expiresAt: string; sentAt: string; openedAt: string; processingAt: string; paidAt: string; revokedAt: string;
};

export async function ensureBillingSchema(database?: AdminDatabase) {
  const db = database ?? await requireAdminDatabase();
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS ${REQUESTS} (
      id TEXT PRIMARY KEY, provider TEXT NOT NULL, invoice_number TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE,
      request_type TEXT NOT NULL, recipient_name TEXT NOT NULL DEFAULT '', recipient_phone TEXT NOT NULL DEFAULT '',
      recipient_email TEXT NOT NULL DEFAULT '', delivery_channel TEXT NOT NULL DEFAULT '', status TEXT NOT NULL,
      last_known_balance_cents INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      expires_at TEXT NOT NULL, sent_at TEXT NOT NULL DEFAULT '', opened_at TEXT NOT NULL DEFAULT '',
      processing_at TEXT NOT NULL DEFAULT '', paid_at TEXT NOT NULL DEFAULT '', revoked_at TEXT NOT NULL DEFAULT ''
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_reggie_billing_invoice ON ${REQUESTS}(invoice_number, updated_at DESC)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_reggie_billing_status ON ${REQUESTS}(status, updated_at DESC)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS ${EVENTS} (
      id TEXT PRIMARY KEY, payment_request_id TEXT NOT NULL, event_type TEXT NOT NULL, provider_reference TEXT NOT NULL DEFAULT '',
      sanitized_metadata_json TEXT NOT NULL DEFAULT '{}', occurred_at TEXT NOT NULL,
      FOREIGN KEY(payment_request_id) REFERENCES ${REQUESTS}(id) ON DELETE CASCADE
    )`),
    db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_reggie_billing_provider_event_v2 ON ${EVENTS}(payment_request_id, event_type, provider_reference) WHERE provider_reference != ''`),
    db.prepare(`CREATE INDEX IF NOT EXISTS idx_reggie_billing_events_request ON ${EVENTS}(payment_request_id, occurred_at DESC)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS ${LIMITS} (limit_key TEXT PRIMARY KEY, window_started_at TEXT NOT NULL, attempts INTEGER NOT NULL)`),
  ]);
  return db;
}

export async function createBillingPaymentRequest(input: {
  invoiceNumber: string; requestType: "payer" | "owner_take"; recipientName?: string; recipientPhone?: string;
  recipientEmail?: string; deliveryChannel?: string; lastKnownBalanceCents: number; expiresInHours?: number;
}) {
  const database = await ensureBillingSchema();
  const token = createOpaquePaymentToken();
  const tokenHash = await hashPaymentToken(token);
  const id = crypto.randomUUID();
  const now = new Date();
  const expiresInHours = Math.max(1, Math.min(168, Math.round(input.expiresInHours ?? 72)));
  const expiresAt = new Date(now.getTime() + expiresInHours * 3_600_000).toISOString();
  await database.prepare(
    `INSERT INTO ${REQUESTS} (id, provider, invoice_number, token_hash, request_type, recipient_name, recipient_phone,
      recipient_email, delivery_channel, status, last_known_balance_cents, created_at, updated_at, expires_at)
     VALUES (?1, 'sweep-and-go', ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'ready', ?9, ?10, ?10, ?11)`,
  ).bind(id, input.invoiceNumber, tokenHash, input.requestType, input.recipientName ?? "", input.recipientPhone ?? "", input.recipientEmail ?? "", input.deliveryChannel ?? "", input.lastKnownBalanceCents, now.toISOString(), expiresAt).run();
  await recordBillingEvent(id, "payment_request_created", {}, "", database);
  return { id, token, expiresAt };
}

export async function resolvePaymentRequestToken(token: string, markOpened = false) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const database = await ensureBillingSchema();
  const tokenHash = await hashPaymentToken(token);
  const row = await database.prepare(`SELECT * FROM ${REQUESTS} WHERE token_hash = ?1`).bind(tokenHash).first<Record<string, unknown>>();
  if (!row) return null;
  let request = mapRequest(row);
  if (["ready", "sent", "opened", "failed"].includes(request.status) && Date.parse(request.expiresAt) <= Date.now()) {
    await transitionPaymentRequest(request.id, [request.status], "expired", { eventType: "payment_request_expired" }, database);
    request = { ...request, status: "expired", updatedAt: new Date().toISOString() };
  } else if (markOpened && ["ready", "sent"].includes(request.status) && !request.openedAt) {
    const now = new Date().toISOString();
    await database.prepare(`UPDATE ${REQUESTS} SET status = 'opened', opened_at = ?1, updated_at = ?1 WHERE id = ?2 AND status IN ('ready','sent')`).bind(now, request.id).run();
    await recordBillingEvent(request.id, "payment_request_opened", {}, "", database);
    request = { ...request, status: "opened", openedAt: now, updatedAt: now };
  }
  return request;
}

export async function getPaymentRequestById(id: string) {
  const database = await ensureBillingSchema();
  const row = await database.prepare(`SELECT * FROM ${REQUESTS} WHERE id = ?1`).bind(id).first<Record<string, unknown>>();
  return row ? mapRequest(row) : null;
}

export async function listRecentPaymentRequests(limit = 100) {
  const database = await ensureBillingSchema();
  const rows = await database.prepare(`SELECT * FROM ${REQUESTS} ORDER BY updated_at DESC LIMIT ?1`).bind(Math.max(1, Math.min(250, limit))).all<Record<string, unknown>>();
  return rows.results.map(mapRequest);
}

export async function listPaymentRequestsForInvoice(invoiceNumber: string) {
  const database = await ensureBillingSchema();
  const rows = await database.prepare(`SELECT * FROM ${REQUESTS} WHERE invoice_number = ?1 ORDER BY updated_at DESC LIMIT 100`).bind(invoiceNumber.slice(0, 120)).all<Record<string, unknown>>();
  return rows.results.map(mapRequest);
}

export async function transitionPaymentRequest(
  id: string,
  allowed: PaymentRequestStatus[],
  status: PaymentRequestStatus,
  options: { balanceCents?: number; eventType?: string; providerReference?: string; metadata?: Record<string, unknown> } = {},
  existingDatabase?: AdminDatabase,
) {
  const database = existingDatabase ?? await ensureBillingSchema();
  const now = new Date().toISOString();
  const placeholders = allowed.map((_, index) => `?${index + 5}`).join(",");
  const timestampColumn = status === "sent" ? "sent_at" : status === "opened" ? "opened_at" : status === "processing" ? "processing_at" : status === "paid" ? "paid_at" : status === "revoked" ? "revoked_at" : "";
  const result = await database.prepare(
    `UPDATE ${REQUESTS} SET status = ?1, updated_at = ?2, last_known_balance_cents = COALESCE(?3, last_known_balance_cents)
      ${timestampColumn ? `, ${timestampColumn} = ?2` : ""} WHERE id = ?4 AND status IN (${placeholders})`,
  ).bind(status, now, options.balanceCents ?? null, id, ...allowed).run() as { meta?: { changes?: number } };
  const changed = Number(result.meta?.changes ?? 0) === 1;
  if (changed && options.eventType) await recordBillingEvent(id, options.eventType, options.metadata ?? {}, options.providerReference ?? "", database);
  return changed;
}

export async function updatePaymentRequestDelivery(id: string, delivered: boolean, channel: string, providerReference = "", errorCode = "") {
  const database = await ensureBillingSchema();
  const now = new Date().toISOString();
  if (delivered) {
    await database.prepare(`UPDATE ${REQUESTS} SET status = CASE WHEN status = 'ready' THEN 'sent' ELSE status END, delivery_channel = ?1, sent_at = CASE WHEN sent_at = '' THEN ?2 ELSE sent_at END, updated_at = ?2 WHERE id = ?3`).bind(channel, now, id).run();
  }
  await recordBillingEvent(id, delivered ? `${channel}_sent` : `${channel}_failed`, errorCode ? { errorCode } : {}, providerReference, database);
}

export async function consumeBillingRateLimit(key: string, maximum: number, windowSeconds: number) {
  const database = await ensureBillingSchema();
  const now = new Date();
  const cutoff = new Date(now.getTime() - Math.max(1, windowSeconds) * 1000).toISOString();
  const row = await database.prepare(
    `INSERT INTO ${LIMITS} (limit_key, window_started_at, attempts) VALUES (?1, ?2, 1)
     ON CONFLICT(limit_key) DO UPDATE SET attempts = CASE WHEN window_started_at <= ?3 THEN 1 ELSE attempts + 1 END,
       window_started_at = CASE WHEN window_started_at <= ?3 THEN ?2 ELSE window_started_at END RETURNING attempts`,
  ).bind(key.slice(0, 180), now.toISOString(), cutoff).first<{ attempts?: number }>();
  return Number(row?.attempts ?? maximum + 1) <= maximum;
}

export async function recordBillingEvent(requestId: string, eventType: string, metadata: Record<string, unknown> = {}, providerReference = "", existingDatabase?: AdminDatabase) {
  const database = existingDatabase ?? await ensureBillingSchema();
  const safe = sanitizeEventMetadata(metadata);
  try {
    await database.prepare(`INSERT INTO ${EVENTS} (id, payment_request_id, event_type, provider_reference, sanitized_metadata_json, occurred_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`)
      .bind(crypto.randomUUID(), requestId, eventType.slice(0, 80), providerReference.slice(0, 200), JSON.stringify(safe), new Date().toISOString()).run();
  } catch (error) {
    const duplicate = providerReference && error instanceof Error && /(?:unique constraint failed|constraint.*idx_reggie_billing_provider_event)/i.test(error.message);
    if (!duplicate) throw error;
    // A duplicate provider event is intentionally idempotent; other storage failures remain visible.
  }
}

export async function hashPaymentToken(token: string) {
  return hashOpaquePaymentToken(token);
}

function sanitizeEventMetadata(value: Record<string, unknown>) {
  const allowed = new Set(["gateway", "balanceCents", "channel", "errorCode", "event", "matched", "reason"]);
  return Object.fromEntries(Object.entries(value).filter(([key, item]) => allowed.has(key) && ["string", "number", "boolean"].includes(typeof item)).map(([key, item]) => [key, typeof item === "string" ? item.slice(0, 160) : item]));
}
function mapRequest(row: Record<string, unknown>): BillingPaymentRequest {
  return {
    id: text(row.id), invoiceNumber: text(row.invoice_number), tokenHash: text(row.token_hash), requestType: row.request_type === "owner_take" ? "owner_take" : "payer",
    recipientName: text(row.recipient_name), recipientPhone: text(row.recipient_phone), recipientEmail: text(row.recipient_email), deliveryChannel: text(row.delivery_channel),
    status: paymentStatus(row.status), lastKnownBalanceCents: Number(row.last_known_balance_cents ?? 0), createdAt: text(row.created_at), updatedAt: text(row.updated_at),
    expiresAt: text(row.expires_at), sentAt: text(row.sent_at), openedAt: text(row.opened_at), processingAt: text(row.processing_at), paidAt: text(row.paid_at), revokedAt: text(row.revoked_at),
  };
}
function paymentStatus(value: unknown): PaymentRequestStatus { const status = text(value) as PaymentRequestStatus; return ["ready", "sent", "opened", "processing", "paid", "failed", "expired", "revoked", "reconciliation_required"].includes(status) ? status : "failed"; }
function text(value: unknown) { return typeof value === "string" ? value : ""; }
