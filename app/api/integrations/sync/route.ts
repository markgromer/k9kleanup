import { NextRequest, NextResponse } from "next/server";

import { syncConfiguredGoogleIntegrations } from "@/lib/google-reporting";
import { syncSiteHealth } from "@/lib/site-health";

function authorized(req: NextRequest) {
  const expected = process.env.INTEGRATION_SYNC_TOKEN ?? process.env.CRON_SECRET ?? "";
  if (!expected) return false;
  const supplied = (req.headers.get("authorization") ?? req.headers.get("x-integration-token") ?? "").replace(/^Bearer\s+/i, "").trim();
  return supplied === expected;
}

export async function GET(req: NextRequest) { return POST(req); }

export async function POST(req: NextRequest) {
  if (!process.env.INTEGRATION_SYNC_TOKEN && !process.env.CRON_SECRET) return NextResponse.json({ ok: false, error: "Integration sync scheduling is not configured." }, { status: 503 });
  if (!authorized(req)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  try {
    const [results, health] = await Promise.all([
      syncConfiguredGoogleIntegrations(),
      syncSiteHealth().then((record) => ({ ok: true, checkedAt: record.lastSuccessAt })).catch((error) => ({ ok: false, error: error instanceof Error ? error.message : "Site-health checks failed." })),
    ]);
    const ok = results.every((item) => item.ok) && health.ok;
    return NextResponse.json({ ok, results, health }, { status: ok ? 200 : 207 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Integration sync failed." }, { status: 500 });
  }
}
