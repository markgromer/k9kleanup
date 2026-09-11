import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth, unauthorizedResponse } from "@/lib/admin-auth";
import { getIntegrationConnection, writeAdminSetting } from "@/lib/admin-platform";

export async function GET(req: NextRequest) {
  if (!(await checkAdminAuth(req))) return unauthorizedResponse();
  try {
    const connection = await getIntegrationConnection("google-business-profile");
    if (!connection.values.clientId || !connection.values.clientSecret) throw new Error("Add the Google OAuth client ID and secret in Integrations first.");
    const state = crypto.randomUUID(); const redirectUri = new URL("/api/admin/google-business/callback", req.url).toString();
    await writeAdminSetting(`google-business-oauth:${state}`, { redirectUri, expiresAt: Date.now() + 10 * 60 * 1000 });
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({ client_id: connection.values.clientId, redirect_uri: redirectUri, response_type: "code", scope: "https://www.googleapis.com/auth/business.manage", access_type: "offline", prompt: "consent", state }).toString();
    return NextResponse.redirect(url);
  } catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Google connection failed." }, { status: 400 }); }
}
