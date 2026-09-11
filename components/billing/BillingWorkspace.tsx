"use client";

import { CheckCircle2, ChevronDown, CircleAlert, Copy, CreditCard, LoaderCircle, MessageSquareText, Receipt, RefreshCw, Search, Send, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";

import { adminApiUrl } from "@/lib/admin-api-client";
import styles from "./BillingWorkspace.module.css";

type Invoice = {
  invoiceNumber: string; customerName: string; commercialClient: string; commercialLocation: string; customerType: "commercial" | "residential";
  createdAt: string; nextTryCharging: string; payMethod: string; status: string; type: string; category: string; billingInterval: string;
  periodStart: string; periodEnd: string; totalCents: number; remainingCents: number; paidCents: number; refundedCents: number; needsAttention: boolean;
};
type Contact = { stableClientId: string; stableLocationId: string; name: string; role: string; email: string; phone: string; billingContact: boolean; priority: number | null; preferredChannel: string };
type BillingData = {
  invoices: Invoice[]; summary: { outstandingCents: number; openCount: number; needsAttentionCount: number; collectedRecentlyCents: number; collectedWindowDays: number };
  readiness: { billingData: boolean; paymentRequests: boolean; paymentRequestsReason: string; stripePayments: boolean; stripeReason: string; sms: boolean; smsReason: string; email: boolean; emailReason: string };
  capabilities: { role: "owner" | "support"; canSend: boolean; canCharge: boolean; canManage: boolean };
};
type ContactPayload = { contacts: Contact[]; ambiguous: boolean; selected: Contact | null; balance: { remainingCents: number; gateway: "stripe" | "fts" | "none" } };

export function BillingWorkspace() {
  const [data, setData] = useState<BillingData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"outstanding" | "paid" | "all">("outstanding");
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<{ invoice: Invoice; mode: "send" | "details" } | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch(adminApiUrl("/api/admin/billing"), { cache: "no-store", credentials: "include" });
      const payload = await response.json().catch(() => ({})) as BillingData & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Billing could not load.");
      setData(payload);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Billing could not load."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const invoices = useMemo(() => (data?.invoices ?? []).filter((invoice) => {
    if (tab === "outstanding" && invoice.remainingCents <= 0) return false;
    if (tab === "paid" && invoice.remainingCents > 0) return false;
    if (filter === "recurring" && !["subscription", "variable"].includes(invoice.type)) return false;
    if (filter === "one_time" && !["one_time", "initial", "prorated"].includes(invoice.type)) return false;
    if (filter === "commercial" && invoice.customerType !== "commercial") return false;
    if (filter === "residential" && invoice.customerType !== "residential") return false;
    if (filter === "attention" && !invoice.needsAttention) return false;
    const needle = query.trim().toLowerCase();
    return !needle || `${invoice.customerName} ${invoice.commercialClient} ${invoice.commercialLocation} ${invoice.invoiceNumber}`.toLowerCase().includes(needle);
  }), [data, tab, filter, query]);

  return <main className={styles.page}>
    <header className={styles.header}><div><p>ACCOUNTS RECEIVABLE</p><h1>Billing</h1><span>Live Sweep & Go balances, secure payment requests, and collection follow-up.</span></div><button type="button" onClick={() => void load()} disabled={loading}><RefreshCw className={loading ? styles.spin : ""} />Refresh</button></header>
    {error ? <div className={styles.alert} role="alert"><CircleAlert />{error}<button type="button" onClick={() => void load()}>Try again</button></div> : null}
    {!data && loading ? <div className={styles.loading}><LoaderCircle className={styles.spin} />Loading live billing data…</div> : null}
    {data ? <>
      <section className={styles.metrics} aria-label="Billing summary">
        <Metric label="Outstanding" value={formatMoney(data.summary.outstandingCents)} />
        <Metric label="Open invoices" value={String(data.summary.openCount)} />
        <Metric label="Needs attention" value={String(data.summary.needsAttentionCount)} attention={data.summary.needsAttentionCount > 0} />
        <Metric label={`Collected (${data.summary.collectedWindowDays}d)`} value={formatMoney(data.summary.collectedRecentlyCents)} />
      </section>
      {!data.capabilities.canCharge ? <div className={styles.notice}><CircleAlert />Support access is read-only. Only the owner can send requests or take payments.</div> : null}
      {!data.readiness.paymentRequests ? <div className={styles.notice}><CircleAlert /><div><strong>Payment-link setup required</strong><span>{data.readiness.paymentRequestsReason}</span></div></div> : null}
      {!data.readiness.stripePayments ? <div className={styles.notice}><CreditCard /><div><strong>Stripe payment setup required</strong><span>{data.readiness.stripeReason}</span></div></div> : null}
      <section className={styles.toolbar}>
        <div className={styles.tabs}>{(["outstanding", "paid", "all"] as const).map((item) => <button type="button" key={item} className={tab === item ? styles.active : ""} onClick={() => setTab(item)}>{capitalize(item)}</button>)}</div>
        <div className={styles.search}><Search /><input aria-label="Search invoices" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Customer or invoice #" /></div>
        <div className={styles.select}><select aria-label="Filter invoices" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All types</option><option value="recurring">Recurring</option><option value="one_time">One-time</option><option value="commercial">Commercial</option><option value="residential">Residential</option><option value="attention">Needs attention</option></select><ChevronDown /></div>
      </section>
      {invoices.length ? <section className={styles.list} aria-label="Invoices">{invoices.map((invoice) => <InvoiceCard key={invoice.invoiceNumber} invoice={invoice} data={data} onAction={(mode) => setActive({ invoice, mode })} onTake={() => void takePayment(invoice, data, setError)} />)}</section> : <section className={styles.empty}><CheckCircle2 /><h2>{data.invoices.length ? "No invoices match these filters" : "No invoices to show"}</h2><p>{data.invoices.length ? "Change the search or filter to see other Sweep & Go invoices." : "Sweep & Go did not return finalized invoices."}</p></section>}
    </> : null}
    {active?.mode === "details" ? <DetailsModal invoice={active.invoice} onClose={() => setActive(null)} /> : null}
    {active?.mode === "send" && data ? <SendModal invoice={active.invoice} readiness={data.readiness} onClose={() => setActive(null)} onComplete={() => { setActive(null); void load(); }} /> : null}
  </main>;
}

