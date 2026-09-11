import { NextRequest, NextResponse } from "next/server";

import { ADMIN_SESSION_COOKIE, createAdminSession, setOwnerPasswordFromEmail } from "@/lib/admin-auth";
import { claimOwnerEmailAccess, finalizeOwnerEmailAccess, releaseOwnerEmailAccess, requestOwnerEmailAccess } from "@/lib/owner-email-access";

const baseCookie = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/" };

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { email?: unknown } | null;
  const result = await requestOwnerEmailAccess(String(body?.email ?? ""));
  return NextResponse.json(result.ok ? { ok: true, message: result.message } : { ok: false, error: result.error }, { status: result.status, headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null) as { token?: unknown; password?: unknown } | null;
  const token = String(body?.token ?? "").trim();
  const password = String(body?.password ?? "");
  if (password.trim().length < 10) return NextResponse.json({ ok: false, error: "Use at least 10 characters for your dashboard password." }, { status: 400 });
  const authorization = await claimOwnerEmailAccess(token);
  if (!authorization.ok || !authorization.claimToken) return NextResponse.json({ ok: false, error: authorization.error }, { status: authorization.status, headers: { "Cache-Control": "no-store" } });
  const changed = await setOwnerPasswordFromEmail(password);
  if (!changed.ok) {
    await releaseOwnerEmailAccess(token, authorization.claimToken);
    return NextResponse.json({ ok: false, error: changed.error }, { status: changed.status, headers: { "Cache-Control": "no-store" } });
  }
  const finalized = await finalizeOwnerEmailAccess(token, authorization.claimToken);
  if (!finalized.ok) return NextResponse.json({ ok: false, error: "Your password was set, but the secure link could not be finalized. Sign in with the new password." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  const session = await createAdminSession(password);
  if (!session) return NextResponse.json({ ok: false, error: "Your password was set, but the dashboard session could not start. Sign in with the new password." }, { status: 503 });
  const response = NextResponse.json({ ok: true, authenticated: true }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set(ADMIN_SESSION_COOKIE, session.token, { ...baseCookie, maxAge: session.maxAge });
  return response;
}
