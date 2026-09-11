import { getIntegrationConnection, readAdminSetting, saveIntegration, writeAdminSetting } from "@/lib/admin-platform";
import { defaultReviewSliderSettings, type GoogleReview, type ReviewSliderSettings, type ReviewWidgetType } from "@/lib/google-review-types";
export type { GoogleReview, ReviewSliderSettings, ReviewWidgetType } from "@/lib/google-review-types";
const SETTINGS_KEY = "google-review-slider";
const REVIEWS_KEY = "google-review-slider:reviews";

export async function getReviewSliderData() {
  const settings = normalizeSettings(await readAdminSetting(SETTINGS_KEY, defaultReviewSliderSettings));
  const snapshot = await readAdminSetting<{ reviews?: GoogleReview[]; averageRating?: number; totalReviewCount?: number; syncedAt?: string }>(REVIEWS_KEY, {});
  return { settings, reviews: Array.isArray(snapshot.reviews) ? snapshot.reviews : [], averageRating: Number(snapshot.averageRating ?? 0), totalReviewCount: Number(snapshot.totalReviewCount ?? 0), syncedAt: String(snapshot.syncedAt ?? "") };
}

export async function saveReviewSliderSettings(input: Record<string, unknown>) {
  const settings = normalizeSettings(input);
  await writeAdminSetting(SETTINGS_KEY, settings);
  return settings;
}

export async function googleAccessToken() {
  const connection = await getIntegrationConnection("google-business-profile");
  const { clientId, clientSecret, refreshToken } = connection.values;
  if (!clientId || !clientSecret || !refreshToken) throw new Error("Connect Google Business Profile before synchronizing reviews.");
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }) });
  const payload = await response.json() as { access_token?: string; error_description?: string };
  if (!response.ok || !payload.access_token) throw new Error(payload.error_description || "Google authorization could not be refreshed.");
  return payload.access_token;
}

export async function listGoogleLocations() {
  const token = await googleAccessToken();
  const accountsResponse = await googleFetch("https://mybusinessaccountmanagement.googleapis.com/v1/accounts", token);
  const accounts = (accountsResponse.accounts ?? []) as Array<{ name?: string; accountName?: string }>;
  const locations: Array<{ name: string; title: string; accountName: string; accountTitle: string }> = [];
  for (const account of accounts) {
    if (!account.name) continue;
    const url = `https://mybusinessbusinessinformation.googleapis.com/v1/${account.name}/locations?readMask=name,title&filter=metadata.hasVoiceOfMerchant%3Dtrue&pageSize=100`;
    const payload = await googleFetch(url, token);
    for (const location of (payload.locations ?? []) as Array<{ name?: string; title?: string }>) if (location.name) locations.push({ name: location.name, title: location.title || "Google Business location", accountName: account.name, accountTitle: account.accountName || account.name });
  }
  return locations;
}

