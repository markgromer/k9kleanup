import { getIntegrationConnection, getAdminPlatformEnvironment } from "@/lib/admin-platform";
import {
  consumeBillingRateLimit,
  createBillingPaymentRequest,
  getPaymentRequestById,
  listRecentPaymentRequests,
  listPaymentRequestsForInvoice,
  recordBillingEvent,
  resolvePaymentRequestToken,
  transitionPaymentRequest,
  updatePaymentRequestDelivery,
  type BillingPaymentRequest,
} from "@/lib/billing-store";
import { getOpenPhoneReadiness, sendTransactionalSms } from "@/lib/openphone-client";
import { chargeStripeInvoice, checkInvoice, findInvoice, getBillingWorkspaceData, resolveInvoiceContacts, type BillingContact } from "@/lib/sweep-and-go-billing";
import { SweepAndGoError } from "@/lib/sweep-and-go-client";
import { containsForbiddenCardFields } from "@/lib/billing-security";

export async function getBillingReadiness() {
  const [sng, openPhone, env] = await Promise.all([
    getIntegrationConnection("sweep-and-go").catch(() => null),
    getOpenPhoneReadiness(),
    getAdminPlatformEnvironment(),
  ]);
  const publishableKey = clean(sng?.values.stripePublishableKey);
  const stripeConfirmed = clean(sng?.values.stripeAccountVerified).toLowerCase() === "confirmed";
  const publicOrigin = configuredPublicOrigin(env);
  return {
    billingData: Boolean(sng?.enabled && sng.configured),
    paymentRequests: Boolean(sng?.enabled && sng.configured && publicOrigin),
    paymentRequestsReason: !publicOrigin ? "REGGIE_PUBLIC_ORIGIN is required to create branded payment links." : !sng?.enabled || !sng.configured ? "Sweep & Go is not connected." : "",
    stripePayments: Boolean(/^pk_(?:live|test)_[A-Za-z0-9]{16,}$/.test(publishableKey) && stripeConfirmed),
    stripePublishableKey: /^pk_(?:live|test)_[A-Za-z0-9]{16,}$/.test(publishableKey) && stripeConfirmed ? publishableKey : "",
    stripeReason: !publishableKey ? "Stripe publishable key setup required." : !stripeConfirmed ? "Confirm that this publishable key belongs to the Stripe account used by Sweep & Go." : "",
    sms: openPhone.ready && Boolean(publicOrigin),
    smsReason: !openPhone.ready ? "OpenPhone SMS is not configured." : !publicOrigin ? "REGGIE_PUBLIC_ORIGIN is required for links sent by SMS." : "",
    email: false,
    emailReason: "Email sending is not configured.",
    publicOrigin,
  };
}

export async function loadBillingDashboard() {
  const [workspace, readiness, requests] = await Promise.all([getBillingWorkspaceData(), getBillingReadiness(), listRecentPaymentRequests(150)]);
  return {
    ...workspace,
    readiness: withoutPublishableKey(readiness),
    requests: requests.map((request) => ({
      id: request.id, invoiceNumber: request.invoiceNumber, status: request.status, requestType: request.requestType,
      recipientName: request.recipientName, deliveryChannel: request.deliveryChannel, updatedAt: request.updatedAt, expiresAt: request.expiresAt,
    })),
  };
}

export async function getContactsForInvoice(invoiceNumber: string) {
  const invoice = await findInvoice(invoiceNumber);
  if (!invoice) throw new BillingActionError("Invoice was not found in Sweep & Go.", 404);
  const balance = await checkInvoice(invoice.invoiceNumber);
  if (balance.remainingCents <= 0) return { invoice, balance, contacts: [], ambiguous: false, selected: null };
  return { invoice, balance, ...(await resolveInvoiceContacts(invoice)) };
}

