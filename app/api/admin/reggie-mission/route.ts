import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth, unauthorizedResponse } from "@/lib/admin-auth";
import { getReggieConnection } from "@/lib/reggie-connection";

export async function POST(req: NextRequest) {
  if (!(await checkAdminAuth(req))) return unauthorizedResponse();
  const retryMissionId = req.nextUrl.searchParams.get("retryMissionId")?.trim() || "";
  const settings = await getReggieConnection();
  if (!settings.siteId || !settings.token) return NextResponse.json({ ok: false, error: "This site has not been connected to Reggie yet." }, { status: 409 });
  const previewMissionId = req.nextUrl.searchParams.get("previewMissionId") || "";
  if (previewMissionId) {
    if (!/^mission_[a-z0-9_]+$/.test(previewMissionId)) return NextResponse.json({ ok: false, error: "Invalid revision." }, { status: 400 });
    try {
      const response = await fetch(`${settings.url}/v1/sites/${encodeURIComponent(settings.siteId)}/missions/${previewMissionId}/preview-access`, { method: "POST", headers: { Authorization: `Bearer ${settings.token}` }, cache: "no-store", signal: AbortSignal.timeout(30_000) });
      return NextResponse.json(await response.json(), { status: response.status, headers: { "Cache-Control": "no-store" } });
    } catch (error) { return hubFailure(error, "The draft could not be opened. Refresh the revision and try again."); }
  }
  if (/^mission_[a-z0-9_]+$/.test(retryMissionId)) {
    try {
      const response = await fetch(`${settings.url}/v1/sites/${encodeURIComponent(settings.siteId)}/missions/${encodeURIComponent(retryMissionId)}/retry`, {
        method: "POST",
        headers: { Authorization: `Bearer ${settings.token}` },
        cache: "no-store",
        signal: AbortSignal.timeout(30_000),
      });
      const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
      if (!response.ok && !payload.error) payload.error = "Reggie could not queue the retry. Refresh the mission before trying again.";
      return NextResponse.json(payload, { status: response.status, headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      return hubFailure(error, "Reggie could not queue the retry. Refresh the mission and try again.");
    }
  }
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const prompt = String(body.prompt ?? "").trim();
  if (prompt.length < 12) return NextResponse.json({ ok: false, error: "Please describe the change in a little more detail." }, { status: 400 });
  try {
    const idempotencyKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim() : "";
    const response = await fetch(`${settings.url}/v1/sites/${encodeURIComponent(settings.siteId)}/missions`, { method: "POST", headers: { Authorization: `Bearer ${settings.token}`, "Content-Type": "application/json", ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}) }, body: JSON.stringify(body), cache: "no-store", signal: AbortSignal.timeout(30_000) });
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok && !payload.error) payload.error = "Reggie could not accept this request. Try again in a moment.";
    return NextResponse.json(payload, { status: response.status });
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "TimeoutError";
    return NextResponse.json({ ok: false, error: timedOut ? "Reggie took too long to respond. Try again; your saved changes are still here." : "Reggie is temporarily unavailable. Try again; your saved changes are still here." }, { status: timedOut ? 504 : 502 });
  }
}

export async function GET(req: NextRequest) {
  if (!(await checkAdminAuth(req))) return unauthorizedResponse();
  const settings = await getReggieConnection();
  if (!settings.siteId || !settings.token) return NextResponse.json({ ok: true, jobs: [] });
  const assetMissionId = req.nextUrl.searchParams.get("assetMissionId")?.trim() || "";
  const assetPath = req.nextUrl.searchParams.get("assetPath")?.trim() || "";
  if (assetMissionId || assetPath) {
    if (!/^mission_[a-z0-9_]+$/.test(assetMissionId) || !assetPath) return NextResponse.json({ ok: false, error: "A valid mission and screenshot path are required." }, { status: 400 });
    try {
      const response = await fetch(`${settings.url}/v1/sites/${encodeURIComponent(settings.siteId)}/missions/${encodeURIComponent(assetMissionId)}/review-assets?path=${encodeURIComponent(assetPath)}`, {
        headers: { Authorization: `Bearer ${settings.token}` },
        cache: "no-store",
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) return NextResponse.json(await response.json().catch(() => ({ ok: false, error: "Review asset is not available. Refresh its evidence status or open the mission run." })), { status: response.status, headers: { "Cache-Control": "no-store" } });
      const contentType = response.headers.get("Content-Type") || "";
      if (!contentType.toLowerCase().startsWith("image/")) return NextResponse.json({ ok: false, error: "The review asset service returned a non-image response." }, { status: 502, headers: { "Cache-Control": "no-store" } });
      return new NextResponse(response.body, {
        status: 200,
        headers: { "Content-Type": contentType, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
      });
    } catch (error) {
      return hubFailure(error, "The screenshot could not be loaded. Retry the image or open the mission run.");
    }
  }
  try {
    const refresh = req.nextUrl.searchParams.get("refresh") === "1" ? "?refresh=1" : "";
    const response = await fetch(`${settings.url}/v1/sites/${encodeURIComponent(settings.siteId)}/missions${refresh}`, { headers: { Authorization: `Bearer ${settings.token}` }, cache: "no-store", signal: AbortSignal.timeout(30_000) });
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok && !payload.error) payload.error = "Reggie mission status could not be loaded.";
    return NextResponse.json(payload, { status: response.status, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return hubFailure(error, "Reggie mission status could not be loaded. Try refreshing in a moment.");
  }
}

export async function PATCH(req: NextRequest) {
  if (!(await checkAdminAuth(req))) return unauthorizedResponse();
  const settings = await getReggieConnection();
  if (!settings.siteId || !settings.token) return NextResponse.json({ ok: false, error: "This site has not been connected to Reggie yet." }, { status: 409 });
  const body = await req.json().catch(() => ({}));
  try {
    const response = await fetch(`${settings.url}/v1/sites/${encodeURIComponent(settings.siteId)}/missions`, { method: "PATCH", headers: { Authorization: `Bearer ${settings.token}`, "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store", signal: AbortSignal.timeout(30_000) });
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok && !payload.error) payload.error = "Reggie could not update this mission. Refresh its status before trying again.";
    return NextResponse.json(payload, { status: response.status, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return hubFailure(error, "Reggie could not update this mission. Refresh its status before trying again.");
  }
}

function hubFailure(error: unknown, message: string) {
  const timedOut = error instanceof DOMException && error.name === "TimeoutError";
  return NextResponse.json({ ok: false, retryable: true, error: timedOut ? `${message} The request timed out.` : message }, { status: timedOut ? 504 : 502, headers: { "Cache-Control": "no-store" } });
}
