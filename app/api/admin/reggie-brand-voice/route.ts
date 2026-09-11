import { NextRequest, NextResponse } from "next/server";

import { checkAdminAuth, unauthorizedResponse } from "@/lib/admin-auth";
import { getReggieConnection } from "@/lib/reggie-connection";

async function forward(req: NextRequest) {
  if (!(await checkAdminAuth(req))) return unauthorizedResponse();
  const settings = await getReggieConnection();
  if (!settings.siteId || !settings.token) {
    return NextResponse.json({ ok: false, error: "This site has not been connected to Reggie yet." }, { status: 409 });
  }
  const body = req.method === "PATCH" ? await req.text() : undefined;
  try {
    const response = await fetch(`${settings.url}/v1/sites/${encodeURIComponent(settings.siteId)}/brand-voice`, {
      method: req.method,
      headers: {
        Authorization: `Bearer ${settings.token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    return NextResponse.json(await response.json().catch(() => ({})), { status: response.status });
  } catch {
    return NextResponse.json({ ok: false, error: "Reggie could not load the brand voice right now." }, { status: 502 });
  }
}

export async function GET(req: NextRequest) {
  return forward(req);
}

export async function PATCH(req: NextRequest) {
  return forward(req);
}