export async function createAndDeliverPaymentRequest(input: {
  invoiceNumber: string; requestType?: "payer" | "owner_take"; channel?: "sms" | "copy";
  contact?: Partial<BillingContact>; manualRecipient?: { name?: string; phone?: string; email?: string };
}) {
  const invoice = await findInvoice(input.invoiceNumber);
  if (!invoice) throw new BillingActionError("Invoice was not found in Sweep & Go.", 404);
  const current = await checkInvoice(invoice.invoiceNumber);
  if (current.remainingCents <= 0) throw new BillingActionError("This invoice is already paid.", 409);
  const requestType = input.requestType === "owner_take" ? "owner_take" : "payer";
  const channel = input.channel === "sms" ? "sms" : "copy";
  const recipient = requestType === "owner_take" ? { name: "", phone: "", email: "" } : await validateRecipient(invoice.invoiceNumber, input.contact, input.manualRecipient);
  if (channel === "sms" && !recipient.phone) throw new BillingActionError("Choose a contact with a valid mobile number.", 400);
  const readiness = await getBillingReadiness();
  if (!readiness.publicOrigin) throw new BillingActionError("REGGIE_PUBLIC_ORIGIN is required to create branded payment links.", 503);
  if (channel === "sms" && !readiness.sms) throw new BillingActionError(readiness.smsReason, 503);
  if (!(await consumeBillingRateLimit(`create:${invoice.invoiceNumber}`, 6, 3_600))) throw new BillingActionError("Too many payment requests were created for this invoice. Try again later.", 429);
  if (channel === "sms") {
    const recent = await listRecentPaymentRequests(100);
    const duplicate = recent.some((request) => request.invoiceNumber === invoice.invoiceNumber && request.recipientPhone === recipient.phone && request.sentAt && Date.now() - Date.parse(request.sentAt) < 300_000);
    if (duplicate) throw new BillingActionError("A payment request was just sent to this number.", 409);
  }
  const created = await createBillingPaymentRequest({
    invoiceNumber: invoice.invoiceNumber, requestType, recipientName: recipient.name, recipientPhone: recipient.phone,
    recipientEmail: recipient.email, deliveryChannel: channel, lastKnownBalanceCents: current.remainingCents,
  });
  const path = `/pay/${created.token}`;
  const url = `${readiness.publicOrigin}${path}`;
  if (channel === "sms") {
    try {
      const result = await sendTransactionalSms(recipient.phone, `${businessName()}: Your current invoice balance is ${formatMoney(current.remainingCents)}. Pay securely here: ${url} Reply STOP to opt out of texts.`);
      await updatePaymentRequestDelivery(created.id, true, "sms", result.providerMessageId);
    } catch (error) {
      await updatePaymentRequestDelivery(created.id, false, "sms", "", "provider_send_failed");
      throw new BillingActionError(error instanceof Error ? error.message : "The text message could not be sent.", 502);
    }
  }
  return { id: created.id, path, url, expiresAt: created.expiresAt, currentBalanceCents: current.remainingCents, delivered: channel === "sms", channel };
}

export async function getPublicPaymentData(token: string) {
  const request = await resolvePaymentRequestToken(token, true);
  if (!request) return publicUnavailable();
  if (["expired", "revoked"].includes(request.status)) return publicUnavailable();
  const invoice = await findInvoice(request.invoiceNumber);
  if (!invoice) return publicUnavailable();
  const current = await checkInvoice(request.invoiceNumber);
  if (current.remainingCents === 0 && request.status !== "paid") {
    await transitionPaymentRequest(request.id, ["ready", "sent", "opened", "processing", "failed", "reconciliation_required"], "paid", { balanceCents: 0, eventType: "payment_reconciled" });
  }
  const readiness = await getBillingReadiness();
  const paid = current.remainingCents === 0 || request.status === "paid";
  const unavailable = current.gateway !== "stripe" || !readiness.stripePayments || request.status === "reconciliation_required";
  return {
    ok: true, paid, status: paid ? "paid" : request.status, invoiceNumber: invoice.invoiceNumber,
    customerName: invoice.commercialClient || invoice.customerName, commercialLocation: invoice.commercialLocation,
    currentBalanceCents: current.remainingCents, gateway: current.gateway,
    paymentAvailable: !paid && !unavailable,
    unavailableReason: paid ? "" : request.status === "reconciliation_required" ? "This payment is being confirmed. Please contact the business before trying again." : current.gateway === "fts" ? "Online card payment is not available for this invoice." : current.gateway === "none" ? "This invoice is not configured for online card payment." : readiness.stripeReason,
    stripePublishableKey: !paid && !unavailable ? readiness.stripePublishableKey : "",
  };
}

