"use client";

import { default as styles } from "../AdminPortal.module.css";
import { ContentItem, PageRegistryItem, emptyContent } from "./model";
import { Empty, Field, WorkspaceProps, formatDate } from "./ui";
import { listRegisteredPages } from "@/lib/page-registry";
import { useMemo, useState } from "react";

type OfferJourneys = { rangeDays: number; offers: { path: string; offerId: string; offer: string; visits: number; clicks: number; quotes: number; leads: number; signups: number }[] };

export function ContentEditor({ type, payload, request, reload, run }: WorkspaceProps & { type: ContentItem["type"] }) {
  const items = (payload.items ?? []) as ContentItem[];
  const pages = (Array.isArray(payload.pages) ? payload.pages : listRegisteredPages().map((page) => ({ ...page, status: page.dynamic ? "dynamic" : "published", url: page.dynamic ? "" : page.path }))) as PageRegistryItem[];
  const [draft, setDraft] = useState<ContentItem>(emptyContent(type));
  const [pageSearch, setPageSearch] = useState("");
  const [journeyOverride, setJourneyOverride] = useState<OfferJourneys>();
  const set = (key: keyof ContentItem, value: string) => setDraft((current) => ({ ...current, [key]: value }));
  const visiblePages = useMemo(() => {
    const query = pageSearch.trim().toLowerCase();
    return query ? pages.filter((page) => `${page.title} ${page.path} ${page.kind}`.toLowerCase().includes(query)) : pages;
  }, [pageSearch, pages]);
  const isLandingPage = type === "landing-page";
  const journeys = journeyOverride || payload.journeys as OfferJourneys | undefined;
  return <>
    {isLandingPage ? <section className={styles.panel}>
      <div className={styles.panelHeader}><div><h2>Offer journeys</h2><p>Which offer brought each quote and lead. Attribution follows the most recently visited offer for up to 30 days, including visits to other pages.</p></div>
        <label>Range<select value={journeys?.rangeDays || 30} onChange={(event) => void run(async () => { const next = await request(`/api/admin/content?type=landing-page&days=${event.target.value}`); setJourneyOverride(next.journeys as typeof journeys); }, "Offer journeys refreshed.")}><option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option></select></label>
      </div>
      <div className={styles.tableWrap}><table><thead><tr><th>Offer / page</th><th>Visits</th><th>CTA clicks</th><th>Quotes generated</th><th>Leads captured</th><th>Signups</th></tr></thead><tbody>
        {(journeyOverride || journeys)?.offers.map((item) => <tr key={`${item.path}:${item.offerId}`}><td><strong>{item.offer || item.offerId}</strong><small>{item.path}</small></td><td>{item.visits}</td><td>{item.clicks}</td><td>{item.quotes}</td><td>{item.leads}</td><td>{item.signups}</td></tr>)}
      </tbody></table>{!journeys?.offers.length ? <Empty>No offer journeys recorded yet. New landing pages include tracking; ask Reggie to enable it on an existing offer page.</Empty> : null}</div>
      <p>Each stage counts once per visitor journey and offer. Signups require confirmed Sweep &amp; Go onboarding; a lead or payment-link click is not a signup.</p>
    </section> : null}
    {isLandingPage ? <section className={`${styles.panel} ${styles.pageInventory}`}>
      <div className={styles.panelHeader}><div><h2>Live website pages</h2><p className={styles.integrationDescription}>This inventory is generated from real App Router and Pages Router source files. Route templates are shown separately and are not counted as individual live pages.</p></div><span>{pages.filter((page) => !page.dynamic).length} live</span></div>
      <div className={styles.pageInventoryToolbar}><label className={styles.field}>Find a page<input type="search" value={pageSearch} onChange={(event) => setPageSearch(event.target.value)} placeholder="Search by title or /path" /></label><a className={styles.primaryButton} href="/admin/reggie-queue?new=landing-page">Create a landing page</a></div>
      <div className={styles.tableWrap}><table><thead><tr><th>Page</th><th>Route type</th><th>Status</th><th>Actions</th></tr></thead><tbody>
        {visiblePages.map((page) => <tr key={`${page.path}:${page.dynamic ? "pattern" : "page"}`}><td><strong>{page.title}</strong><small>{page.path}</small></td><td>{page.dynamic ? "Dynamic route template" : page.kind}</td><td className={page.dynamic ? styles.caution : styles.good}>{page.dynamic ? "Template" : "Live in source"}</td><td><div className={styles.rowActions}>{page.url ? <a href={page.url} target="_blank" rel="noreferrer">Open</a> : null}<a href={`/admin/reggie?prompt=${encodeURIComponent(`Update the existing page at ${page.path} without changing its route.`)}`}>Edit with Reggie</a></div></td></tr>)}
      </tbody></table>{!visiblePages.length ? <Empty>{pageSearch ? "No source pages match that search." : "No public source routes were discovered. Run the Reggie page-registry sync before publishing."}</Empty> : null}</div>
    </section> : null}
    {isLandingPage ? <p className={styles.contentBriefNotice}><strong>Content briefs do not create or deploy public pages.</strong> Use “Create a landing page” for a new route. A brief can only be marked published after that exact route exists in the source inventory.</p> : null}
    <section className={styles.splitWorkspace}>
    <form className={styles.panel} onSubmit={(event) => { event.preventDefault(); void run(async () => { await request("/api/admin/content", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) }); setDraft(emptyContent(type)); await reload(); }, `${type === "landing-page" ? "Landing page" : "Blog post"} saved.`); }}>
      <div className={styles.panelHeader}><h2>{draft.id ? "Edit" : "New"} {isLandingPage ? "content brief" : "draft"}</h2>{draft.id ? <button type="button" className={styles.textButton} onClick={() => setDraft(emptyContent(type))}>Clear</button> : null}</div>
      <div className={styles.stack}>
        <Field label="Title"><input value={draft.title} onChange={(event) => set("title", event.target.value)} required /></Field>
        {isLandingPage ? <Field label="Public path"><input value={draft.path || (draft.slug ? `/${draft.slug}` : "")} onChange={(event) => set("path", event.target.value)} placeholder="/spring-cleanup" required /></Field> : <Field label="Slug"><input value={draft.slug} onChange={(event) => set("slug", event.target.value)} required /></Field>}
        <Field label="Status"><select value={draft.status} onChange={(event) => set("status", event.target.value)}><option>draft</option><option>review</option>{!isLandingPage ? <option>scheduled</option> : null}{!isLandingPage || draft.sourceBacked ? <option>published</option> : null}<option>archived</option></select></Field>
        {isLandingPage && draft.publishBlocker ? <p className={styles.warning}>{draft.publishBlocker}</p> : null}
        <Field label="Excerpt"><textarea value={draft.excerpt} onChange={(event) => set("excerpt", event.target.value)} /></Field>
        <Field label="Content"><textarea className={styles.largeTextarea} value={draft.body} onChange={(event) => set("body", event.target.value)} /></Field>
        <div className={styles.formGrid}><Field label="Focus keyword"><input value={draft.focusKeyword} onChange={(event) => set("focusKeyword", event.target.value)} /></Field><Field label="Canonical URL"><input value={draft.canonicalUrl} onChange={(event) => set("canonicalUrl", event.target.value)} /></Field></div>
        <Field label="SEO title"><input value={draft.metaTitle} onChange={(event) => set("metaTitle", event.target.value)} /></Field>
        <Field label="Meta description"><textarea value={draft.metaDescription} onChange={(event) => set("metaDescription", event.target.value)} /></Field>
        <button className={styles.primaryButton}>Save {isLandingPage ? "brief" : "post"}</button>
      </div>
    </form>
    <div className={styles.panel}><div className={styles.panelHeader}><h2>{isLandingPage ? "Saved content briefs" : "Content"}</h2><span>{items.length}</span></div><div className={styles.recordList}>
      {items.map((item) => <div className={styles.contentRow} key={item.id}><button type="button" className={styles.recordButton} onClick={() => setDraft(item)}><span><strong>{item.title}</strong><small>{isLandingPage ? item.path || `/${item.slug}` : `/${item.slug}`} | {formatDate(item.updatedAt)}</small>{isLandingPage ? <small className={item.sourceBacked ? styles.good : styles.caution}>{item.sourceBacked ? "Source route exists" : "Brief only — no public route"}</small> : null}</span><b>{item.status}</b></button><button className={styles.textButton} onClick={() => void run(async () => { await request("/api/admin/content", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id }) }); await reload(); }, "Content removed.")}>Remove</button></div>)}
      {!items.length ? <Empty>{isLandingPage ? "No content briefs. Existing public pages are listed above." : "No content records."}</Empty> : null}
    </div></div>
  </section></>;
}
