import { NextRequest, NextResponse } from "next/server";

import { checkAdminAuth, unauthorizedResponse } from "@/lib/admin-auth";
import { deleteIntegration, getAdminPlatformStatus, getIntegrationStatuses, saveIntegration } from "@/lib/admin-platform";
import { syncGoogleIntegration } from "@/lib/google-reporting";
import { clearSweepAndGoVerification, getSweepAndGoAccess, updateAndVerifySweepAndGoCredentials, verifySweepAndGoConnection } from "@/lib/sweep-and-go-integration";

export async function GET(req: NextRequest) {
  if (!(await checkAdminAuth(req))) return unauthorizedResponse();
  try {
    const status = await getAdminPlatformStatus();
    const integrations = status.database ? await getIntegrationStatuses() : [];
    const sweepAndGo = status.database ? await getSweepAndGoAccess().catch(() => null) : null;
    return NextResponse.json({ ok: true, integrations: integrations.map((item) => item.provider === "sweep-and-go" && sweepAndGo ? { ...item, verified: sweepAndGo.verified, verifiedAt: sweepAndGo.verifiedAt, connectionState: sweepAndGo.verified ? "connected" : item.configured ? "attention" : "not-connected" } : item), storage: { bindingReady: status.database, encryptionReady: status.encryption, storageReady: status.database && status.encryption } });
  } catch (error) { return failure(error, 503); }
}

export async function PATCH(req: NextRequest) {
  if (!(await checkAdminAuth(req))) return unauthorizedResponse();
  try { const body = await req.json() as Record<string, unknown>; const provider = String(body.provider ?? ""); if (provider === "warren") return managedByWarren(); const updatedAt = await saveIntegration(provider, body); if (provider === "sweep-and-go") await clearSweepAndGoVerification(); return NextResponse.json({ ok: true, updatedAt }); }
  catch (error) { return failure(error, 400); }
}

export async function POST(req: NextRequest) {
  if (!(await checkAdminAuth(req))) return unauthorizedResponse();
  try {
    const body = await req.json() as Record<string, unknown>;
    const provider = String(body.provider ?? "");
    if (provider === "sweep-and-go") {
      const values = body.values && typeof body.values === "object" && !Array.isArray(body.values) ? body.values as Record<string, unknown> : null;
      const access = values ? await updateAndVerifySweepAndGoCredentials(values) : await verifySweepAndGoConnection();
      return NextResponse.json({ ok: true, provider, state: "connected", access });
    }
    if (provider !== "google-analytics" && provider !== "google-search-console" && provider !== "google-pagespeed") return NextResponse.json({ ok: false, error: "Connection testing is not available for this integration yet." }, { status: 400 });
    const sync = await syncGoogleIntegration(provider);
    return NextResponse.json({ ok: true, provider, state: sync.state, lastSyncedAt: sync.lastSuccessAt });
  } catch (error) { return failure(error, 400); }
}

export async function DELETE(req: NextRequest) {
  if (!(await checkAdminAuth(req))) return unauthorizedResponse();
  try { const body = await req.json() as Record<string, unknown>; const provider = String(body.provider ?? ""); if (provider === "warren") return managedByWarren(); await deleteIntegration(provider); if (provider === "sweep-and-go") await clearSweepAndGoVerification(); return NextResponse.json({ ok: true }); }
  catch (error) { return failure(error, 400); }
}

function failure(error: unknown, status: number) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Integration request failed." }, { status }); }
function managedByWarren() { return NextResponse.json({ ok: false, error: "The WARREN connection is managed securely by PoopSites." }, { status: 403 }); }
