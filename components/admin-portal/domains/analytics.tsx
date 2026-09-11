"use client";

import { default as styles } from "../AdminPortal.module.css";
import { AnalyticsData, IntegrationStatus, JsonRecord } from "./model";
import { ApiRequest, Empty, Field, SimpleRows, Stat, formatDate } from "./ui";
import { useCallback, useEffect, useState } from "react";

export function Analytics({ payload, request, setPayload }: { payload: JsonRecord; request: ApiRequest; setPayload: (value: JsonRecord) => void }) {
  const data = (payload.analytics ?? {}) as AnalyticsData;
  const [days, setDays] = useState(data.rangeDays ?? 30);
  const [connections, setConnections] = useState<IntegrationStatus[]>([]);
  const [connectionLoading, setConnectionLoading] = useState(false);
  const [connectionError, setConnectionError] = useState("");
  const [connectionMessage, setConnectionMessage] = useState("");
  const loadConnections = useCallback(async () => {
    const next = await request("/api/admin/integrations");
    setConnections(((next.integrations ?? []) as IntegrationStatus[]).filter((item) => item.provider === "google-analytics" || item.provider === "google-search-console"));
  }, [request]);
  useEffect(() => {
    void loadConnections().catch((reason) => setConnectionError(reason instanceof Error ? reason.message : "Could not load analytics connections."));
  }, [loadConnections]);
  async function saveConnection(integration: IntegrationStatus, values: Record<string, string>, sync: boolean) {
    setConnectionLoading(true); setConnectionError(""); setConnectionMessage("");
    try {
      const normalized = normalizeAnalyticsConnectionValues(integration.provider, values);
      await request("/api/admin/integrations", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: integration.provider, enabled: true, values: normalized }) });
      if (sync) await request("/api/admin/integrations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: integration.provider }) });
      await loadConnections();
      const next = await request(`/api/admin/analytics?days=${days}`);
      setPayload(next);
      setConnectionMessage(sync ? `${integration.label} saved and synchronized.` : `${integration.label} saved.`);
    } catch (reason) {
      setConnectionError(reason instanceof Error ? reason.message : "Could not save analytics connection.");
    } finally {
      setConnectionLoading(false);
    }
  }
  async function changeRange(value: number) {
    const previousDays = days;
    setConnectionError("");
    try {
      const next = await request(`/api/admin/analytics?days=${value}`);
      setPayload(next);
      setDays(value);
    } catch (reason) {
      setDays(previousDays);
      setConnectionError(reason instanceof Error ? reason.message : "Could not load the selected analytics range.");
    }
  }
  const ga4 = connections.find((item) => item.provider === "google-analytics");
  const searchConsole = connections.find((item) => item.provider === "google-search-console");
  return <>
    <div className={styles.toolbar}><label>Range<select value={days} onChange={(event) => void changeRange(Number(event.target.value))}><option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option></select></label></div>
    <section className={styles.panel}>
      <div className={styles.panelHeader}><div><h2>Google connections</h2><p className={styles.integrationDescription}>Paste the GA4 tag and Search Console domain property. Stored platform credentials are used automatically when they are available.</p></div></div>
      {connectionMessage ? <p className={styles.success}>{connectionMessage}</p> : null}
      {connectionError ? <p className={styles.error}>{connectionError}</p> : null}
      <div className={styles.connectionGrid}>
        {ga4 ? <QuickAnalyticsConnection integration={ga4} disabled={connectionLoading} onSave={saveConnection} /> : <Empty>Google Analytics is not available.</Empty>}
        {searchConsole ? <QuickAnalyticsConnection integration={searchConsole} disabled={connectionLoading} onSave={saveConnection} /> : <Empty>Search Console is not available.</Empty>}
      </div>
    </section>
    <section className={styles.statGrid}><Stat label="Events" value={data.events ?? 0} /><Stat label="Visitors" value={data.visitors ?? 0} /><Stat label="Conversions" value={data.conversions ?? 0} /><Stat label="Conversion rate" value={`${data.events ? ((data.conversions / data.events) * 100).toFixed(1) : "0.0"}%`} /></section>
    <section className={styles.twoColumn}>
      <div className={styles.panel}><div className={styles.panelHeader}><h2>Top pages</h2></div><SimpleRows rows={(data.topPages ?? []).map((item) => [item.path, item.count])} empty="No page views in this range." /></div>
      <div className={styles.panel}><div className={styles.panelHeader}><h2>Traffic sources</h2></div><SimpleRows rows={(data.topSources ?? []).map((item) => [item.source, item.count])} empty="No source data in this range." /></div>
    </section>
    <section className={styles.panel}><div className={styles.panelHeader}><h2>Recent events</h2></div><SimpleRows rows={(data.recentEvents ?? []).map((item) => [item.eventName, item.path, item.source || "Direct", formatDate(item.occurredAt)])} empty="No events collected." /></section>
  </>;
}

