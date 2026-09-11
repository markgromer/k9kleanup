import { NextRequest, NextResponse } from "next/server";

import { recordNurtureQuoteEvent } from "@/lib/nurture";

function isAuthorized(req: NextRequest) {
  const token = process.env.NURTURE_EVENT_TOKEN ?? "";
  if (!token) return false;
  const header = req.headers.get("authorization") ?? req.headers.get("x-nurture-token") ?? "";
  return header.replace(/^Bearer\s+/i, "").trim() === token;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  try {
    const result = await recordNurtureQuoteEvent({
      phone: typeof body.phone === "string" ? body.phone : "",
      entrySource: body.entrySource === "quoteDisplayed" ? "quoteDisplayed" : "externalWebhook",
      smsConsent: body.smsConsent === true || body.sms_consent === true,
      consentSource: typeof body.consentSource === "string" ? body.consentSource : typeof body.consent_source === "string" ? body.consent_source : "quote-tool",
      consentText: typeof body.consentText === "string" ? body.consentText : typeof body.consent_text === "string" ? body.consent_text : "",
      firstName: typeof body.firstName === "string" ? body.firstName : "",
      lastName: typeof body.lastName === "string" ? body.lastName : "",
      quoteId: typeof body.quoteId === "string" ? body.quoteId : "",
      quoteTotal: typeof body.quoteTotal === "string" || typeof body.quoteTotal === "number" ? body.quoteTotal : "",
      quoteLink: typeof body.quoteLink === "string" ? body.quoteLink : "",
      source: typeof body.source === "string" ? body.source : "quote-tool",
      metadata: typeof body.metadata === "object" && body.metadata ? body.metadata as Record<string, unknown> : {},
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Could not record quote nurture event.",
    }, { status: 400 });
  }
}
