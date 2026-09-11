export type NormalizedBillingInvoice = {
  invoiceNumber: string; customerName: string; commercialClient: string; commercialLocation: string;
  customerType: "commercial" | "residential"; createdAt: string; nextTryCharging: string; payMethod: string;
  status: string; type: string; category: string; billingInterval: string; periodStart: string; periodEnd: string;
  totalCents: number; remainingCents: number; paidCents: number; refundedCents: number; needsAttention: boolean;
};

export function normalizeBillingInvoice(value: unknown, toCents: (value: unknown) => number): NormalizedBillingInvoice | null {
  const row = record(value); const invoiceNumber = text(row.invoice_number);
  if (!invoiceNumber) return null;
  const status = text(row.status).toLowerCase(); const remainingCents = toCents(row.remaining);
  const nextTryCharging = text(row.next_try_charging); const payMethod = text(row.pay_method).toLowerCase();
  return {
    invoiceNumber, customerName: text(row.client_name) || text(row.commercial_client), commercialClient: text(row.commercial_client),
    commercialLocation: text(row.commercial_location), customerType: text(row.commercial_client) ? "commercial" : "residential",
    createdAt: text(row.created_at), nextTryCharging, payMethod, status, type: text(row.type), category: text(row.category),
    billingInterval: text(row.billing_interval), periodStart: text(row.period_start), periodEnd: text(row.period_end),
    totalCents: toCents(row.total), remainingCents, paidCents: toCents(row.paid), refundedCents: toCents(row.refunded),
    needsAttention: remainingCents > 0 && (/fail|declin|overdue/.test(status) || (!nextTryCharging && payMethod !== "credit_card")),
  };
}

export function hasNextBillingPage(page: number, rawLastPage: unknown, rowCount: number) {
  const parsed = Number(rawLastPage); const lastPage = Number.isInteger(parsed) && parsed > 0 && parsed <= 10_000 ? parsed : page;
  return rowCount > 0 && page < lastPage;
}

export function selectBillingContact<T extends { billingContact: boolean }>(contacts: T[]) {
  const billingContacts = contacts.filter((contact) => contact.billingContact);
  const autoSelectable = contacts.length === 1 || billingContacts.length === 1;
  return { contacts, ambiguous: !autoSelectable, selected: autoSelectable ? billingContacts[0] ?? contacts[0] ?? null : null };
}

function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function text(value: unknown) { return typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : ""; }