function Metric({ label, value, attention = false }: { label: string; value: string; attention?: boolean }) { return <article className={attention ? styles.metricAttention : ""}><span>{label}</span><strong>{value}</strong></article>; }
function InvoiceCard({ invoice, data, onAction, onTake }: { invoice: Invoice; data: BillingData; onAction: (mode: "send" | "details") => void; onTake: () => void }) {
  const canCollect = invoice.remainingCents > 0 && data.capabilities.canSend && data.readiness.paymentRequests;
  return <article className={styles.invoice}>
    <div className={styles.invoiceMain}><div className={styles.identity}><span className={invoice.customerType === "commercial" ? styles.commercial : styles.residential}>{invoice.customerType}</span><h2>{invoice.commercialClient || invoice.customerName || "Unnamed customer"}</h2>{invoice.commercialLocation ? <p>{invoice.commercialLocation}</p> : null}<small>Invoice #{invoice.invoiceNumber}</small></div><div className={styles.balance}><span>{invoice.remainingCents > 0 ? "Balance remaining" : "Paid"}</span><strong>{formatMoney(invoice.remainingCents)}</strong><small>Total {formatMoney(invoice.totalCents)} · Paid {formatMoney(invoice.paidCents)}</small></div></div>
    <div className={styles.invoiceMeta}><span className={invoice.needsAttention ? styles.attention : ""}>{invoice.needsAttention ? "Needs attention" : capitalize(invoice.status || "open")}</span><span>{labelize(invoice.payMethod || "No payment method")}</span><span>{labelize(invoice.type)}</span><span>Created {formatDate(invoice.createdAt)}</span>{invoice.nextTryCharging ? <span>Next attempt {formatDate(invoice.nextTryCharging)}</span> : null}</div>
    <div className={styles.actions}>{canCollect ? <button type="button" className={styles.primary} onClick={() => onAction("send")}><Send />Send payment request</button> : null}{canCollect && data.readiness.stripePayments ? <button type="button" onClick={onTake}><CreditCard />Take payment</button> : null}<button type="button" onClick={() => onAction("details")}><Receipt />Details</button></div>
  </article>;
}

