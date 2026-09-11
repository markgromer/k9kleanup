import { adminApiUrl } from "@/lib/admin-api-client";

const adminSessionMarker = "cookie-session";
let adminSessionReady = false;

export function readSavedAdminPassword() {
  return typeof window !== "undefined" && adminSessionReady ? adminSessionMarker : "";
}

export function saveAdminPassword(_password?: string) {
  void _password;
  adminSessionReady = true;
  removeLegacyPassword();
}

export async function restoreAdminSession() {
  removeLegacyPassword();
  const response = await fetch(adminApiUrl("/api/admin/session"), {
    credentials: "include",
    cache: "no-store",
  });
  adminSessionReady = response.ok;
  return adminSessionReady;
}

export async function createAdminSession(password: string) {
  const response = await fetch(adminApiUrl("/api/admin/session"), {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  const payload = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "That dashboard password was not accepted.");
  adminSessionReady = true;
  removeLegacyPassword();
}

export async function requestDashboardAccessEmail(email: string) {
  const response = await fetch(adminApiUrl("/api/admin/email-access"), {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  const payload = await response.json().catch(() => ({})) as { error?: string; message?: string };
  if (!response.ok) throw new Error(payload.error ?? "The access email could not be sent.");
  return payload.message ?? "If that email is authorized for this brand, a secure link is on its way.";
}

export async function setDashboardPasswordFromEmail(token: string, password: string) {
  const response = await fetch(adminApiUrl("/api/admin/email-access"), {
    method: "PATCH",
    credentials: "include",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, password }),
  });
  const payload = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "The secure link could not be used.");
  adminSessionReady = true;
  removeLegacyPassword();
}

export function clearSavedAdminPassword() {
  adminSessionReady = false;
  removeLegacyPassword();
  if (typeof window !== "undefined") {
    void fetch(adminApiUrl("/api/admin/session"), {
      method: "DELETE",
      credentials: "include",
      cache: "no-store",
      keepalive: true,
    });
  }
}

function removeLegacyPassword() {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem("reggie:admin-password");
  localStorage.removeItem("reggie:admin-password");
}
