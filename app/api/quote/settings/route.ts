import { NextResponse } from "next/server";

import { getQuoteSettings, publicQuoteSettings } from "@/lib/quote-tool";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const settings = await getQuoteSettings();
    return NextResponse.json({ ok: true, settings: publicQuoteSettings(settings) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: message(error) }, { status: 503 });
  }
}

function message(error: unknown) { return error instanceof Error ? error.message : "Quote settings are not available."; }
