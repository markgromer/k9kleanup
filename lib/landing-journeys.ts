import { requireAdminDatabase } from "@/lib/admin-platform";
import { normalizeLandingAttribution } from "@/lib/landing-attribution";

export type LandingJourneyStage = "visit" | "cta" | "quote" | "lead" | "signup";

export async function recordLandingJourney(value: unknown, stage: LandingJourneyStage, quoteId = "") {
  const attribution = normalizeLandingAttribution(value);
  if (!attribution) return;
  const database = await requireAdminDatabase();
  // The ID makes retries, repeat price requests, and React effect replay idempotent.
  const id = `landing:${attribution.journeyId}:${attribution.offerId}:${stage}`;
  await database.prepare(`INSERT OR IGNORE INTO reggie_analytics_events
    (id, event_name, path, referrer, source, medium, campaign, value, metadata_json, occurred_at)
    VALUES (?1, ?2, ?3, '', ?4, ?5, ?6, NULL, ?7, ?8)`)
    .bind(id, `landing_${stage}`, attribution.landingPath, attribution.source, attribution.medium, attribution.campaign,
      JSON.stringify({ ...attribution, sessionId: attribution.journeyId, quoteId: quoteId.slice(0, 100) }), new Date().toISOString()).run();
}

export async function getLandingJourneySummary(days = 30) {
  const database = await requireAdminDatabase();
  const rangeDays = [7, 30, 90].includes(days) ? days : 30;
  const since = new Date(Date.now() - rangeDays * 86400000).toISOString();
  const rows = await database.prepare(`SELECT path, json_extract(metadata_json, '$.offerId') AS offer_id,
    MAX(json_extract(metadata_json, '$.offer')) AS offer,
    SUM(CASE WHEN event_name = 'landing_visit' THEN 1 ELSE 0 END) AS visits,
    SUM(CASE WHEN event_name = 'landing_cta' THEN 1 ELSE 0 END) AS clicks,
    SUM(CASE WHEN event_name = 'landing_quote' THEN 1 ELSE 0 END) AS quotes,
    SUM(CASE WHEN event_name = 'landing_lead' THEN 1 ELSE 0 END) AS leads,
    SUM(CASE WHEN event_name = 'landing_signup' THEN 1 ELSE 0 END) AS signups
    FROM reggie_analytics_events WHERE occurred_at >= ?1 AND id LIKE 'landing:%'
    GROUP BY path, offer_id ORDER BY leads DESC, visits DESC LIMIT 250`).bind(since).all();
  return { rangeDays, offers: rows.results.map((row) => ({ path: String(row.path), offerId: String(row.offer_id), offer: String(row.offer || ""), visits: Number(row.visits), clicks: Number(row.clicks), quotes: Number(row.quotes), leads: Number(row.leads), signups: Number(row.signups) })) };
}
