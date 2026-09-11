import { NextRequest, NextResponse } from "next/server";

import { checkAdminAuth, unauthorizedResponse } from "@/lib/admin-auth";
import { getIntegrationSyncRecord, type PageSpeedSnapshot } from "@/lib/google-reporting";
import { getSiteHealthRecord, syncSiteHealth } from "@/lib/site-health";

export async function GET(req: NextRequest) {
  if (!(await checkAdminAuth(req))) return unauthorizedResponse();
  try {
    const [record, pageSpeed] = await Promise.all([
      getSiteHealthRecord(false),
      getIntegrationSyncRecord<PageSpeedSnapshot>("google-pagespeed"),
    ]);
    return NextResponse.json({ ok: true, health: { ...record, pageSpeed: { state: pageSpeed.state, lastSyncedAt: pageSpeed.lastSuccessAt, error: pageSpeed.error, data: pageSpeed.data } } });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(req: NextRequest) {
  if (!(await checkAdminAuth(req))) return unauthorizedResponse();
  try {
    const [record, pageSpeed] = await Promise.all([
      syncSiteHealth(),
      getIntegrationSyncRecord<PageSpeedSnapshot>("google-pagespeed"),
    ]);
    return NextResponse.json({ ok: true, health: { ...record, pageSpeed: { state: pageSpeed.state, lastSyncedAt: pageSpeed.lastSuccessAt, error: pageSpeed.error, data: pageSpeed.data } } });
  } catch (error) {
    return failure(error);
  }
}

function failure(error: unknown) {
  return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Site-health checks failed." }, { status: 503 });
}
