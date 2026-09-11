import { NextRequest, NextResponse } from "next/server";

import { checkAdminAuth, unauthorizedResponse } from "@/lib/admin-auth";
import { getWarrenConnection, saveWarrenConnection, verifyWarrenConnection } from "@/lib/warren-reporting";

export async function GET(req: NextRequest) {
  if (!(await checkAdminAuth(req))) return unauthorizedResponse();
  const connection = await getWarrenConnection();
  return NextResponse.json({ ok: true, configured: Boolean(connection.siteId && connection.token), siteId: connection.siteId, apiUrl: connection.apiUrl });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ ok: false, error: "Invalid WARREN connection payload." }, { status: 400 });
  const supplied = String(req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const adminAuthorized = await checkAdminAuth(req);
  if (!adminAuthorized && (!supplied || supplied !== String(body.token ?? "").trim())) return unauthorizedResponse();
  try {
    const connection = await verifyWarrenConnection(body, expectedSiteOrigin(req));
    await saveWarrenConnection(connection);
    return NextResponse.json({ ok: true, connected: true, siteId: connection.siteId });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "WARREN could not be connected." }, { status: 400 });
  }
}

function expectedSiteOrigin(req: NextRequest) {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) { try { return new URL(configured).origin; } catch { /* Fall through to the request host. */ } }
  const host = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const protocol = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
  if (host) { try { return new URL(`${protocol}://${host}`).origin; } catch { /* Fall through to the configured public URL. */ } }
  return req.nextUrl.origin;
}
