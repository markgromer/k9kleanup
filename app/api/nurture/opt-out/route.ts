import { NextRequest, NextResponse } from "next/server";

import { recordNurtureOptOutEvent } from "@/lib/nurture";

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

  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (text && !/\b(stop|stopall|unsubscribe|cancel|end|quit)\b/i.test(text)) {
    return NextResponse.json({ ok: true, optedOut: false, reason: "not_opt_out_keyword" });
  }

  try {
    const result = await recordNurtureOptOutEvent({
      phone: typeof body.phone === "string" ? body.phone : "",
      source: typeof body.source === "string" ? body.source : "opt-out",
      metadata: typeof body.metadata === "object" && body.metadata ? body.metadata as Record<string, unknown> : { text },
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Could not record nurture opt-out.",
    }, { status: 400 });
  }
}
