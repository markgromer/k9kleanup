import { NextRequest, NextResponse } from "next/server";

import { checkAdminAuth, checkOwnerAuth, getAdminRole, isSameOriginMutation, ownerRequiredResponse, unauthorizedResponse } from "@/lib/admin-auth";
import { BillingActionError, createAndDeliverPaymentRequest, getContactsForInvoice, loadBillingDashboard, reconcilePaymentRequest } from "@/lib/billing-service";
import { transitionPaymentRequest } from "@/lib/billing-store";

export async function GET(req: NextRequest) {
  if (!(await checkAdminAuth(req))) return unauthorizedResponse();
  try {
    const data = await loadBillingDashboard();
    const role = await getAdminRole(req);
    return NextResponse.json({ ok: true, ...data, capabilities: { role, canSend: role === "owner", canCharge: role === "owner", canManage: role === "owner" } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return safeError(error);
  }
}

export async function POST(req: NextRequest) {
  if (!(await checkAdminAuth(req))) return unauthorizedResponse();
  if (!(await checkOwnerAuth(req))) return ownerRequiredResponse();
  if (!isSameOriginMutation(req)) return NextResponse.json({ ok: false, error: "Request origin was not accepted." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  try {
    const action = text(body.action);
    if (action === "contacts") return NextResponse.json({ ok: true, ...(await getContactsForInvoice(text(body.invoiceNumber))) }, { headers: { "Cache-Control": "private, no-store" } });
    if (action === "create") {
      const manual = object(body.manualRecipient);
      const contact = object(body.contact);
      const result = await createAndDeliverPaymentRequest({
        invoiceNumber: text(body.invoiceNumber), requestType: body.requestType === "owner_take" ? "owner_take" : "payer",
        channel: body.channel === "sms" ? "sms" : "copy",
        contact: Object.keys(contact).length ? contact : undefined,
        manualRecipient: Object.keys(manual).length ? { name: text(manual.name), phone: text(manual.phone), email: text(manual.email) } : undefined,
      });
      return NextResponse.json({ ok: true, ...result }, { status: 201, headers: { "Cache-Control": "no-store" } });
    }
    if (action === "reconcile") return NextResponse.json({ ok: true, ...(await reconcilePaymentRequest(text(body.id))) }, { headers: { "Cache-Control": "no-store" } });
    if (action === "revoke") {
      const changed = await transitionPaymentRequest(text(body.id), ["ready", "sent", "opened", "failed"], "revoked", { eventType: "payment_request_revoked" });
      if (!changed) throw new BillingActionError("This payment request cannot be revoked in its current state.", 409);
      return NextResponse.json({ ok: true, revoked: true }, { headers: { "Cache-Control": "no-store" } });
    }
    throw new BillingActionError("Unknown billing action.", 400);
  } catch (error) {
    return safeError(error);
  }
}

function safeError(error: unknown) {
  const status = error instanceof BillingActionError ? error.status : 503;
  const message = error instanceof BillingActionError || error instanceof Error ? error.message : "Billing is temporarily unavailable.";
  return NextResponse.json({ ok: false, error: message }, { status, headers: { "Cache-Control": "no-store" } });
}
function text(value: unknown) { return typeof value === "string" ? value.trim().slice(0, 240) : ""; }
function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
