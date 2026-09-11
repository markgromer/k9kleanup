import { readAdminSetting, writeAdminSetting } from "@/lib/admin-platform";

const PAYMENT_STORE_KEY = "sweep-and-go-payment-signups-v1";
const MAX_PAYMENT_RECORDS = 200;
const WEBHOOK_FALLBACK_WINDOW_MS = 30 * 60 * 1000;

type PaymentStatus = "waiting_for_payment_link" | "payment_link_ready" | "onboarding_failed";

type StoredPaymentSignup = {
  signupId: string;
  emailHash: string;
  phoneHash: string;
  clientId: string;
  creditCardLink: string;
  status: PaymentStatus;
  createdAt: string;
  updatedAt: string;
};

export type PublicPaymentSignup = Pick<StoredPaymentSignup, "signupId" | "creditCardLink" | "status" | "updatedAt">;

function normalizeEmail(value: unknown) {
  return text(value).toLowerCase();
}

function normalizePhone(value: unknown) {
  const digits = text(value).replace(/\D/g, "");
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits.slice(0, 10);
}

function normalizeClientId(value: unknown) {
  return text(value).slice(0, 200);
}

function normalizeUrl(value: unknown) {
  const candidate = text(value);
  if (!candidate) return "";
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

async function hash(value: string) {
  if (!value) return "";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function identifiers(input: { email?: unknown; phone?: unknown; clientId?: unknown }) {
  return {
    emailHash: await hash(normalizeEmail(input.email)),
    phoneHash: await hash(normalizePhone(input.phone)),
    clientId: normalizeClientId(input.clientId),
  };
}

function isStoredPayment(value: unknown): value is StoredPaymentSignup {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.signupId === "string"
    && typeof record.status === "string"
    && typeof record.createdAt === "string"
    && typeof record.updatedAt === "string";
}

async function readPayments() {
  const stored = await readAdminSetting<unknown[]>(PAYMENT_STORE_KEY, []);
  return Array.isArray(stored) ? stored.filter(isStoredPayment).slice(0, MAX_PAYMENT_RECORDS) : [];
}

async function writePayments(payments: StoredPaymentSignup[]) {
  const retained = payments
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, MAX_PAYMENT_RECORDS);
  await writeAdminSetting(PAYMENT_STORE_KEY, retained);
}

function publicPayment(payment: StoredPaymentSignup): PublicPaymentSignup {
  return {
    signupId: payment.signupId,
    creditCardLink: payment.creditCardLink,
    status: payment.status,
    updatedAt: payment.updatedAt,
  };
}

export async function createSweepAndGoPaymentSignup(input: { signupId: string; email?: unknown; phone?: unknown }) {
  const signupId = text(input.signupId).slice(0, 100);
  if (!/^[A-Za-z0-9_-]{12,100}$/.test(signupId)) throw new Error("The quote signup ID is invalid.");
  const payments = await readPayments();
  const existing = payments.find((payment) => payment.signupId === signupId);
  if (existing) return publicPayment(existing);
  const now = new Date().toISOString();
  const matched = await identifiers(input);
  const payment: StoredPaymentSignup = {
    signupId,
    emailHash: matched.emailHash,
    phoneHash: matched.phoneHash,
    clientId: "",
    creditCardLink: "",
    status: "waiting_for_payment_link",
    createdAt: now,
    updatedAt: now,
  };
  await writePayments([payment, ...payments]);
  return publicPayment(payment);
}

export async function updateSweepAndGoPaymentSignup(input: {
  signupId: string;
  creditCardLink?: unknown;
  clientId?: unknown;
  status?: PaymentStatus;
}) {
  const payments = await readPayments();
  const index = payments.findIndex((payment) => payment.signupId === text(input.signupId));
  if (index < 0) return null;
  const creditCardLink = normalizeUrl(input.creditCardLink);
  const current = payments[index];
  const nextCreditCardLink = creditCardLink || current.creditCardLink;
  payments[index] = {
    ...current,
    clientId: normalizeClientId(input.clientId) || current.clientId,
    creditCardLink: nextCreditCardLink,
    status: nextCreditCardLink ? "payment_link_ready" : input.status ?? current.status,
    updatedAt: new Date().toISOString(),
  };
  await writePayments(payments);
  return publicPayment(payments[index]);
}

export async function getSweepAndGoPaymentSignup(signupId: unknown) {
  const payment = (await readPayments()).find((item) => item.signupId === text(signupId));
  return payment ? publicPayment(payment) : null;
}

export async function attachSweepAndGoPaymentLink(input: {
  creditCardLink: unknown;
  email?: unknown;
  phone?: unknown;
  clientId?: unknown;
}) {
  const creditCardLink = normalizeUrl(input.creditCardLink);
  if (!creditCardLink) return null;
  const matched = await identifiers(input);
  const payments = await readPayments();
  let index = payments.findIndex((payment) =>
    (Boolean(matched.clientId) && payment.clientId === matched.clientId)
    || (Boolean(matched.emailHash) && payment.emailHash === matched.emailHash)
    || (Boolean(matched.phoneHash) && payment.phoneHash === matched.phoneHash));
  if (index < 0) {
    const cutoff = Date.now() - WEBHOOK_FALLBACK_WINDOW_MS;
    const waiting = payments
      .map((payment, paymentIndex) => ({ payment, paymentIndex }))
      .filter(({ payment }) => payment.status === "waiting_for_payment_link" && new Date(payment.createdAt).getTime() >= cutoff);
    if (waiting.length === 1) index = waiting[0].paymentIndex;
  }
  if (index < 0) return null;
  const current = payments[index];
  payments[index] = {
    ...current,
    clientId: matched.clientId || current.clientId,
    creditCardLink,
    status: "payment_link_ready",
    updatedAt: new Date().toISOString(),
  };
  await writePayments(payments);
  return publicPayment(payments[index]);
}

function findUrlByKey(value: unknown, pattern: RegExp, depth = 0): string {
  if (depth > 8 || value == null) return "";
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findUrlByKey(item, pattern, depth + 1);
      if (found) return found;
    }
    return "";
  }
  if (typeof value !== "object") return "";
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const direct = normalizeUrl(child);
    if (direct && pattern.test(key)) return direct;
    const nested = findUrlByKey(child, pattern, depth + 1);
    if (nested) return nested;
  }
  return "";
}