function SendModal({ invoice, readiness, onClose, onComplete }: { invoice: Invoice; readiness: BillingData["readiness"]; onClose: () => void; onComplete: () => void }) {
  const [payload, setPayload] = useState<ContactPayload | null>(null); const [loading, setLoading] = useState(true); const [sending, setSending] = useState(false); const [error, setError] = useState(""); const [selected, setSelected] = useState(""); const [manual, setManual] = useState(false); const [manualName, setManualName] = useState(""); const [manualPhone, setManualPhone] = useState(""); const [manualEmail, setManualEmail] = useState(""); const [channel, setChannel] = useState<"sms" | "copy">(readiness.sms ? "sms" : "copy"); const [copyPath, setCopyPath] = useState("");
  useEffect(() => { let active = true; void api({ action: "contacts", invoiceNumber: invoice.invoiceNumber }).then((value) => { if (!active) return; const result = value as ContactPayload; setPayload(result); if (result.selected) setSelected(contactKey(result.selected)); }).catch((caught) => { if (active) setError(message(caught)); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [invoice.invoiceNumber]);
  async function submit(event: FormEvent) { event.preventDefault(); setSending(true); setError(""); try { const contact = payload?.contacts.find((item) => contactKey(item) === selected); const result = await api({ action: "create", invoiceNumber: invoice.invoiceNumber, channel, contact: manual ? undefined : contact, manualRecipient: manual ? { name: manualName, phone: manualPhone, email: manualEmail } : undefined }) as { url: string; delivered: boolean }; if (channel === "copy") { setCopyPath(result.url); await navigator.clipboard?.writeText(result.url).catch(() => undefined); } else onComplete(); } catch (caught) { setError(message(caught)); } finally { setSending(false); } }
  return <Modal title="Send payment request" onClose={onClose}><form className={styles.sendForm} onSubmit={submit}><div className={styles.modalBalance}><span>Current Sweep & Go balance</span><strong>{formatMoney(payload?.balance.remainingCents ?? invoice.remainingCents)}</strong><small>Invoice #{invoice.invoiceNumber}</small></div>{loading ? <div className={styles.loading}><LoaderCircle className={styles.spin} />Resolving Sweep & Go contacts…</div> : null}{payload && !copyPath ? <><fieldset><legend>Send to</legend>{payload.contacts.map((contact) => <label aria-label="Select payment contact" className={styles.contact} key={contactKey(contact)}><input type="radio" name="contact" checked={!manual && selected === contactKey(contact)} onChange={() => { setManual(false); setSelected(contactKey(contact)); }} /><span><strong>{contact.name || "Contact"}{contact.billingContact ? <em>Billing contact</em> : null}</strong><small>{[contact.role, contact.phone, contact.email].filter(Boolean).join(" · ")}</small></span></label>)}<label aria-label="Use another payment recipient" className={styles.contact}><input type="radio" name="contact" checked={manual} onChange={() => setManual(true)} /><span><strong>Use another recipient</strong><small>Enter a validated phone or email without changing Sweep & Go.</small></span></label></fieldset>{manual ? <div className={styles.manual}><label>Name<input value={manualName} onChange={(event) => setManualName(event.target.value)} maxLength={120} /></label><label>Phone<input value={manualPhone} onChange={(event) => setManualPhone(event.target.value)} inputMode="tel" /></label><label>Email<input value={manualEmail} onChange={(event) => setManualEmail(event.target.value)} type="email" /></label></div> : null}<fieldset><legend>Channel</legend><label aria-label="Send by text message" className={styles.channel}><input type="radio" name="channel" checked={channel === "sms"} disabled={!readiness.sms} onChange={() => setChannel("sms")} /><MessageSquareText /><span><strong>Text message</strong><small>{readiness.sms ? "Send with OpenPhone" : readiness.smsReason}</small></span></label><label aria-label="Copy secure payment link" className={styles.channel}><input type="radio" name="channel" checked={channel === "copy"} onChange={() => setChannel("copy")} /><Copy /><span><strong>Copy secure link</strong><small>Copy it for a channel you choose.</small></span></label><label aria-label="Email is unavailable" className={styles.channel}><input type="radio" name="channel" disabled /><Send /><span><strong>Email</strong><small>{readiness.emailReason}</small></span></label></fieldset></> : null}{copyPath ? <div className={styles.copyResult}><CheckCircle2 /><strong>Secure link created and copied</strong><input aria-label="Secure payment link" readOnly value={copyPath} onFocus={(event) => event.currentTarget.select()} /><button type="button" onClick={() => void navigator.clipboard?.writeText(copyPath)}>Copy again</button></div> : null}{error ? <p className={styles.formError} role="alert">{error}</p> : null}<div className={styles.modalActions}><button type="button" onClick={copyPath ? onComplete : onClose}>{copyPath ? "Done" : "Cancel"}</button>{!copyPath ? <button className={styles.primary} type="submit" disabled={sending || loading || (!manual && !selected) || (channel === "sms" && !readiness.sms)}>{sending ? <LoaderCircle className={styles.spin} /> : channel === "sms" ? <Send /> : <Copy />}{sending ? "Sending…" : channel === "sms" ? `Send ${formatMoney(payload?.balance.remainingCents ?? invoice.remainingCents)} request` : "Create and copy link"}</button> : null}</div></form></Modal>;
}

function DetailsModal({ invoice, onClose }: { invoice: Invoice; onClose: () => void }) { return <Modal title={`Invoice #${invoice.invoiceNumber}`} onClose={onClose}><dl className={styles.details}><div><dt>Customer</dt><dd>{invoice.commercialClient || invoice.customerName}</dd></div>{invoice.commercialLocation ? <div><dt>Location</dt><dd>{invoice.commercialLocation}</dd></div> : null}<div><dt>Current remaining</dt><dd>{formatMoney(invoice.remainingCents)}</dd></div><div><dt>Total / Paid</dt><dd>{formatMoney(invoice.totalCents)} / {formatMoney(invoice.paidCents)}</dd></div><div><dt>Status</dt><dd>{labelize(invoice.status)}</dd></div><div><dt>Payment method</dt><dd>{labelize(invoice.payMethod || "none")}</dd></div><div><dt>Type</dt><dd>{[labelize(invoice.type), labelize(invoice.category), labelize(invoice.billingInterval)].filter(Boolean).join(" · ")}</dd></div>{invoice.periodStart ? <div><dt>Billing period</dt><dd>{formatDate(invoice.periodStart)} – {formatDate(invoice.periodEnd)}</dd></div> : null}{invoice.nextTryCharging ? <div><dt>Next charge attempt</dt><dd>{formatDate(invoice.nextTryCharging)}</dd></div> : null}</dl><div className={styles.modalActions}><button type="button" onClick={onClose}>Close</button></div></Modal>; }
function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) { return <div className={styles.overlay} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="billing-modal-title"><header><h2 id="billing-modal-title">{title}</h2><button type="button" onClick={onClose} aria-label="Close"><X /></button></header>{children}</section></div>; }

async function takePayment(invoice: Invoice, data: BillingData, setError: (value: string) => void) { if (!data.readiness.stripePayments) { setError(data.readiness.stripeReason); return; } try { const result = await api({ action: "create", invoiceNumber: invoice.invoiceNumber, requestType: "owner_take", channel: "copy" }) as { url: string }; window.location.assign(result.url); } catch (caught) { setError(message(caught)); } }
async function api(body: Record<string, unknown>) { const response = await fetch(adminApiUrl("/api/admin/billing"), { method: "POST", credentials: "include", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const payload = await response.json().catch(() => ({})) as { error?: string }; if (!response.ok) throw new Error(payload.error || "Billing action failed."); return payload; }
function contactKey(contact: Contact) { return `${contact.stableClientId}:${contact.stableLocationId}:${contact.name}:${contact.phone}:${contact.email}`; }
function formatMoney(cents: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100); }
function formatDate(value: string) { const date = new Date(value.includes("T") ? value : value.replace(" ", "T")); return Number.isNaN(date.getTime()) ? value || "—" : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); }
function labelize(value: string) { return value ? value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : ""; }
function capitalize(value: string) { return value.charAt(0).toUpperCase() + value.slice(1); }
function message(error: unknown) { return error instanceof Error ? error.message : "Billing action failed."; }
