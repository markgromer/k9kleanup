import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth, unauthorizedResponse } from "@/lib/admin-auth";
import { getReggieConnection } from "@/lib/reggie-connection";

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function PUT(req: NextRequest) {
  if (!(await checkAdminAuth(req))) return unauthorizedResponse();
  const settings = await getReggieConnection();
  if (!settings.siteId || !settings.token) return json({ ok: false, error: "This site has not been connected to Reggie yet." }, 409);
  const requestId = req.nextUrl.searchParams.get("requestId")?.trim() || "";
  if (!/^devreq_[a-z0-9_]+$/.test(requestId)) return json({ ok: false, error: "Development request not found." }, 404);
  try {
    const response = await fetch(`${settings.url}/v1/sites/${encodeURIComponent(settings.siteId)}/development-requests/${encodeURIComponent(requestId)}/assets`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${settings.token}`,
        "Content-Type": req.headers.get("Content-Type") || "application/octet-stream",
        "X-File-Name": req.headers.get("X-File-Name") || "supporting-file",
      },
      body: await req.arrayBuffer(),
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    return json(await response.json().catch(() => ({})), response.status);
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "TimeoutError";
    return json({ ok: false, retryable: true, error: "The file could not be attached right now. Try again in a moment." }, timedOut ? 504 : 502);
  }
}