export async function submitPublicStripePayment(token: string, body: unknown) {
  assertCardDataBoundary(body);
  const input = record(body);
  const stripeToken = clean(input.stripeToken);
  const nameOnCard = clean(input.nameOnCard).slice(0, 120);
  if (!/^tok_[A-Za-z0-9]{8,200}$/.test(stripeToken) || !nameOnCard) throw new BillingActionError("Complete the secure card form and enter the name on the card.", 400);
  const request = await resolvePaymentRequestToken(token);
  if (!request || ["expired", "revoked"].includes(request.status)) throw new BillingActionError("This payment link is unavailable.", 404);
  if (!(await consumeBillingRateLimit(`charge:${request.id}`, 5, 900))) throw new BillingActionError("Too many payment attempts. Wait before trying again.", 429);
  const readiness = await getBillingReadiness();
  if (!readiness.stripePayments) throw new BillingActionError("Card payment setup is not ready.", 503);
  const beforeClaim = await checkInvoice(request.invoiceNumber);
  if (beforeClaim.remainingCents <= 0) {
    await markPaid(request, 0, "payment_reconciled");
    return { ok: true, paid: true, currentBalanceCents: 0 };
  }
  if (beforeClaim.gateway !== "stripe") throw new BillingActionError(gatewayMessage(beforeClaim.gateway), 409);
  const claimed = await transitionPaymentRequest(request.id, ["ready", "sent", "opened", "failed"], "processing", { balanceCents: beforeClaim.remainingCents, eventType: "payment_started", metadata: { gateway: "stripe", balanceCents: beforeClaim.remainingCents } });
  if (!claimed) throw new BillingActionError(request.status === "processing" || request.status === "reconciliation_required" ? "This payment is already being confirmed." : "This payment link cannot be charged.", 409);
  let authoritative: Awaited<ReturnType<typeof checkInvoice>>;
  try {
    authoritative = await checkInvoice(request.invoiceNumber);
  } catch (error) {
    await transitionPaymentRequest(request.id, ["processing"], "failed", { balanceCents: beforeClaim.remainingCents, eventType: "payment_failed", metadata: { gateway: "stripe", errorCode: "precharge_balance_check_failed" } });
    throw error;
  }
  if (authoritative.remainingCents <= 0) {
    await markPaid(request, 0, "payment_reconciled");
    return { ok: true, paid: true, currentBalanceCents: 0 };
  }
  if (authoritative.gateway !== "stripe") {
    await transitionPaymentRequest(request.id, ["processing"], "failed", { balanceCents: authoritative.remainingCents, eventType: "payment_failed", metadata: { gateway: authoritative.gateway, errorCode: "gateway_changed" } });
    throw new BillingActionError(gatewayMessage(authoritative.gateway), 409);
  }
  try {
    await chargeStripeInvoice({ invoiceNumber: request.invoiceNumber, amountCents: authoritative.remainingCents, nameOnCard, stripeToken });
  } catch (error) {
    if (error instanceof SweepAndGoError && error.uncertain) return reconcileUncertain(request, authoritative.remainingCents);
    await transitionPaymentRequest(request.id, ["processing"], "failed", { balanceCents: authoritative.remainingCents, eventType: "payment_failed", metadata: { gateway: "stripe", errorCode: "provider_declined" } });
    throw new BillingActionError(error instanceof Error ? error.message : "The payment was declined.", 402);
  }
  const after = await checkInvoice(request.invoiceNumber).catch(() => null);
  if (after?.remainingCents === 0) {
    await markPaid(request, 0, "payment_succeeded");
    return { ok: true, paid: true, currentBalanceCents: 0 };
  }
  await transitionPaymentRequest(request.id, ["processing"], "reconciliation_required", { balanceCents: after?.remainingCents ?? authoritative.remainingCents, eventType: "payment_reconciliation_required", metadata: { gateway: "stripe", reason: "balance_not_confirmed" } });
  return { ok: true, paid: false, confirming: true, currentBalanceCents: after?.remainingCents ?? authoritative.remainingCents };
}