export function QuickAnalyticsConnection({ integration, disabled, onSave }: { integration: IntegrationStatus; disabled: boolean; onSave: (integration: IntegrationStatus, values: Record<string, string>, sync: boolean) => Promise<void> }) {
  const [values, setValues] = useState<Record<string, string>>({ ...integration.config });
  useEffect(() => setValues({ ...integration.config }), [integration]);
  const credentialReady = Boolean(integration.maskedSecrets.serviceAccountJson);
  const isGa4 = integration.provider === "google-analytics";
  const primaryField = isGa4
    ? integration.fields.find((field) => field.key === "measurementId")
    : integration.fields.find((field) => field.key === "propertyUrl");
  const propertyField = integration.fields.find((field) => field.key === "propertyId");
  const credentialField = integration.fields.find((field) => field.key === "serviceAccountJson");
  const hasSyncFields = isGa4
    ? Boolean(values.measurementId && values.propertyId && (credentialReady || values.serviceAccountJson))
    : Boolean(values.propertyUrl && (credentialReady || values.serviceAccountJson));
  const status = integration.connectionState === "connected" ? "Reporting connected" : isGa4 && /^G-[A-Z0-9]{4,20}$/i.test(values.measurementId || integration.config.measurementId || "") ? "Tag saved" : integration.configured ? "Saved" : "Not connected";
  return <form className={styles.connectionCard} onSubmit={(event) => { event.preventDefault(); void onSave(integration, values, hasSyncFields); }}>
    <div className={styles.panelHeader}><div><h3>{isGa4 ? "GA4 tag" : "Search Console"}</h3><p className={styles.integrationDescription}>{status}</p></div><strong className={integration.connectionState === "connected" || status === "Tag saved" || status === "Saved" ? styles.good : styles.muted}>{integration.syncState === "error" ? "Needs attention" : status}</strong></div>
    {primaryField ? <Field label={primaryField.label}><input value={values[primaryField.key] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [primaryField.key]: event.target.value }))} placeholder={primaryField.placeholder} autoComplete="off" /></Field> : null}
    {credentialReady ? <p className={styles.integrationDescription}>Reporting credential is already populated.</p> : credentialField ? <details className={styles.advancedFields}><summary>Reporting credential</summary><Field label={credentialField.label}><textarea value={values.serviceAccountJson ?? ""} onChange={(event) => setValues((current) => ({ ...current, serviceAccountJson: event.target.value }))} placeholder="Paste only if platform credentials are not already configured." spellCheck={false} /></Field></details> : null}
    {isGa4 && propertyField ? <details className={styles.advancedFields}><summary>GA4 reporting</summary><Field label={propertyField.label}><input value={values.propertyId ?? ""} onChange={(event) => setValues((current) => ({ ...current, propertyId: event.target.value }))} placeholder="Numeric GA4 property ID" autoComplete="off" /></Field></details> : null}
    {integration.syncError ? <p className={styles.warning}>{integration.syncError}</p> : null}
    <button className={styles.primaryButton} disabled={disabled}>{hasSyncFields ? "Save and sync" : "Save connection"}</button>
  </form>;
}

export function normalizeAnalyticsConnectionValues(provider: string, values: Record<string, string>) {
  const next = { ...values };
  if (provider === "google-analytics") next.measurementId = (next.measurementId ?? "").trim().toUpperCase();
  if (provider === "google-search-console") {
    const property = (next.propertyUrl ?? "").trim();
    next.propertyUrl = property && !property.includes(":") ? `sc-domain:${property.replace(/^www\./, "")}` : property;
  }
  return next;
}