export async function syncGoogleReviews() {
  const token = await googleAccessToken();
  const settings = normalizeSettings(await readAdminSetting(SETTINGS_KEY, defaultReviewSliderSettings));
  if (!settings.locationName) throw new Error("Choose a Google Business location first.");
  const connection = await getIntegrationConnection("google-business-profile");
  const accountId = connection.values.accountId || "";
  const locationId = settings.locationName.replace(/^locations\//, "");
  if (!accountId) throw new Error("The selected location is missing its Google account.");
  const parent = `accounts/${accountId.replace(/^accounts\//, "")}/locations/${locationId}`;
  const payload = await googleFetch(`https://mybusiness.googleapis.com/v4/${parent}/reviews?pageSize=50&orderBy=updateTime%20desc`, token);
  const reviews = ((payload.reviews ?? []) as Array<Record<string, unknown>>).map((review) => {
    const reviewer = (review.reviewer ?? {}) as Record<string, unknown>;
    return { id: String(review.reviewId ?? review.name ?? crypto.randomUUID()), reviewer: String(reviewer.displayName ?? "Google customer"), avatarUrl: String(reviewer.profilePhotoUrl ?? ""), rating: starRating(review.starRating), comment: String(review.comment ?? ""), createdAt: String(review.createTime ?? review.updateTime ?? ""), reviewUrl: String(review.reviewLink ?? "") };
  }).filter((review) => review.rating >= settings.minimumRating && review.comment).slice(0, settings.maximumReviews);
  const snapshot = { reviews, averageRating: Number(payload.averageRating ?? 0), totalReviewCount: Number(payload.totalReviewCount ?? reviews.length), syncedAt: new Date().toISOString() };
  await writeAdminSetting(REVIEWS_KEY, snapshot);
  await saveIntegration("google-business-profile", { enabled: true, values: { accountId: accountId.replace(/^accounts\//, ""), locationId, clientId: "", clientSecret: "", refreshToken: "" } });
  return snapshot;
}

async function googleFetch(url: string, token: string) { const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }); const payload = await response.json() as Record<string, unknown>; if (!response.ok) throw new Error(String((payload.error as { message?: string } | undefined)?.message || "Google Business Profile request failed.")); return payload; }
function starRating(value: unknown) { const labels: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 }; return typeof value === "number" ? value : labels[String(value)] ?? 0; }
function normalizeSettings(value: unknown): ReviewSliderSettings {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {}; const base = defaultReviewSliderSettings;
  const number = (key: string, min: number, max: number) => Math.min(max, Math.max(min, Number(input[key] ?? base[key as keyof ReviewSliderSettings])));
  const bool = (key: keyof ReviewSliderSettings) => input[key] === undefined ? Boolean(base[key]) : Boolean(input[key]);
  const color = (key: "accentColor" | "cardColor" | "textColor") => /^#[0-9a-f]{6}$/i.test(String(input[key] ?? "")) ? String(input[key]) : base[key];
  const widgetTypes: ReviewWidgetType[] = ["carousel", "cards", "masonry", "list", "table", "single", "spotlight", "badge"];
  return { ...base, locationName: String(input.locationName ?? "").slice(0, 200), locationTitle: String(input.locationTitle ?? "").slice(0, 200), enabled: bool("enabled"), minimumRating: number("minimumRating", 1, 5), maximumReviews: number("maximumReviews", 1, 50), heading: String(input.heading ?? base.heading).slice(0, 120), subheading: String(input.subheading ?? base.subheading).slice(0, 200), theme: ["light", "dark", "brand"].includes(String(input.theme)) ? input.theme as ReviewSliderSettings["theme"] : base.theme, accentColor: color("accentColor"), cardColor: color("cardColor"), textColor: color("textColor"), cardRadius: number("cardRadius", 0, 40), autoplay: bool("autoplay"), autoplaySeconds: number("autoplaySeconds", 3, 30), showAvatar: bool("showAvatar"), showDate: bool("showDate"), showGoogleMark: bool("showGoogleMark"), widgetType: widgetTypes.includes(input.widgetType as ReviewWidgetType) ? input.widgetType as ReviewWidgetType : base.widgetType, columns: number("columns", 1, 4), cardGap: number("cardGap", 0, 48), excerptLength: number("excerptLength", 80, 1000), showRatingSummary: bool("showRatingSummary"), showReviewButton: bool("showReviewButton"), reviewButtonLabel: String(input.reviewButtonLabel ?? base.reviewButtonLabel).slice(0, 80), reviewButtonUrl: /^https:\/\//i.test(String(input.reviewButtonUrl ?? "")) ? String(input.reviewButtonUrl).slice(0, 1000) : "", popupEnabled: bool("popupEnabled"), popupPosition: input.popupPosition === "bottom-right" ? "bottom-right" : "bottom-left", popupDelaySeconds: number("popupDelaySeconds", 2, 120), popupIntervalSeconds: number("popupIntervalSeconds", 15, 3600), popupDurationSeconds: number("popupDurationSeconds", 4, 30), popupOncePerSession: bool("popupOncePerSession") };
}
