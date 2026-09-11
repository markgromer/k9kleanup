import { NextRequest, NextResponse } from "next/server";
import { recordLandingJourney } from "@/lib/landing-journeys";
import { normalizeLandingAttribution } from "@/lib/landing-attribution";

export async function POST(req: NextRequest) {
  try {
    const origin = new URL(req.headers.get("origin") || "");
    const hosts = [req.nextUrl.hostname, req.headers.get("host"), req.headers.get("x-forwarded-host")].flatMap((value) => String(value || "").split(",")).map((value) => value.trim().toLowerCase().replace(/:\d+$/, ""));
    if (!hosts.includes(origin.hostname.toLowerCase())) return NextResponse.json({ ok: false }, { status: 403 });
    const referrer = new URL(req.headers.get("referer") || req.url);
    if (referrer.searchParams.has("reggieLens") || referrer.searchParams.has("reggiePreview") || process.env.REGGIE_PREVIEW === "true") return NextResponse.json({ ok: true, ignored: true });
  } catch { return NextResponse.json({ ok: false }, { status: 403 }); }
  if (Number(req.headers.get("content-length") || 0) > 5000) return NextResponse.json({ ok: false }, { status: 413 });
  try {
    const raw = await req.text();
    if (raw.length > 5000) return NextResponse.json({ ok: false }, { status: 413 });
    const body = JSON.parse(raw);
    if (!["visit", "cta"].includes(body.stage) || !normalizeLandingAttribution(body.attribution)) return NextResponse.json({ ok: false }, { status: 400 });
    await recordLandingJourney(body.attribution, body.stage);
    return NextResponse.json({ ok: true }, { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
}
