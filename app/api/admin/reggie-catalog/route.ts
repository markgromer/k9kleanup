import { NextRequest, NextResponse } from "next/server";

import { checkAdminAuth, unauthorizedResponse } from "@/lib/admin-auth";
import { getReggieConnection } from "@/lib/reggie-connection";

const allowedParams = new Set(["include", "q", "imageType", "style", "section", "limit", "offset"]);

export async function GET(req: NextRequest) {
  if (!(await checkAdminAuth(req))) return unauthorizedResponse();
  const settings = await getReggieConnection();
  if (!settings.siteId || !settings.token) {
    return NextResponse.json({ ok: false, error: "This site has not been connected to Reggie yet." }, { status: 409 });
  }

  const params = new URLSearchParams();
  req.nextUrl.searchParams.forEach((value, key) => {
    if (allowedParams.has(key)) params.set(key, value);
  });
  try {
    const response = await fetch(`${settings.url}/v1/sites/${encodeURIComponent(settings.siteId)}/catalog?${params}`, {
      headers: { Authorization: `Bearer ${settings.token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    return NextResponse.json(await response.json().catch(() => ({})), { status: response.status });
  } catch {
    return NextResponse.json({ ok: false, error: "The PoopSites library is temporarily unavailable." }, { status: 502 });
  }
}
