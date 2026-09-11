import { getReggieConnection } from "@/lib/reggie-connection";

export async function requestOwnerEmailAccess(email: string) {
  return ownerAccessRequest("request", { email });
}

export async function claimOwnerEmailAccess(token: string) {
  return ownerAccessRequest("claim", { token });
}

export async function finalizeOwnerEmailAccess(token: string, claimToken: string) {
  return ownerAccessRequest("finalize", { token, claimToken });
}

export async function releaseOwnerEmailAccess(token: string, claimToken: string) {
  return ownerAccessRequest("release", { token, claimToken });
}

async function ownerAccessRequest(action: "request" | "claim" | "finalize" | "release", body: Record<string, string>) {
  const connection = await getReggieConnection();
  if (!connection.siteId || !connection.token) return { ok: false, status: 503, error: "This dashboard is not connected to REGGIE yet." };
  try {
    const response = await fetch(`${connection.url}/v1/sites/${encodeURIComponent(connection.siteId)}/owner-access/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Reggie-Site-Key": connection.token },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({})) as { ok?: boolean; error?: string; message?: string; claimToken?: string };
    return { ok: response.ok && payload.ok === true, status: response.status, error: payload.error, message: payload.message, claimToken: payload.claimToken };
  } catch {
    return { ok: false, status: 502, error: "REGGIE could not be reached. Try again in a moment." };
  }
}
