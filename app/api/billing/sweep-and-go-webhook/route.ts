import { NextRequest, NextResponse } from "next/server";

import { BillingActionError, receiveBillingWebhook } from "@/lib/billing-service";
import { consumeBillingRateLimit } from "@/lib/billing-store";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip") ?? "unknown";
  if (!(await consumeBillingRateLimit(`billing-webhook:${ip.slice(0, 80)}`, 120, 900))) return response({ ok: false, error: "Too many requests." }, 429);
  const providedSecret = (req.headers.get("x-sng-webhook-secret") ?? req.headers.get("x-webhook-secret") ?? "").trim();
  if (!providedSecret) return response({ ok: false, error: "Unauthorized webhook." }, 401);
  const payload = await req.json().catch(() => null);
  if (!payload) return response({ ok: false, error: "Invalid webhook payload." }, 400);
  try {
    return response({ ok: true, ...(await receiveBillingWebhook(payload, providedSecret)) }, 200);
  } catch (error) {
    const status = error instanceof BillingActionError ? error.status : 503;
    return response({ ok: false, error: error instanceof BillingActionError ? error.message : "Billing webhook is temporarily unavailable." }, status);
  }
}
function response(payload: unknown, status: number) { return NextResponse.json(payload, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } }); }
