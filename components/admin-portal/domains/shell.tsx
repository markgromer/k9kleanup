"use client";

import { default as styles } from "../AdminPortal.module.css";
import { Analytics } from "./analytics";
import { ContentEditor } from "./content";
import { Integrations } from "./integrations";
import { MediaLibrary } from "./media";
import { AdminPortalMode, DashboardData, JsonRecord, QuoteSettings, modeTitles } from "./model";
import { QuoteWorkspace } from "./quote";
import { Rankings, SeoEditor } from "./seo";
import { SimpleRows, formatDate } from "./ui";
import { adminApiUrl } from "@/lib/admin-api-client";
import { clearSavedAdminPassword, readSavedAdminPassword, saveAdminPassword } from "@/lib/admin-auth-client";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

export function AdminPortal({ mode }: { mode: AdminPortalMode }) {
  const [password, setPassword] = useState(() => readSavedAdminPassword());
  const [authed, setAuthed] = useState(() => Boolean(readSavedAdminPassword()));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [payload, setPayload] = useState<JsonRecord>({});
  const title = modeTitles[mode];

  const endpoint = useMemo(() => {
    if (mode === "dashboard") return "/api/admin/dashboard";
    if (mode === "quote") return "/api/admin/quote-settings";
    if (mode === "landing-pages") return "/api/admin/content?type=landing-page";
    if (mode === "blog-posts") return "/api/admin/content?type=blog-post";
    return `/api/admin/${mode}`;
  }, [mode]);

  const request = useCallback(async (path: string, init: RequestInit = {}, token = password) => {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    const response = await fetch(adminApiUrl(path), { ...init, headers, cache: "no-store" });
    const data = await response.json().catch(() => ({})) as JsonRecord;
    if (!response.ok || data.ok === false) throw new Error(String(data.error ?? "The admin request failed."));
    return data;
  }, [password]);

  const load = useCallback(async (token = password) => {
    const data = await request(endpoint, {}, token);
    setPayload(data);
  }, [endpoint, password, request]);

  const authenticate = useCallback(async (token: string) => {
    const dashboard = await request("/api/admin/dashboard", {}, token);
    saveAdminPassword(token);
    setAuthed(true);
    if (mode === "dashboard") {
      setPayload(dashboard);
      return;
    }
    try { await load(token); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "This admin section is not ready."); }
  }, [load, mode, request]);

  useEffect(() => {
    const saved = readSavedAdminPassword();
    if (!saved) return;
    setPassword(saved);
    setLoading(true);
    void load(saved)
      .catch((reason) => setError(reason instanceof Error ? reason.message : "This admin section could not load."))
      .finally(() => setLoading(false));
  }, [load]);

  async function login(event: FormEvent) {
    event.preventDefault();
    setLoading(true); setError("");
    try {
      await authenticate(password);
    } catch (reason) {
      clearSavedAdminPassword();
      setError(reason instanceof Error ? reason.message : "Could not sign in.");
    } finally { setLoading(false); }
  }

  const run = useCallback(async (action: () => Promise<void>, success: string) => {
    setLoading(true); setError(""); setMessage("");
    try { await action(); setMessage(success); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "The request failed."); }
    finally { setLoading(false); }
  }, []);

  if (!authed) {
    return (
      <main className={styles.page}>
        <section className={styles.loginPanel}>
          <p className={styles.eyebrow}>ADMIN ACCESS</p>
          <h1>Sign in</h1>
          <form onSubmit={login} className={styles.stack}>
            <label>Admin password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /></label>
            <button className={styles.primaryButton} disabled={loading}>{loading ? "Signing in..." : "Continue"}</button>
          </form>
          {error ? <p className={styles.error}>{error}</p> : null}
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div><p className={styles.eyebrow}>{title.eyebrow}</p><h1>{title.title}</h1></div>
        <button className={styles.secondaryButton} disabled={loading} onClick={() => void run(() => load(), "Data refreshed.")}>Refresh</button>
      </header>
      {message ? <p className={styles.success}>{message}</p> : null}
      {error ? <p className={styles.error}>{error}</p> : null}
      {mode === "dashboard" ? <Dashboard payload={payload} /> : null}
      {mode === "quote" ? <QuoteWorkspace payload={payload} request={request} reload={load} run={run} /> : null}
      {mode === "analytics" ? <Analytics payload={payload} request={request} setPayload={setPayload} /> : null}
      {mode === "seo" ? <SeoEditor payload={payload} request={request} reload={load} run={run} /> : null}
      {mode === "rankings" ? <Rankings payload={payload} request={request} reload={load} run={run} /> : null}
      {mode === "landing-pages" || mode === "blog-posts" ? <ContentEditor type={mode === "landing-pages" ? "landing-page" : "blog-post"} payload={payload} request={request} reload={load} run={run} /> : null}
      {mode === "media" ? <MediaLibrary payload={payload} request={request} reload={load} run={run} /> : null}
      {mode === "integrations" ? <Integrations payload={payload} request={request} reload={load} run={run} /> : null}
    </main>
  );
}

