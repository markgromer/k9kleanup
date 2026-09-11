import { getSweepAndGoConnection, sweepAndGoRequest, type SweepAndGoConnection } from "@/lib/sweep-and-go-client";
import { centsToMoney, moneyToCents, normalizeGateway } from "@/lib/billing-security";
import { hasNextBillingPage, normalizeBillingInvoice, selectBillingContact, type NormalizedBillingInvoice } from "@/lib/billing-normalization";

export { centsToMoney, moneyToCents, normalizeGateway, type BillingGateway } from "@/lib/billing-security";

export type BillingInvoice = NormalizedBillingInvoice;

export type BillingContact = {
  stableClientId: string;
  stableLocationId: string;
  name: string;
  role: string;
  email: string;
  phone: string;
  billingContact: boolean;
  priority: number | null;
  preferredChannel: string;
};

export async function getBillingWorkspaceData() {
  const connection = await getSweepAndGoConnection();
  const [recurring, oneTime, payments] = await Promise.all([
    listAllInvoices(connection, "recurring"),
    listAllInvoices(connection, "one_time"),
    listRecentPayments(connection),
  ]);
  const invoices = [...recurring, ...oneTime].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const open = invoices.filter((invoice) => invoice.remainingCents > 0);
  return {
    invoices,
    summary: {
      outstandingCents: open.reduce((sum, invoice) => sum + invoice.remainingCents, 0),
      openCount: open.length,
      needsAttentionCount: open.filter((invoice) => invoice.needsAttention).length,
      collectedRecentlyCents: payments.reduce((sum, payment) => sum + payment.amountCents, 0),
      collectedWindowDays: 30,
    },
  };
}

export async function findInvoice(invoiceNumber: string) {
  const bounded = boundedInvoiceNumber(invoiceNumber);
  const connection = await getSweepAndGoConnection();
  for (const type of ["recurring", "one_time"] as const) {
    const invoices = await listAllInvoices(connection, type);
    const match = invoices.find((invoice) => invoice.invoiceNumber === bounded);
    if (match) return match;
  }
  return null;
}

export async function checkInvoice(invoiceNumber: string) {
  const connection = await getSweepAndGoConnection();
  const payload = await sweepAndGoRequest<Record<string, unknown>>(connection, "/api/v2/one_time_payment/check_invoice", {
    query: { invoice_number: boundedInvoiceNumber(invoiceNumber) },
  });
  return {
    remainingCents: moneyToCents(payload.invoice_remaining),
    gateway: normalizeGateway(payload.payment_gateway),
  };
}

export async function chargeStripeInvoice(input: { invoiceNumber: string; amountCents: number; nameOnCard: string; stripeToken: string }) {
  const connection = await getSweepAndGoConnection();
  const nameOnCard = clean(input.nameOnCard).slice(0, 120);
  const stripeToken = clean(input.stripeToken);
  if (!nameOnCard || !/^tok_[A-Za-z0-9_-]{8,200}$/.test(stripeToken)) throw new Error("The secure card token is invalid.");
  return sweepAndGoRequest<Record<string, unknown>>(connection, "/api/v2/one_time_payment/stripe_payment", {
    method: "PUT",
    body: {
      invoice_number: boundedInvoiceNumber(input.invoiceNumber),
      amount: centsToMoney(input.amountCents),
      name_on_card: nameOnCard,
      token: stripeToken,
    },
  });
}

export async function resolveInvoiceContacts(invoice: BillingInvoice) {
  const connection = await getSweepAndGoConnection();
  return invoice.customerType === "commercial"
    ? resolveCommercialContacts(connection, invoice)
    : resolveResidentialContacts(connection, invoice);
}

async function listAllInvoices(connection: SweepAndGoConnection, type: "recurring" | "one_time") {
  const invoices: BillingInvoice[] = [];
  for (let page = 1; page <= 20; page += 1) {
    const payload = await sweepAndGoRequest<Record<string, unknown>>(connection, "/api/v2/invoices", { query: { page, length: 50, type } });
    const envelope = record(payload.invoices);
    const rows = Array.isArray(envelope.data) ? envelope.data : [];
    invoices.push(...rows.map((row) => normalizeBillingInvoice(row, moneyToCents)).filter((invoice): invoice is BillingInvoice => Boolean(invoice)));
    if (!hasNextBillingPage(page, envelope.last_page, rows.length)) break;
  }
  return invoices;
}

