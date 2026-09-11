import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth, unauthorizedResponse } from "@/lib/admin-auth";
import { getReggieConnection } from "@/lib/reggie-connection";

async function forward(req: NextRequest) {
  if (!(await checkAdminAuth(req))) return unauthorizedResponse();
  const settings = await getReggieConnection();
  if (!settings.siteId || !settings.token) return NextResponse.json({ ok: false, error: "This site has not been connected to Reggie yet." }, { status: 409 });
  const feedbackId = req.nextUrl.searchParams.get("feedbackId")?.trim() || "";
  const assetId = req.nextUrl.searchParams.get("assetId")?.trim() || "";
  if ((feedbackId && !/^feedback_[a-z0-9_]+$/.test(feedbackId)) || (assetId && !/^feedback_asset_[a-f0-9]+$/.test(assetId))) {
    return NextResponse.json({ ok: false, error: "A valid feedback record is required." }, { status: 400 });
  }
  if (assetId && !feedbackId) return NextResponse.json({ ok: false, error: "A screenshot requires its feedback record." }, { status: 400 });
  const base = `${settings.url}/v1/sites/${encodeURIComponent(settings.siteId)}/feedback`;
  const endpoint = assetId ? `${base}/${feedbackId}/assets/${assetId}` : feedbackId ? `${base}/${feedbackId}${req.method === "PUT" ? "/assets" : ""}` : base;
  const body = req.method === "POST" || req.method === "PUT" ? await req.arrayBuffer() : undefined;
  try {
    const response = await fetch(endpoint, {
      method: req.method,
      headers: {
        Authorization: `Bearer ${settings.token}`,
        ...(body ? { "Content-Type": req.headers.get("Content-Type") || "application/octet-stream" } : {}),
        ...(req.headers.get("Idempotency-Key") ? { "Idempotency-Key": req.headers.get("Idempotency-Key") as string } : {}),
        ...(req.headers.get("X-File-Name") ? { "X-File-Name": req.headers.get("X-File-Name") as string } : {}),
      },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    const contentType = response.headers.get("Content-Type") || "application/json; charset=utf-8";
    return new NextResponse(response.body, { status: response.status, headers: {
      "Content-Type": contentType,
      "Cache-Control": contentType.startsWith("image/") ? "private, no-store" : "no-store",
      "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "TimeoutError";
    return NextResponse.json({ ok: false, retryable: true, error: "Reggie feedback is temporarily unavailable. Your report has not been cleared from the form." }, { status: timedOut ? 504 : 502 });
  }
}

export async function GET(req: NextRequest) { return forward(req); }
export async function POST(req: NextRequest) { return forward(req); }
export async function PUT(req: NextRequest) { return forward(req); }
