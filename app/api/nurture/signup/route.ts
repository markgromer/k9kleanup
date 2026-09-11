import { NextRequest, NextResponse } from "next/server";

import { recordNurtureSignupEvent } from "@/lib/nurture";

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
    const result = await recordNurtureSignupEvent({
      phone: typeof body.phone === "string" ? body.phone : "",
      signupId: typeof body.signupId === "string" ? body.signupId : "",
      source: typeof body.source === "string" ? body.source : "signup",
      metadata: typeof body.metadata === "object" && body.metadata ? body.metadata as Record<string, unknown> : {},
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Could not record signup nurture event.",
    }, { status: 400 });
  }
}
