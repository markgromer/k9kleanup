"use client";

import { useEffect } from "react";
import { landingAttributionCookie, landingAttributionLifetime, normalizeLandingAttribution, readLandingAttribution } from "@/lib/landing-attribution";

/** Mount once per offer page; mark its conversion links/buttons data-reggie-cta. */
export function LandingJourney({ offerId, offer }: { offerId: string; offer: string }) {
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    if (query.has("reggieLens") || query.has("reggiePreview") || process.env.NEXT_PUBLIC_REGGIE_PREVIEW === "true") return;
    const previous = readLandingAttribution(document.cookie);
    const attribution = normalizeLandingAttribution({
      journeyId: previous?.journeyId || crypto.randomUUID(), offerId, offer,
      landingPath: window.location.pathname.replace(/\/$/, ""),
      source: query.get("utm_source") || (previous?.offerId === offerId ? previous.source : ""),
      medium: query.get("utm_medium") || (previous?.offerId === offerId ? previous.medium : ""),
      campaign: query.get("utm_campaign") || (previous?.offerId === offerId ? previous.campaign : ""),
      startedAt: Date.now(),
    });
    if (!attribution) return;
    document.cookie = `${landingAttributionCookie}=${encodeURIComponent(JSON.stringify(attribution))}; Path=/; Max-Age=${landingAttributionLifetime}; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    const record = (stage: "visit" | "cta") => {
      void fetch("/api/analytics/journey", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stage, attribution }), keepalive: true }).catch(() => undefined);
    };
    record("visit");
    const click = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest("[data-reggie-cta]")) record("cta");
    };
    document.addEventListener("click", click);
    return () => document.removeEventListener("click", click);
  }, [offerId, offer]);
  return null;
}
