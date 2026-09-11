import { NextRequest, NextResponse } from "next/server";

import * as quoteTool from "@/lib/quote-tool";

type WebhookResult = { status: number; [key: string]: unknown };
type WebhookReceiver = (payload: unknown, providedSecret: string) => Promise<WebhookResult>;

export async function POST(req: NextRequest) {
  const payload = await req.json().catch(() => null);
  if (!payload) return NextResponse.json({ ok: false, error: "Invalid webhook payload." }, { status: 400 });
  const providedSecret = (
    req.headers.get("x-sng-webhook-secret")
    ?? req.headers.get("x-webhook-secret")
    ?? req.nextUrl.searchParams.get("secret")
    ?? ""
  ).trim();
  try {
    const receiveSweepAndGoPaymentWebhook = (quoteTool as { receiveSweepAndGoPaymentWebhook?: WebhookReceiver }).receiveSweepAndGoPaymentWebhook;
    if (!receiveSweepAndGoPaymentWebhook) {
      return NextResponse.json({ ok: false, error: "Sweep & Go webhooks are not enabled for this site." }, { status: 501 });
    }
    const result = await receiveSweepAndGoPaymentWebhook(payload, providedSecret);
    return NextResponse.json(result, { status: result.status });
  } catch (error) {
    return NextResponse.json({ ok: false, error: message(error) }, { status: 500 });
  }
}

function message(error: unknown) { return error instanceof Error ? error.message : "Sweep & Go webhook failed."; }