export async function reconcilePaymentRequest(id: string) {
  const request = await getPaymentRequestById(id);
  if (!request) throw new BillingActionError("Payment request was not found.", 404);
  const current = await checkInvoice(request.invoiceNumber);
  if (current.remainingCents === 0) {
    await markPaid(request, 0, "payment_reconciled");
    return { paid: true, status: "paid", currentBalanceCents: 0 };
  }
  if (request.status === "reconciliation_required" && Date.now() - Date.parse(request.updatedAt) >= 300_000) {
    await transitionPaymentRequest(request.id, ["reconciliation_required"], "failed", { balanceCents: current.remainingCents, eventType: "payment_reconciled", metadata: { matched: false, balanceCents: current.remainingCents } });
    return { paid: false, status: "failed", currentBalanceCents: current.remainingCents };
  }
  return { paid: false, status: request.status, currentBalanceCents: current.remainingCents };
}

export async function receiveBillingWebhook(payload: unknown, providedSecret: string) {
  const connection = await getIntegrationConnection("sweep-and-go").catch(() => null);
  const expected = clean(connection?.values.webhookSecret);
  if (!expected) throw new BillingActionError("Billing webhooks are not configured.", 503);
  if (!constantTimeEqual(expected, providedSecret.trim())) throw new BillingActionError("Unauthorized webhook.", 401);
  const source = record(payload);
  const event = clean(source.event ?? source.event_name ?? source.type ?? source.action).toLowerCase();
  const supported = ["client:invoice_finalized", "client:client_payment_declined", "client:client_payment_accepted", "commercial:invoice_finalized", "commercial:client_payment_declined", "commercial:client_payment_accepted"];
  if (!supported.includes(event)) return { accepted: true, matched: 0 };
  const invoiceNumber = findNestedText(source, new Set(["invoice_number", "invoiceNumber"]));
  if (!invoiceNumber) return { accepted: true, matched: 0 };
  const requests = await listPaymentRequestsForInvoice(invoiceNumber);
  if (!requests.length) return { accepted: true, matched: 0 };
  const referenceValue = findNestedText(source, new Set(["webhook_id", "event_id", "payment_id", "id"]));
  const providerReference = referenceValue ? `sng:${referenceValue.slice(0, 180)}` : `sng:${(await digestText(`${event}:${invoiceNumber}:${clean(source.status)}`)).slice(0, 48)}`;
  const current = await checkInvoice(invoiceNumber).catch(() => null);
  let matched = 0;
  for (const request of requests) {
    await recordBillingEvent(request.id, "sng_webhook_received", { event, matched: true }, providerReference);
    if (current?.remainingCents === 0) await markPaid(request, 0, "payment_reconciled");
    else if (event.endsWith("payment_declined") && ["ready", "sent", "opened", "processing"].includes(request.status)) {
      await transitionPaymentRequest(request.id, [request.status], "failed", { balanceCents: current?.remainingCents, eventType: "payment_failed", metadata: { gateway: current?.gateway ?? "none", errorCode: "sng_payment_declined" } });
    }
    matched += 1;
  }
  return { accepted: true, matched };
}

