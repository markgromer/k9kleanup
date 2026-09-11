import { getIntegrationConnection } from "@/lib/admin-platform";

const DEFAULT_API_BASE = "https://api.openphone.com/v1";

export type OpenPhoneCredentials = { apiKey: string; phoneNumberId: string };

export async function getOpenPhoneReadiness() {
  const connection = await getIntegrationConnection("openphone").catch(() => null);
  const credentials = connection ? credentialsFrom(connection.values) : null;
  return { ready: Boolean(connection?.enabled && credentials), credentials };
}

export async function sendTransactionalSms(to: string, content: string) {
  const readiness = await getOpenPhoneReadiness();
  if (!readiness.ready || !readiness.credentials) throw new Error("OpenPhone SMS is not configured.");
  return sendOpenPhoneSms(readiness.credentials, to, content);
}

export async function sendOpenPhoneSms(credentials: OpenPhoneCredentials, to: string, content: string) {
  const recipient = normalizePhone(to);
  const message = content.trim().slice(0, 1200);
  if (!recipient || !message) throw new Error("A valid SMS recipient and message are required.");
  const apiBase = validApiBase(process.env.OPENPHONE_API_BASE ?? DEFAULT_API_BASE);
  const sender = credentials.phoneNumberId.startsWith("+")
    ? { from: credentials.phoneNumberId }
    : { phoneNumberId: credentials.phoneNumberId };
  let response: Response;
  try {
    response = await fetch(`${apiBase}/messages`, {
      method: "POST",
      headers: { Authorization: credentials.apiKey, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ content: message, ...sender, to: [recipient], setInboxStatus: "done" }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error("OpenPhone is temporarily unavailable.");
  }
  const data = await response.json().catch(() => ({})) as { message?: unknown; data?: { id?: unknown } };
  if (!response.ok) throw new Error(typeof data.message === "string" ? data.message.slice(0, 240) : "OpenPhone could not send the message.");
  return { providerMessageId: typeof data.data?.id === "string" ? data.data.id.slice(0, 200) : "" };
}

function credentialsFrom(values: Record<string, string>) {
  const apiKey = String(values.apiKey ?? "").trim();
  const phoneNumberId = String(values.phoneNumberId ?? "").trim();
  return apiKey && phoneNumberId ? { apiKey, phoneNumberId } : null;
}
function normalizePhone(value: string) { const digits = value.replace(/\D/g, ""); const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits; return national.length === 10 ? `+1${national}` : ""; }
function validApiBase(value: string) { const url = new URL(value); if (url.protocol !== "https:" || (url.hostname !== "api.openphone.com" && process.env.NODE_ENV === "production")) throw new Error("OpenPhone API URL is invalid."); return url.toString().replace(/\/$/, ""); }
