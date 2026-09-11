import { NextRequest, NextResponse } from "next/server";

import { checkAdminAuth, unauthorizedResponse } from "@/lib/admin-auth";
import { getReggieConnection } from "@/lib/reggie-connection";

export async function POST(req: NextRequest) {
  if (!(await checkAdminAuth(req))) return unauthorizedResponse();
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (text.length < 2 || text.length > 2000) {
    return NextResponse.json({ ok: false, error: "Select between 2 and 2,000 characters to rewrite." }, { status: 400 });
  }

  const settings = await getReggieConnection();
  if (!settings.siteId || !settings.token) {
    return NextResponse.json({ ok: false, error: "This site has not been connected to Reggie yet." }, { status: 409 });
  }

  try {
    const response = await fetch(`${settings.url}/v1/sites/${encodeURIComponent(settings.siteId)}/rewrite`, {
      method: "POST",
      headers: { Authorization: `Bearer ${settings.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    return NextResponse.json(await response.json().catch(() => ({})), { status: response.status });
  } catch {
    return NextResponse.json({ ok: false, error: "Reggie could not rewrite this text right now. Try again." }, { status: 502 });
  }
}