export function extractSweepAndGoCreditCardLink(value: unknown) {
  const eventLink = findUrlByKey(value, /^(link|url)$/i);
  if (eventLink && /private_credit_card|credit|card|payment|billing|pay/i.test(eventLink)) return eventLink;
  return findUrlByKey(value, /(credit|card|cc|payment|billing|pay).*?(url|link)|(url|link).*?(credit|card|cc|payment|billing|pay)/i);
}

function findValueByKey(value: unknown, pattern: RegExp, depth = 0): unknown {
  if (depth > 8 || value == null) return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findValueByKey(item, pattern, depth + 1);
      if (found !== undefined && found !== null && found !== "") return found;
    }
    return undefined;
  }
  if (typeof value !== "object") return undefined;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (pattern.test(key) && child !== undefined && child !== null && child !== "") return child;
    const nested = findValueByKey(child, pattern, depth + 1);
    if (nested !== undefined && nested !== null && nested !== "") return nested;
  }
  return undefined;
}

export function extractSweepAndGoPaymentIdentifiers(value: unknown) {
  return {
    email: normalizeEmail(findValueByKey(value, /^email$|email_address/i)),
    phone: normalizePhone(findValueByKey(value, /^(phone|cell_phone_number|home_phone_number|cellPhoneNumber|phone_number|home_phone|cell_phone)$/i)),
    clientId: normalizeClientId(findValueByKey(value, /^(client|client_id|clientId|customer_id|customerId|person_id|personId|id)$/i)),
  };
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : value === null || value === undefined ? "" : String(value).trim();
}
