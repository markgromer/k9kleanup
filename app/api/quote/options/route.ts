import { NextRequest, NextResponse } from "next/server";

import { getQuoteOptions } from "@/lib/quote-tool";

export async function GET(req: NextRequest) {
  try {
    const zip = req.nextUrl.searchParams.get("zip") ?? "";
    return NextResponse.json(await getQuoteOptions(zip));
  } catch (error) {
    return NextResponse.json({ ok: false, error: message(error) }, { status: 503 });
  }
}

function message(error: unknown) { return error instanceof Error ? error.message : "Quote options are not available."; }
