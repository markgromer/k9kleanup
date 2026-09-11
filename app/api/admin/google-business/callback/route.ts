import { NextRequest, NextResponse } from "next/server";
import { getIntegrationConnection, readAdminSetting, saveIntegration, writeAdminSetting } from "@/lib/admin-platform";

export async function GET(req: NextRequest) {
  const url = new URL(req.url); const state = url.searchParams.get("state") || ""; const code = url.searchParams.get("code") || "";
  try {
    const saved = await readAdminSetting<{ redirectUri?: string; expiresAt?: number }>(`google-business-oauth:${state}`, {});
    if (!state || !code || !saved.redirectUri || Number(saved.expiresAt) < Date.now()) throw new Error("The Google connection expired. Please try again.");
    await writeAdminSetting(`google-business-oauth:${state}`, { used: true, expiresAt: 0 });
    const connection = await getIntegrationConnection("google-business-profile");
    const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: connection.values.clientId, client_secret: connection.values.clientSecret, code, redirect_uri: saved.redirectUri, grant_type: "authorization_code" }) });
    const token = await response.json() as { refresh_token?: string; error_description?: string };
    if (!response.ok || !token.refresh_token) throw new Error(token.error_description || "Google did not return offline access. Remove REGGIE from Google account access and reconnect.");
    await saveIntegration("google-business-profile", { enabled: true, values: { ...connection.values, refreshToken: token.refresh_token } });
    return NextResponse.redirect(new URL("/admin/reviews?google=connected", req.url));
  } catch (error) { return NextResponse.redirect(new URL(`/admin/reviews?google=error&message=${encodeURIComponent(error instanceof Error ? error.message : "Connection failed")}`, req.url)); }
}
