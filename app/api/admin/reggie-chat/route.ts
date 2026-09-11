import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth, unauthorizedResponse } from "@/lib/admin-auth";
import { getReggieConnection } from "@/lib/reggie-connection";

async function forward(req: NextRequest) {
  if (!(await checkAdminAuth(req))) return unauthorizedResponse();
  const settings = await getReggieConnection();
  if (!settings.siteId || !settings.token) return NextResponse.json({ ok: false, error: "This site has not been connected to Reggie yet." }, { status: 409 });
  const conversationId = req.nextUrl.searchParams.get("conversationId")?.trim() || "";
  const endpoint = `${settings.url}/v1/sites/${encodeURIComponent(settings.siteId)}/conversations${conversationId ? `?conversationId=${encodeURIComponent(conversationId)}` : ""}`;
  try {
    const body = req.method === "POST" ? await req.text() : undefined;
    const parsed = body ? safeJson(body) : {};
    if (typeof parsed.message === "string") await refreshSiteContext(req);
    const response = await fetch(endpoint, {
      method: req.method,
      headers: { Authorization: `Bearer ${settings.token}`, ...(body ? { "Content-Type": "application/json" } : {}), ...(req.headers.get("Idempotency-Key") ? { "Idempotency-Key": req.headers.get("Idempotency-Key") as string } : {}) },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(45_000),
    });
    return NextResponse.json(await response.json().catch(() => ({})), { status: response.status });
  } catch {
    return NextResponse.json({ ok: false, error: "Reggie is temporarily unavailable. Try again in a moment." }, { status: 502 });
  }
}

export async function GET(req: NextRequest) { return forward(req); }
export async function POST(req: NextRequest) { return forward(req); }

function safeJson(value: string) { try { return JSON.parse(value) as Record<string, unknown>; } catch { return {}; } }

async function refreshSiteContext(req: NextRequest) {
  try {
    await fetch(new URL("/api/admin/dashboard-overview", req.url), { headers: { Authorization: req.headers.get("Authorization") || "" }, cache: "no-store", signal: AbortSignal.timeout(10_000) });
  } catch { /* Existing dated context remains available and is labeled with its age. */ }
}
