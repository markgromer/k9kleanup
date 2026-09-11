import { NextRequest, NextResponse } from "next/server";

import { calculateQuote } from "@/lib/quote-tool";
import { readLandingAttribution } from "@/lib/landing-attribution";
import { recordLandingJourney } from "@/lib/landing-journeys";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const result = await calculateQuote(body);
    if (result.ok !== false) await recordLandingJourney(readLandingAttribution(req.headers.get("cookie")), "quote").catch(() => undefined);
    return NextResponse.json(result, { status: result.ok === false ? 400 : 200 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: message(error) }, { status: 502 });
  }
}

function message(error: unknown) { return error instanceof Error ? error.message : "Quote pricing failed."; }
