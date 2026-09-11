import { NextRequest, NextResponse } from "next/server";

import { ADMIN_SESSION_COOKIE, checkAdminAuth, clearAdminLoginAttempts, consumeAdminLoginAttempt, createAdminSession } from "@/lib/admin-auth";

const baseCookie = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

export async function GET(req: NextRequest) {
  if (!(await checkAdminAuth(req))) {
    return NextResponse.json({ ok: false, authenticated: false }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json({ ok: true, authenticated: true }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: NextRequest) {
  const attemptAllowed = await consumeAdminLoginAttempt(req);
  if (attemptAllowed === null) {
    return NextResponse.json({ ok: false, authenticated: false, error: "Dashboard authentication storage is not ready." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  if (!attemptAllowed) {
    return NextResponse.json({ ok: false, authenticated: false, error: "Too many sign-in attempts. Wait 15 minutes and try again." }, { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": "900" } });
  }
  const body = await req.json().catch(() => null) as { password?: unknown } | null;
  const session = await createAdminSession(String(body?.password ?? ""));
  if (!session) {
    return NextResponse.json({ ok: false, authenticated: false, error: "That dashboard password was not accepted." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  await clearAdminLoginAttempts(req);
  const response = NextResponse.json({ ok: true, authenticated: true, role: session.role }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set(ADMIN_SESSION_COOKIE, session.token, { ...baseCookie, maxAge: session.maxAge });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true, authenticated: false }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set(ADMIN_SESSION_COOKIE, "", { ...baseCookie, expires: new Date(0), maxAge: 0 });
  return response;
}