export function Dashboard({ payload }: { payload: JsonRecord }) {
  const dashboard = (payload.dashboard ?? {}) as DashboardData;
  const counts = dashboard.counts ?? {};
  const stats = [
    ["Landing pages", counts.landingPages ?? 0], ["Blog posts", counts.blogPosts ?? 0],
    ["SEO pages", counts.seoPages ?? 0], ["Tracked keywords", counts.trackedKeywords ?? 0],
    ["Media assets", counts.mediaAssets ?? 0], ["Events, 30 days", counts.events30d ?? 0],
  ];
  return <>
    <section className={styles.statGrid}>{stats.map(([label, value]) => <div className={styles.stat} key={String(label)}><span>{label}</span><strong>{value}</strong></div>)}</section>
    <section className={styles.twoColumn}>
      <div className={styles.panel}><div className={styles.panelHeader}><h2>Platform health</h2></div><div className={styles.healthList}>
        <HealthRow label="Structured data" ready={dashboard.health?.database} />
        <HealthRow label="Media storage" ready={dashboard.health?.media} />
        <HealthRow label="Credential encryption" ready={dashboard.health?.encryption} />
      </div></div>
      <div className={styles.panel}><div className={styles.panelHeader}><h2>Top pages</h2></div><SimpleRows rows={(dashboard.topPages ?? []).map((item) => [item.path, item.count])} empty="No analytics events yet." /></div>
    </section>
    <section className={styles.panel}><div className={styles.panelHeader}><h2>Recent content</h2></div><SimpleRows rows={(dashboard.recentContent ?? []).map((item) => [item.title, item.status, formatDate(item.updatedAt)])} empty="No content records yet." /></section>
  </>;
}

export function HealthRow({ label, ready }: { label: string; ready?: boolean }) {
  return <div className={styles.healthRow}><span>{label}</span><strong className={ready ? styles.good : styles.warn}>{ready ? "Ready" : "Needs setup"}</strong></div>;
}

export const quoteRequiredDefaults: QuoteSettings["requiredFields"] = {
  firstName: false, lastName: false, email: false, phone: true, smsConsent: true, zipCode: true, numberOfDogs: true, frequency: true, lastCleaned: true, yardSize: false, address: false,
};

export const quoteFlowDefaults: QuoteSettings["quoteFlow"] = {
  entryStep: "zip", introButtonText: "Get Price", introPlaceholder: "Your ZIP code or street address", loaderMessage: "Creating your personalized quote...", loaderMinTime: 1000, gateQuoteBehindContact: true, showPriceBeforeAddress: true, requireServiceAreaBeforePrice: true, allowCoupon: true, allowAddons: true, allowQuestions: true, enableYardMap: true, showProgress: true,
};

export const quoteDisplayDefaults: QuoteSettings["quoteDisplay"] = {
  style: "price-card", showPerVisitPrice: true, showMonthlyPrice: true, showSavingsMessage: true, showQuoteExpiration: true, primaryCta: "Get Started", secondaryCta: "Ask a Question", disclaimer: "Final pricing may change if yard conditions are different from the quote details.",
};

export const quoteDesignDefaults: QuoteSettings["design"] = {
  fontFamily: "Inter, Arial, sans-serif", headingFontFamily: "Inter, Arial, sans-serif", baseFontSize: 16, panelBg: "#f4f7f4", textColor: "#13221c", mutedColor: "#5a685f", accentColor: "#0f766e", ctaBg: "#0f766e", ctaText: "#ffffff", inputBg: "#ffffff", inputBorder: "#b9c3bd", quoteBg: "#ffffff", cardBorder: "#d4dad6", priceColor: "#0f4c44", cardRadius: 16, inputRadius: 8, buttonRadius: 8, cardShadow: "md", maxWidth: 520, customCss: "",
};

export const quoteConversionDefaults: QuoteSettings["conversionFlow"] = {
  mode: "crm-handoff", requireDeposit: false, collectAddress: true, collectYardMap: false, successMessage: "Thanks. We received your quote and will help get service started.", redirectUrl: "",
};
