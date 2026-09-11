"use client";

import { default as styles } from "../AdminPortal.module.css";
import { RankingKeyword, SeoPage, SeoSettings, emptySeo } from "./model";
import { ApiRequest, Empty, Field, RunAction, WorkspaceProps, formatDate } from "./ui";
import { FormEvent, useState } from "react";

export function SeoEditor({ payload, request, reload, run }: WorkspaceProps) {
  const pages = (payload.pages ?? []) as SeoPage[];
  const [draft, setDraft] = useState<SeoPage>(emptySeo);
  const [siteSettings, setSiteSettings] = useState<SeoSettings>((payload.settings ?? {}) as SeoSettings);
  const set = (key: keyof SeoPage, value: SeoPage[keyof SeoPage]) => setDraft((current) => ({ ...current, [key]: value }));
  const setSite = (key: keyof SeoSettings, value: SeoSettings[keyof SeoSettings]) => setSiteSettings((current) => ({ ...current, [key]: value }));
  return <>
    <form className={`${styles.panel} ${styles.globalSeo}`} onSubmit={(event) => { event.preventDefault(); void run(async () => { await request("/api/admin/seo", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...siteSettings, scope: "site" }) }); await reload(); }, "Global SEO settings saved."); }}>
      <div className={styles.panelHeader}><h2>Global SEO</h2></div><div className={styles.formGrid}>
        <Field label="Site name"><input value={siteSettings.siteName ?? ""} onChange={(event) => setSite("siteName", event.target.value)} /></Field>
        <Field label="Title template"><input value={siteSettings.titleTemplate ?? ""} onChange={(event) => setSite("titleTemplate", event.target.value)} placeholder="%s | Site Name" /></Field>
        <Field label="Canonical origin"><input type="url" value={siteSettings.canonicalOrigin ?? ""} onChange={(event) => setSite("canonicalOrigin", event.target.value)} /></Field>
        <Field label="Default Open Graph image"><input type="url" value={siteSettings.defaultOgImage ?? ""} onChange={(event) => setSite("defaultOgImage", event.target.value)} /></Field>
        <Field label="Robots default"><select value={siteSettings.robotsMode ?? "index"} onChange={(event) => setSite("robotsMode", event.target.value)}><option value="index">Index</option><option value="noindex">No index</option></select></Field>
        <label className={styles.toggle}><input type="checkbox" checked={siteSettings.sitemapEnabled !== false} onChange={(event) => setSite("sitemapEnabled", event.target.checked)} /><span>Sitemap enabled</span></label>
      </div><Field label="Default meta description"><textarea value={siteSettings.defaultDescription ?? ""} onChange={(event) => setSite("defaultDescription", event.target.value)} /></Field><Field label="Local business structured data"><textarea value={siteSettings.localBusinessSchemaJson ?? ""} onChange={(event) => setSite("localBusinessSchemaJson", event.target.value)} spellCheck={false} /></Field><div className={styles.actions}><button className={styles.primaryButton}>Save global SEO</button></div>
    </form>
    <section className={styles.splitWorkspace}>
    <form className={styles.panel} onSubmit={(event) => { event.preventDefault(); void run(async () => { await request("/api/admin/seo", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) }); await reload(); }, "SEO record saved."); }}>
      <div className={styles.panelHeader}><h2>{pages.some((page) => page.path === draft.path) ? "Edit page" : "Add page"}</h2></div>
      <div className={styles.stack}>
        <Field label="Path"><input value={draft.path} onChange={(event) => set("path", event.target.value)} required /></Field>
        <Field label="Focus keyword"><input value={draft.focusKeyword} onChange={(event) => set("focusKeyword", event.target.value)} /></Field>
        <Field label="SEO title"><input value={draft.title} onChange={(event) => set("title", event.target.value)} maxLength={80} /></Field>
        <Field label="Meta description"><textarea value={draft.description} onChange={(event) => set("description", event.target.value)} maxLength={200} /></Field>
        <Field label="Canonical URL"><input type="url" value={draft.canonicalUrl} onChange={(event) => set("canonicalUrl", event.target.value)} /></Field>
        <Field label="Index status"><select value={draft.indexStatus} onChange={(event) => set("indexStatus", event.target.value)}><option value="index">Index</option><option value="noindex">No index</option><option value="redirect">Redirect</option></select></Field>
        <Field label="Structured data JSON"><textarea value={draft.schemaJson} onChange={(event) => set("schemaJson", event.target.value)} spellCheck={false} /></Field>
        <button className={styles.primaryButton}>Save page</button>
      </div>
    </form>
    <div className={styles.panel}><div className={styles.panelHeader}><h2>Page inventory</h2><span>{pages.length}</span></div><div className={styles.recordList}>
      {pages.map((page) => <div className={styles.contentRow} key={page.path}><button type="button" className={styles.recordButton} onClick={() => setDraft(page)}><span><strong>{page.path}</strong><small>{page.focusKeyword || "No focus keyword"}</small></span><b className={page.score >= 80 ? styles.good : page.score >= 50 ? styles.caution : styles.warn}>{page.score}</b></button><button className={styles.textButton} onClick={() => void run(async () => { await request("/api/admin/seo", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: page.path }) }); if (draft.path === page.path) setDraft(emptySeo); await reload(); }, "SEO record removed.")}>Remove</button></div>)}
      {!pages.length ? <Empty>No SEO pages registered.</Empty> : null}
    </div></div>
    </section>
  </>;
}