async function validateRecipient(invoiceNumber: string, contact?: Partial<BillingContact>, manual?: { name?: string; phone?: string; email?: string }) {
  if (manual) {
    const recipient = { name: clean(manual.name).slice(0, 120), phone: normalizePhone(manual.phone), email: validEmail(manual.email) };
    if (!recipient.phone && !recipient.email) throw new BillingActionError("Enter a valid phone number or email address.", 400);
    return recipient;
  }
  const resolution = await getContactsForInvoice(invoiceNumber);
  const match = resolution.contacts.find((candidate) =>
    candidate.stableClientId === clean(contact?.stableClientId) && candidate.stableLocationId === clean(contact?.stableLocationId)
    && candidate.name === clean(contact?.name) && candidate.phone === normalizePhone(contact?.phone) && candidate.email === validEmail(contact?.email),
  );
  if (!match) throw new BillingActionError("Choose a verified Sweep & Go billing contact or enter a manual recipient.", 400);
  return { name: match.name, phone: match.phone, email: match.email };
}

async function reconcileUncertain(request: BillingPaymentRequest, previousBalance: number) {
  const check = await checkInvoice(request.invoiceNumber).catch(() => null);
  if (check?.remainingCents === 0) {
    await markPaid(request, 0, "payment_reconciled");
    return { ok: true, paid: true, currentBalanceCents: 0 };
  }
  await transitionPaymentRequest(request.id, ["processing"], "reconciliation_required", { balanceCents: check?.remainingCents ?? previousBalance, eventType: "payment_reconciliation_required", metadata: { gateway: "stripe", reason: "uncertain_provider_result" } });
  return { ok: true, paid: false, confirming: true, currentBalanceCents: check?.remainingCents ?? previousBalance };
}
async function markPaid(request: BillingPaymentRequest, balanceCents: number, eventType: string) { await transitionPaymentRequest(request.id, ["ready", "sent", "opened", "processing", "failed", "reconciliation_required"], "paid", { balanceCents, eventType }); }

export function assertCardDataBoundary(value: unknown) {
  if (containsForbiddenCardFields(value)) throw new BillingActionError("Raw card details are not accepted by REGGIE.", 400);
}

export class BillingActionError extends Error { constructor(message: string, readonly status: number) { super(message); this.name = "BillingActionError"; } }
function configuredPublicOrigin(env: object) { const value = clean(Reflect.get(env, "REGGIE_PUBLIC_ORIGIN") ?? process.env.REGGIE_PUBLIC_ORIGIN ?? process.env.NEXT_PUBLIC_SITE_URL); if (!value) return ""; try { const url = new URL(value); return url.protocol === "https:" ? url.origin : ""; } catch { return ""; } }
function publicUnavailable() { return { ok: false, paid: false, status: "unavailable", paymentAvailable: false, unavailableReason: "This payment link is unavailable." }; }
function withoutPublishableKey<T extends { stripePublishableKey: string }>(value: T) {
  const { stripePublishableKey, ...safe } = value;
  void stripePublishableKey;
  return safe;
}
function gatewayMessage(gateway: string) { return gateway === "fts" ? "This invoice uses FTS, which is not supported by the current Sweep & Go payment API." : "This invoice does not support online card payment."; }
function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function clean(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function normalizePhone(value: unknown) { const digits = clean(value).replace(/\D/g, ""); const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits; return national.length === 10 ? `+1${national}` : ""; }
function validEmail(value: unknown) { const email = clean(value).toLowerCase(); return /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/.test(email) ? email : ""; }
function formatMoney(cents: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100); }
function businessName() { return clean(process.env.NEXT_PUBLIC_BUSINESS_NAME) || "Your service provider"; }
function constantTimeEqual(left: string, right: string) { const a = new TextEncoder().encode(left); const b = new TextEncoder().encode(right); const length = Math.max(a.length, b.length); let difference = a.length ^ b.length; for (let index = 0; index < length; index += 1) difference |= (a[index] ?? 0) ^ (b[index] ?? 0); return difference === 0; }
function findNestedText(value: unknown, keys: Set<string>, depth = 0): string { if (depth > 5 || !value || typeof value !== "object") return ""; for (const [key, child] of Object.entries(value as Record<string, unknown>)) { if (keys.has(key) && (typeof child === "string" || typeof child === "number")) return String(child).trim().slice(0, 200); const nested = findNestedText(child, keys, depth + 1); if (nested) return nested; } return ""; }
async function digestText(value: string) { const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(""); }
