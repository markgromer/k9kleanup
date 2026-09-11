import { NextRequest, NextResponse } from "next/server";

import { recordNurtureStopEvent, type NurtureStopReason } from "@/lib/nurture";

const stopReasons: NurtureStopReason[] = ["signup", "booking", "payment", "customer_created"];

function isAuthorized(req: NextRequest) {
  const token = process.env.NURTURE_EVENT_TOKEN ?? "";
  if (!token) return false;
  const header = req.headers.get("authorization") ?? req.headers.get("x-nurture-token") ?? "";
  return header.replace(/^Bearer\s+/i, "").trim() === token;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }
  const reason = typeof body.reason === "string" && stopReasons.includes(body.reason as NurtureStopReason)
    ? body.reason as NurtureStopReason
    : "signup";
  try {
    const result = await recordNurtureStopEvent({
      phone: typeof body.phone === "string" ? body.phone : "",
      reason,
      referenceId: typeof body.referenceId === "string" ? body.referenceId : "",
      source: typeof body.source === "string" ? body.source : "stop-webhook",
      metadata: body.metadata && typeof body.metadata === "object" ? body.metadata as Record<string, unknown> : {},
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Could not stop nurture." }, { status: 400 });
  }
}
