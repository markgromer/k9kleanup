"use client";

import { default as styles } from "../AdminPortal.module.css";
import { IntegrationStatus } from "./model";
import { HealthRow } from "./shell";
import { ApiRequest, Field, RunAction, WorkspaceProps, formatDate } from "./ui";
import { useState } from "react";

export function Integrations({ payload, request, reload, run }: WorkspaceProps) {
  const integrations = (payload.integrations ?? []) as IntegrationStatus[];
  const storage = (payload.storage ?? {}) as { storageReady?: boolean; bindingReady?: boolean; encryptionReady?: boolean };
  return <>
    <section className={styles.healthStrip}><HealthRow label="Connection settings" ready={storage.bindingReady} /><HealthRow label="Secure credential storage" ready={storage.encryptionReady} /></section>
    <section className={styles.integrationList}>{integrations.map((integration) => <IntegrationRow key={`${integration.provider}:${integration.updatedAt}`} integration={integration} request={request} reload={reload} run={run} disabled={!storage.storageReady} />)}</section>
  </>;
}

export function IntegrationRow({ integration, request, reload, run, disabled }: { integration: IntegrationStatus; request: ApiRequest; reload: () => Promise<void>; run: RunAction; disabled: boolean }) {
  const [values, setValues] = useState<Record<string, string>>({ ...integration.config });
  const [enabled, setEnabled] = useState(integration.enabled);
  const supportsSync = integration.provider === "google-analytics" || integration.provider === "google-search-console" || integration.provider === "google-pagespeed";
  const supportsVerification = integration.provider === "sweep-and-go";
  const hasServiceCredential = Boolean(integration.maskedSecrets.serviceAccountJson || values.serviceAccountJson);
  const visibleFields = integration.fields.filter((field) => !(field.key === "serviceAccountJson" && integration.maskedSecrets.serviceAccountJson));
  const trackingActive = integration.provider === "google-analytics" && integration.enabled && /^G-[A-Z0-9]{4,20}$/i.test(values.measurementId || integration.config.measurementId || "");
  const missingSyncFields = integration.provider === "google-analytics"
    ? [!/^\d+$/.test(values.propertyId || integration.config.propertyId || "") ? "Property ID" : "", !hasServiceCredential ? "reporting credential" : ""].filter(Boolean)
    : integration.provider === "google-search-console"
      ? [!(values.propertyUrl || integration.config.propertyUrl) ? "Search Console property" : "", !hasServiceCredential ? "reporting credential" : ""].filter(Boolean)
      : [];
  const syncReady = supportsSync && integration.configured && missingSyncFields.length === 0;
  const sweepAndGoReady = supportsVerification && Boolean(values.orgSlug || integration.config.orgSlug) && Boolean(values.apiToken || integration.maskedSecrets.apiToken);
  const stateLabel = integration.connectionState === "connected" ? "Connected" : supportsVerification && integration.configured ? "Needs verification" : trackingActive && !syncReady ? "Tracking active" : supportsSync && integration.configured && !syncReady ? "Needs setup" : integration.connectionState === "attention" ? "Needs attention" : integration.connectionState === "configured" ? "Ready to test" : "Not connected";
  if (integration.provider === "warren") return <details className={styles.integrationRow}>
    <summary id={integration.provider}><span><strong>{integration.label}</strong><small>{integration.category}</small></span><span className={integration.connectionState === "connected" ? styles.good : styles.muted}>{stateLabel}</span></summary>
    <div><p className={styles.integrationDescription}>Managed securely by PoopSites. REGGIE receives this site&apos;s approved Analytics, Search Console, and WARREN reporting data without exposing platform credentials.</p></div>
  </details>;
  return <details className={styles.integrationRow}>
    <summary id={integration.provider}><span><strong>{integration.label}</strong><small>{integration.category}</small></span><span className={integration.connectionState === "connected" || trackingActive ? styles.good : styles.muted}>{stateLabel}</span></summary>
    <form onSubmit={(event) => { event.preventDefault(); void run(async () => { await request("/api/admin/integrations", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: integration.provider, enabled, values }) }); await reload(); }, `${integration.label} saved.`); }}>
      <p className={styles.integrationDescription}>{integration.description}</p>
      {integration.provider === "google-drive" ? <p className={styles.integrationDescription}>Use a folder shared with the people who manage this website. Reggie stores only the folder link; Drive remains the source of truth. Open the folder, download the approved image, then upload it in Media so the website receives a stable optimized copy.</p> : null}
      {integration.provider === "sweep-and-go" ? <p className={styles.integrationDescription}>In Sweep & Go, enable <code>client:credit_card_link_created</code> and send it to <code>/api/quote/sweep-and-go-webhook</code>. Configure the payment webhook secret as the supported <code>X-SNG-Webhook-Secret</code> header. Never place secrets in webhook URLs; legacy query-secret compatibility can expose credentials through logs and history. The quote UI can poll <code>/api/quote/payment?signupId=...</code> until the secure card link is ready.</p> : null}
      {trackingActive && missingSyncFields.length ? <p className={styles.integrationDescription}>Website tracking is active. Dashboard reporting still needs: {missingSyncFields.join(" and ")}.</p> : null}
      {integration.maskedSecrets.serviceAccountJson ? <p className={styles.integrationDescription}>Reporting credential is already populated.</p> : null}
      {supportsSync && integration.lastSyncedAt ? <p className={styles.integrationDescription}>Last synchronized {formatDate(integration.lastSyncedAt)}.</p> : null}
      {supportsSync && integration.syncError ? <p className={styles.warning}>{integration.syncError}</p> : null}
      <label className={styles.toggle}><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /><span>Enabled</span></label>
      <div className={styles.formGrid}>{visibleFields.map((field) => <Field key={field.key} label={field.label}>{field.type === "textarea" ? <textarea value={values[field.key] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))} placeholder={integration.maskedSecrets[field.key] || field.placeholder} spellCheck={false} /> : <input type={field.type} value={values[field.key] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))} placeholder={integration.maskedSecrets[field.key] || field.placeholder} autoComplete="off" />}</Field>)}</div>
      <div className={styles.actions}><button className={styles.primaryButton} disabled={disabled}>Save integration</button>{sweepAndGoReady ? <button type="button" onClick={() => void run(async () => { await request("/api/admin/integrations", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: integration.provider, enabled: true, values }) }); await request("/api/admin/integrations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: integration.provider }) }); await reload(); }, `${integration.label} credentials verified.`)}>Verify connection</button> : null}{syncReady && integration.enabled ? <button type="button" onClick={() => void run(async () => { await request("/api/admin/integrations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: integration.provider }) }); await reload(); }, `${integration.label} connected and synchronized.`)}>Test and sync</button> : null}{integration.configured && integration.source !== "environment" ? <button type="button" className={styles.dangerButton} onClick={() => void run(async () => { await request("/api/admin/integrations", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: integration.provider }) }); await reload(); }, `${integration.label} disconnected.`)}>Disconnect</button> : null}</div>
    </form>
  </details>;
}
