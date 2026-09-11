import { NextRequest, NextResponse } from "next/server";

import { BillingActionError, getPublicPaymentData, submitPublicStripePayment } from "@/lib/billing-service";
import { consumeBillingRateLimit, hashPaymentToken } from "@/lib/billing-store";

type Context = { params: Promise<{ token: string }> };

export async function GET(req: NextRequest, context: Context) {
  const token = (await context.params).token;
  if (!(await allow(token, req, "lookup", 60))) return response({ ok: false, error: "Too many requests." }, 429);
  try {
    const data = await getPublicPaymentData(token);
    return response(data, data.ok ? 200 : 404);
  } catch {
    return response({ ok: false, error: "Payment information is temporarily unavailable." }, 503);
  }
}

export async function POST(req: NextRequest, context: Context) {
  if (!sameOrigin(req)) return response({ ok: false, error: "Request origin was not accepted." }, 403);
  const token = (await context.params).token;
  if (!(await allow(token, req, "submit", 8))) return response({ ok: false, error: "Too many payment attempts. Wait before trying again." }, 429);
  const body = await req.json().catch(() => null);
  if (!body) return response({ ok: false, error: "Invalid payment request." }, 400);
  try {
    return response(await submitPublicStripePayment(token, body), 200);
  } catch (error) {
    const status = error instanceof BillingActionError ? error.status : 503;
    const message = error instanceof BillingActionError ? error.message : "Payment is temporarily unavailable.";
    return response({ ok: false, error: message }, status);
  }
}

async function allow(token: string, req: NextRequest, action: string, maximum: number) {
  const tokenFingerprint = (await hashPaymentToken(token)).slice(0, 24);
  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip") ?? "unknown";
  const ipFingerprint = (await hashPaymentToken(ip)).slice(0, 16);
  return consumeBillingRateLimit(`public:${action}:${tokenFingerprint}:${ipFingerprint}`, maximum, 900);
}
function sameOrigin(req: NextRequest) { const origin = req.headers.get("origin"); if (!origin) return false; try { return new URL(origin).origin === req.nextUrl.origin; } catch { return false; } }
function response(payload: unknown, status: number) { return NextResponse.json(payload, { status, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" } }); }
