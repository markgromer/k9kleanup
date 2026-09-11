import { NextRequest, NextResponse } from "next/server";

import { collectAnalyticsEvent, getAdminPlatformEnvironment } from "@/lib/admin-platform";

function runtimeEnvValue(env: object, key: string) {
  return Reflect.get(env, key);
}

export async function POST(req: NextRequest) {
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > 20000) return NextResponse.json({ ok: false, error: "Payload too large." }, { status: 413 });
  const origin = req.headers.get("origin");
  if (origin) {
    try {
      const originHost = new URL(origin).hostname.toLowerCase();
      const requestHosts = [req.nextUrl.hostname, req.headers.get("host"), req.headers.get("x-forwarded-host")]
        .flatMap((value) => String(value ?? "").split(","))
        .map((value) => value.trim().toLowerCase().replace(/:\d+$/, ""))
        .filter(Boolean);
      if (!requestHosts.includes(originHost)) return NextResponse.json({ ok: false, error: "Origin rejected." }, { status: 403 });
    }
    catch { return NextResponse.json({ ok: false, error: "Origin rejected." }, { status: 403 }); }
  }
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return NextResponse.json({ ok: false, error: "JSON required." }, { status: 415 });
  try {
    const env = await getAdminPlatformEnvironment();
    if (!origin) {
      const expected = String(runtimeEnvValue(env, "REGGIE_ANALYTICS_INGEST_KEY") ?? "").trim();
      const supplied = req.headers.get("x-reggie-analytics-key") ?? "";
      if (!expected || supplied !== expected) return NextResponse.json({ ok: false, error: "Origin or ingest key required." }, { status: 403 });
    }
    const limiterValue = runtimeEnvValue(env, "ANALYTICS_RATE_LIMITER");
    const limiter = limiterValue && typeof limiterValue === "object"
      ? limiterValue as { limit?(input: { key: string }): Promise<{ success: boolean }> }
      : undefined;
    if (limiter?.limit) {
      const key = req.headers.get("cf-connecting-ip") ?? "unknown";
      if (!(await limiter.limit({ key })).success) return NextResponse.json({ ok: false, error: "Rate limit exceeded." }, { status: 429 });
    }
    const body = await req.json() as Record<string, unknown>;
    if (isReggieLensReferrer(req.headers.get("referer"))) body.source = "reggie-lens";
    const event = await collectAnalyticsEvent(body);
    return NextResponse.json({ ok: true, id: event.id }, { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Event rejected." }, { status: 400 });
  }
}

function isReggieLensReferrer(value: string | null) {
  try { return new URL(value ?? "").searchParams.has("reggieLens"); }
  catch { return false; }
}
