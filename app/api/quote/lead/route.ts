import { NextRequest, NextResponse } from "next/server";

import { captureQuoteLead } from "@/lib/quote-tool";
import { readLandingAttribution } from "@/lib/landing-attribution";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const result = await captureQuoteLead({ ...body, attribution: readLandingAttribution(req.headers.get("cookie")) });
    return NextResponse.json(result, { status: result.ok === false ? 400 : 200 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: message(error) }, { status: 502 });
  }
}

function message(error: unknown) { return error instanceof Error ? error.message : "Quote lead capture failed."; }