async function listRecentPayments(connection: SweepAndGoConnection) {
  const cutoff = Date.now() - 30 * 86_400_000;
  const payments: Array<{ amountCents: number }> = [];
  for (let page = 1; page <= 20; page += 1) {
    const payload = await sweepAndGoRequest<Record<string, unknown>>(connection, "/api/v2/payments", { query: { page, length: 50 } });
    const envelope = record(payload.payments);
    const rows = Array.isArray(envelope.data) ? envelope.data.map(record) : [];
    let reachedCutoff = false;
    for (const row of rows) {
      const timestamp = parseProviderDate(row.date);
      if (timestamp !== null && timestamp < cutoff) { reachedCutoff = true; continue; }
      if (clean(row.status).toLowerCase() === "succeeded") payments.push({ amountCents: moneyToCents(row.amount) });
    }
    if (reachedCutoff || !hasNextBillingPage(page, envelope.last_page, rows.length)) break;
  }
  return payments;
}

async function resolveResidentialContacts(connection: SweepAndGoConnection, invoice: BillingInvoice) {
  const candidates: BillingContact[] = [];
  const expected = normalizeName(invoice.customerName);
  for (let page = 1; page <= 30; page += 1) {
    const payload = await sweepAndGoRequest<Record<string, unknown>>(connection, "/api/v1/clients/active", { query: { page } });
    const rows = Array.isArray(payload.data) ? payload.data.map(record) : [];
    for (const row of rows) {
      const name = `${clean(row.first_name)} ${clean(row.last_name)}`.trim();
      if (normalizeName(name) !== expected) continue;
      candidates.push({
        stableClientId: clean(row.client), stableLocationId: "", name, role: "Customer",
        email: validEmail(row.email), phone: normalizePhone(row.cell_phone ?? row.home_phone), billingContact: true,
        priority: null, preferredChannel: clean(row.channel).toLowerCase(),
      });
    }
    const pagination = record(payload.paginate);
    if (!hasNextBillingPage(page, pagination.total_pages, rows.length)) break;
  }
  return selectBillingContact(candidates);
}

async function resolveCommercialContacts(connection: SweepAndGoConnection, invoice: BillingInvoice) {
  const search = await sweepAndGoRequest<Record<string, unknown>>(connection, "/api/v2/commercial_clients/search", {
    method: "POST", query: { page: 1 }, body: { q: invoice.commercialClient || invoice.customerName },
  });
  const matches = (Array.isArray(search.data) ? search.data.map(record) : []).filter((client) => {
    if (normalizeName(client.name) !== normalizeName(invoice.commercialClient || invoice.customerName)) return false;
    const locations = Array.isArray(client.locations) ? client.locations.map(record) : [];
    return !invoice.commercialLocation || locations.some((location) => normalizeName(location.name) === normalizeName(invoice.commercialLocation));
  });
  if (matches.length !== 1 || !clean(matches[0].client)) return selectBillingContact<BillingContact>([]);
  const stableClientId = clean(matches[0].client);
  const details = await sweepAndGoRequest<Record<string, unknown>>(connection, "/api/v2/commercial_clients/client_details", {
    method: "POST", body: { client: stableClientId },
  });
  const contacts: BillingContact[] = [];
  for (const location of Array.isArray(details.locations) ? details.locations.map(record) : []) {
    if (invoice.commercialLocation && normalizeName(location.name) !== normalizeName(invoice.commercialLocation)) continue;
    for (const contact of Array.isArray(location.contacts) ? location.contacts.map(record) : []) {
      contacts.push({
        stableClientId, stableLocationId: clean(location.location),
        name: `${clean(contact.first_name)} ${clean(contact.last_name)}`.trim() || clean(contact.company_name),
        role: clean(contact.role), email: validEmail(contact.email), phone: normalizePhone(contact.phone),
        billingContact: contact.billing_contact === true || Number(contact.billing_contact) === 1,
        priority: positiveIntegerOrNull(contact.priority), preferredChannel: clean(contact.channel).toLowerCase(),
      });
    }
  }
  contacts.sort((a, b) => Number(b.billingContact) - Number(a.billingContact) || (a.priority ?? 999) - (b.priority ?? 999));
  return selectBillingContact(contacts.filter((contact) => contact.email || contact.phone));
}

function boundedInvoiceNumber(value: unknown) {
  const invoiceNumber = clean(value);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(invoiceNumber)) throw new Error("Invoice number is invalid.");
  return invoiceNumber;
}
function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function clean(value: unknown) { return typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : ""; }
function normalizeName(value: unknown) { return clean(value).toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, " ").trim(); }
function validEmail(value: unknown) { const email = clean(value).toLowerCase(); return /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/.test(email) ? email : ""; }
function normalizePhone(value: unknown) { const digits = clean(value).replace(/\D/g, ""); const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits; return national.length === 10 ? `+1${national}` : ""; }
function positiveIntegerOrNull(value: unknown) { const parsed = Number(value); return Number.isInteger(parsed) && parsed >= 0 ? parsed : null; }
function parseProviderDate(value: unknown) { const parsed = Date.parse(`${clean(value).replace(" ", "T")}Z`); return Number.isFinite(parsed) ? parsed : null; }
