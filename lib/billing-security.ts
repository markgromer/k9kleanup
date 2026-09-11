export type BillingGateway = "stripe" | "fts" | "none";

export function moneyToCents(value: unknown) {
  const text = clean(value);
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(text)) return 0;
  const negative = text.startsWith("-");
  const [whole, fraction = ""] = text.replace("-", "").split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return negative ? -cents : cents;
}

export function centsToMoney(cents: number) {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new Error("Money must be a non-negative integer number of cents.");
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

export function normalizeGateway(value: unknown): BillingGateway {
  const gateway = clean(value).toLowerCase();
  return gateway === "stripe" || gateway === "fts" ? gateway : "none";
}

export function createOpaquePaymentToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function hashOpaquePaymentToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function containsForbiddenCardFields(value: unknown) {
  const forbidden = /^(?:card_?number|pan|cvv|cvc|expiry|expiration|exp_?(?:month|year)|security_?code)$/i;
  const visit = (item: unknown, depth: number): boolean => {
    if (depth > 4 || !item || typeof item !== "object") return false;
    return Object.entries(item as Record<string, unknown>).some(([key, child]) => forbidden.test(key) || visit(child, depth + 1));
  };
  return visit(value, 0);
}

function clean(value: unknown) { return typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : ""; }
