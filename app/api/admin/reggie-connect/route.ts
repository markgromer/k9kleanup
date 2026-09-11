import { NextRequest, NextResponse } from "next/server";

import { checkAdminAuth, unauthorizedResponse } from "@/lib/admin-auth";
import { getReggieConnection } from "@/lib/reggie-connection";

export async function GET(req: NextRequest) {
  if (!(await checkAdminAuth(req))) return unauthorizedResponse();
  const settings = await getReggieConnection();
  if (!settings.siteId || !settings.token) {
    return NextResponse.json({ ok: true, configured: false, connected: false, status: "needs_attention", message: "Your web team has not connected this site to Reggie yet." });
  }
  try {
    const response = await fetch(`${settings.url}/v1/sites/${encodeURIComponent(settings.siteId)}`, {
      headers: { Authorization: `Bearer ${settings.token}` },
      cache: "no-store",
    });
    return NextResponse.json(await response.json().catch(() => ({})), { status: response.status });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Reggie could not be reached." }, { status: 502 });
  }
}