export function Rankings({ payload, request, reload, run }: WorkspaceProps) {
  const keywords = (payload.keywords ?? []) as RankingKeyword[];
  const discovered = (payload.discovered ?? []) as Array<{ query: string; impressions: number; position: number }>;
  const [draft, setDraft] = useState<Partial<RankingKeyword>>({ device: "mobile", location: "United States" });
  async function save(event: FormEvent) { event.preventDefault(); await run(async () => { await request("/api/admin/rankings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) }); setDraft({ device: "mobile", location: "United States" }); await reload(); }, "Keyword saved."); }
  return <>
    <form className={styles.inlineForm} onSubmit={(event) => void save(event)}>
      <Field label="Keyword"><input value={draft.keyword ?? ""} onChange={(event) => setDraft((current) => ({ ...current, keyword: event.target.value }))} required /></Field>
      <Field label="Target URL"><input value={draft.targetUrl ?? ""} onChange={(event) => setDraft((current) => ({ ...current, targetUrl: event.target.value }))} /></Field>
      <Field label="Location"><input value={draft.location ?? ""} onChange={(event) => setDraft((current) => ({ ...current, location: event.target.value }))} /></Field>
      <Field label="Device"><select value={draft.device ?? "mobile"} onChange={(event) => setDraft((current) => ({ ...current, device: event.target.value }))}><option>mobile</option><option>desktop</option><option value="all">all devices</option></select></Field>
      <button className={styles.primaryButton}>Add keyword</button>
    </form>
    {discovered.length ? <section className={styles.panel}><div className={styles.panelHeader}><div><h2>Search Console discoveries</h2><p className={styles.integrationDescription}>{discovered.length} real search {discovered.length === 1 ? "query is" : "queries are"} ready to track with current and previous position.</p></div><button type="button" onClick={() => void run(async () => { await request("/api/admin/rankings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "import-search-console" }) }); await reload(); }, "Search Console rankings imported.")}>Track searches</button></div></section> : null}
    <section className={styles.panel}><div className={styles.panelHeader}><h2>Tracked keywords</h2><span>{keywords.length}</span></div><div className={styles.tableWrap}><table><thead><tr><th>Keyword</th><th>Target</th><th>Location</th><th>Position</th><th>Volume</th><th>Change</th><th>Checked</th><th></th></tr></thead><tbody>
      {keywords.map((item) => { const change = item.latestPosition && item.previousPosition ? item.previousPosition - item.latestPosition : 0; return <tr key={item.id}><td><strong>{item.keyword}</strong><small>{item.device}</small></td><td>{item.targetUrl || "-"}</td><td>{item.location}</td><td><RankPositionEditor item={item} request={request} reload={reload} run={run} /></td><td>{item.searchVolume ?? "-"}</td><td className={change > 0 ? styles.good : change < 0 ? styles.warn : ""}>{change > 0 ? `+${change}` : change || "-"}</td><td>{formatDate(item.checkedAt)}</td><td><button className={styles.textButton} onClick={() => void run(async () => { await request("/api/admin/rankings", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id }) }); await reload(); }, "Keyword removed.")}>Remove</button></td></tr>; })}
    </tbody></table>{!keywords.length ? <Empty>No keywords tracked.</Empty> : null}</div></section>
  </>;
}

export function RankPositionEditor({ item, request, reload, run }: { item: RankingKeyword; request: ApiRequest; reload: () => Promise<void>; run: RunAction }) {
  const [position, setPosition] = useState(item.latestPosition?.toString() ?? "");
  return <form className={styles.rankUpdate} onSubmit={(event) => { event.preventDefault(); void run(async () => {
    await request("/api/admin/rankings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...item, latestPosition: Number(position) }) });
    await reload();
  }, "Ranking updated."); }}><input aria-label={`Position for ${item.keyword}`} type="number" min="1" max="1000" value={position} onChange={(event) => setPosition(event.target.value)} required /><button>Record</button></form>;
}
