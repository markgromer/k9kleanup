export const landingAttributionCookie = "reggie_offer_v1";
export const landingAttributionLifetime = 30 * 86400;

export type LandingAttribution = {
  journeyId: string;
  offerId: string;
  offer: string;
  landingPath: string;
  source: string;
  medium: string;
  campaign: string;
  startedAt: number;
};

const boundedText = (value: unknown, limit = 180) => typeof value === "string" ? value.trim().slice(0, limit) : "";

export function normalizeLandingAttribution(value: unknown, now = Date.now()): LandingAttribution | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const journeyId = boundedText(input.journeyId, 80);
  const offerId = boundedText(input.offerId, 120);
  const landingPath = boundedText(input.landingPath, 300);
  const startedAt = Number(input.startedAt);
  if (!/^[a-zA-Z0-9_-]{12,80}$/.test(journeyId) || !/^[a-zA-Z0-9_-]{1,120}$/.test(offerId)) return null;
  if (!/^\/(?!\/)[a-zA-Z0-9/_-]+$/.test(landingPath) || /^\/(admin|api|_next)(\/|$)/i.test(landingPath)) return null;
  if (!Number.isFinite(startedAt) || startedAt > now + 60_000 || now - startedAt > landingAttributionLifetime * 1000) return null;
  return { journeyId, offerId, landingPath, startedAt, offer: boundedText(input.offer), source: boundedText(input.source, 120), medium: boundedText(input.medium, 120), campaign: boundedText(input.campaign) };
}

export function readLandingAttribution(cookieHeader: string | null): LandingAttribution | null {
  const raw = (cookieHeader || "").split(";").map((part) => part.trim()).find((part) => part.startsWith(`${landingAttributionCookie}=`))?.slice(landingAttributionCookie.length + 1);
  if (!raw || raw.length > 5000) return null;
  try { return normalizeLandingAttribution(JSON.parse(decodeURIComponent(raw))); } catch { return null; }
}
