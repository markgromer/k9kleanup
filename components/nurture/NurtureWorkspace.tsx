"use client";

import {
  Activity,
  Ban,
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  Filter,
  HeartHandshake,
  MessageSquareReply,
  PauseCircle,
  Play,
  Plus,
  RefreshCw,
  Save,
  Send,
  Settings2,
  ShieldCheck,
  Trash2,
  UsersRound,
  Webhook,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";

import { adminApiUrl } from "@/lib/admin-api-client";
import { clearSavedAdminPassword, readSavedAdminPassword, saveAdminPassword } from "@/lib/admin-auth-client";
import styles from "./NurtureWorkspace.module.css";

type NurtureDripStep = { id: string; delayHours: number; message: string };
type EntrySources = { quoteDisplayed: boolean; externalWebhook: boolean };
type Exclusions = {
  excludeExistingCustomers: boolean;
  excludedSources: string[];
  excludedZipCodes: string[];
  excludedFrequencies: string[];
  minimumQuoteTotal: number | null;
  maximumQuoteTotal: number | null;
  cooldownDays: number;
};
type StopRules = { signup: boolean; booking: boolean; payment: boolean; customerCreated: boolean; inboundReply: true; optOut: true };

type NurtureStatus = {
  configured: boolean;
  enabled: boolean;
  source: "env" | "stored" | "none";
  openPhoneApiKeyMasked: string;
  openPhonePhoneNumberId: string;
  openPhoneWebhookSecretMasked: string;
  entrySources: EntrySources;
  businessName: string;
  timezone: string;
  quietHoursStart: string;
  quietHoursEnd: string;
  exclusions: Exclusions;
  stopRules: StopRules;
  steps: NurtureDripStep[];
  storageReady: boolean;
  bindingReady: boolean;
  encryptionReady: boolean;
  eventTokenReady: boolean;
  usesEnvOverride: boolean;
};

type RecipientStatus = "active" | "processing" | "signed_up" | "completed" | "paused" | "replied" | "opted_out";
type NurtureRecipientSummary = {
  id: string;
  phoneE164: string;
  firstName: string;
  quoteId: string;
  quoteTotal: string;
  quoteLink: string;
  source: string;
  status: RecipientStatus;
  currentStepIndex: number;
  nextSendAt: string;
  lastSentAt: string;
  updatedAt: string;
};
type NurtureEventSummary = { id: string; recipientId: string; phoneE164: string; eventType: string; source: string; occurredAt: string; detail: Record<string, unknown> };
type NurtureDashboard = {
  activeCount: number;
  signedUpCount: number;
  completedCount: number;
  optedOutCount: number;
  manualCount: number;
  failedCount: number;
  suppressionCount: number;
  sentCount: number;
  deliveredCount: number;
  lastProcessedAt: string;
  recentRecipients: NurtureRecipientSummary[];
  recentEvents: NurtureEventSummary[];
};
type NurtureSettingsResponse = {
  ok?: boolean;
  error?: string;
  message?: string;
  status?: NurtureStatus;
  dashboard?: NurtureDashboard | null;
};
type NurtureProcessResponse = { ok?: boolean; error?: string; sent?: number; skipped?: number };
type WorkspaceTab = "overview" | "journey" | "rules" | "connections";

const fallbackSteps: NurtureDripStep[] = [
  { id: "day-0", delayHours: 2, message: "Hi {{firstName}}, this is {{businessName}}. Just checking that you received your quote. Any questions I can answer? Reply STOP to opt out." },
  { id: "day-2", delayHours: 48, message: "Hi {{firstName}}, wanted to follow up on your quote. We can still get you on the schedule if you would like to move ahead. Reply STOP to opt out." },
  { id: "day-5", delayHours: 120, message: "Hi {{firstName}}, should I keep your quote open or close it out for now? Reply STOP to opt out." },
];
const defaultExclusions: Exclusions = { excludeExistingCustomers: true, excludedSources: [], excludedZipCodes: [], excludedFrequencies: [], minimumQuoteTotal: null, maximumQuoteTotal: null, cooldownDays: 30 };
const defaultStopRules: StopRules = { signup: true, booking: true, payment: true, customerCreated: true, inboundReply: true, optOut: true };

export function NurtureWorkspace() {
  const [password, setPassword] = useState(() => readSavedAdminPassword());
  const [authed, setAuthed] = useState(() => Boolean(readSavedAdminPassword()));
  const [status, setStatus] = useState<NurtureStatus | null>(null);
  const [dashboard, setDashboard] = useState<NurtureDashboard | null>(null);
  const [tab, setTab] = useState<WorkspaceTab>("overview");
  const [openPhoneApiKey, setOpenPhoneApiKey] = useState("");
  const [openPhonePhoneNumberId, setOpenPhonePhoneNumberId] = useState("");
  const [openPhoneWebhookSecret, setOpenPhoneWebhookSecret] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [entrySources, setEntrySources] = useState<EntrySources>({ quoteDisplayed: true, externalWebhook: true });
  const [businessName, setBusinessName] = useState("");
  const [timezone, setTimezone] = useState("America/Phoenix");
  const [quietHoursStart, setQuietHoursStart] = useState("20:00");
  const [quietHoursEnd, setQuietHoursEnd] = useState("08:00");
  const [exclusions, setExclusions] = useState<Exclusions>(defaultExclusions);
  const [stopRules, setStopRules] = useState<StopRules>(defaultStopRules);
  const [steps, setSteps] = useState<NurtureDripStep[]>(fallbackSteps);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  const authHeaders = useCallback((token = password) => ({ Authorization: `Bearer ${token}` }), [password]);
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const webhookUrl = `${origin}/api/nurture/webhook`;
  const replyUrl = `${origin}/api/nurture/reply`;
  const stopUrl = `${origin}/api/nurture/stop`;

  const applyStatus = useCallback((next: NurtureStatus) => {
    setStatus(next);
    setOpenPhonePhoneNumberId(next.openPhonePhoneNumberId);
    setEnabled(next.enabled);
    setEntrySources(next.entrySources ?? { quoteDisplayed: true, externalWebhook: true });
    setBusinessName(next.businessName);
    setTimezone(next.timezone);
    setQuietHoursStart(next.quietHoursStart);
    setQuietHoursEnd(next.quietHoursEnd);
    setExclusions(next.exclusions ?? defaultExclusions);
    setStopRules(next.stopRules ?? defaultStopRules);
    setSteps(next.steps.length ? next.steps : fallbackSteps);
  }, []);

  const loadStatus = useCallback(async (token = password) => {
    const response = await fetch(adminApiUrl("/api/admin/nurture"), { headers: authHeaders(token), cache: "no-store" });
    const data = await response.json().catch(() => ({})) as NurtureSettingsResponse;
    if (!response.ok || !data.ok) throw new Error(data.error ?? "Could not load nurture settings.");
    if (!data.status) throw new Error("Nurture settings response did not include status.");
    applyStatus(data.status);
    setDashboard(data.dashboard ?? null);
  }, [applyStatus, authHeaders, password]);

  const handleLogin = useCallback(async (event: FormEvent) => {
    event.preventDefault(); setError(""); setLoading(true);
    try { await loadStatus(password); setAuthed(true); saveAdminPassword(password); }
    catch (reason) { clearSavedAdminPassword(); setError(reason instanceof Error ? reason.message : "Invalid admin password."); }
    finally { setLoading(false); }
  }, [loadStatus, password]);

  useEffect(() => {
    const saved = readSavedAdminPassword();
    if (!saved) return;
    setPassword(saved); setLoading(true);
    void loadStatus(saved).catch((reason) => setError(reason instanceof Error ? reason.message : "Could not load nurture settings.")).finally(() => setLoading(false));
  }, [loadStatus]);

  const readiness = useMemo(() => [
    { label: "OpenPhone sender", ready: Boolean(status?.configured) },
    { label: "Secure storage", ready: Boolean(status?.storageReady) },
    { label: "Webhook token", ready: Boolean(status?.eventTokenReady) },
    { label: "Processor schedule", ready: Boolean(dashboard?.lastProcessedAt) },
    { label: "Entry source", ready: entrySources.quoteDisplayed || entrySources.externalWebhook },
    { label: "Message sequence", ready: steps.length > 0 },
  ], [dashboard?.lastProcessedAt, entrySources, status, steps.length]);
  const readyCount = readiness.filter((item) => item.ready).length;

  const updateStep = (id: string, patch: Partial<NurtureDripStep>) => setSteps((current) => current.map((step) => step.id === id ? { ...step, ...patch } : step));
  const addStep = () => setSteps((current) => [...current, { id: `step-${Date.now()}`, delayHours: current.length ? current[current.length - 1].delayHours + 48 : 2, message: "Hi {{firstName}}, following up on your quote from {{businessName}}. Reply STOP to opt out." }]);
  const removeStep = (id: string) => setSteps((current) => current.filter((step) => step.id !== id));

  const handleSave = useCallback(async (event?: FormEvent) => {
    event?.preventDefault(); setError(""); setMessage("");
    if (enabled && !openPhoneApiKey.trim() && !status?.openPhoneApiKeyMasked) { setError("Add an OpenPhone API key before enabling nurture."); setTab("connections"); return; }
    if (enabled && !openPhonePhoneNumberId.trim()) { setError("Add the OpenPhone phone number ID before enabling nurture."); setTab("connections"); return; }
    if (!entrySources.quoteDisplayed && !entrySources.externalWebhook) { setError("Choose at least one entry source."); setTab("journey"); return; }
    setLoading(true);
    try {
      const response = await fetch(adminApiUrl("/api/admin/nurture"), {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ openPhoneApiKey, openPhonePhoneNumberId, openPhoneWebhookSecret, enabled, entrySources, businessName, timezone, quietHoursStart, quietHoursEnd, exclusions, stopRules, steps }),
      });
      const data = await response.json().catch(() => ({})) as NurtureSettingsResponse;
      if (!response.ok || !data.ok) throw new Error(data.error ?? "Could not save nurture settings.");
      if (!data.status) throw new Error("Nurture settings response did not include status.");
      setOpenPhoneApiKey(""); setOpenPhoneWebhookSecret(""); applyStatus(data.status); setDashboard(data.dashboard ?? dashboard); setMessage(data.message ?? "Nurture settings saved.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save nurture settings."); }
    finally { setLoading(false); }
  }, [applyStatus, authHeaders, businessName, dashboard, enabled, entrySources, exclusions, openPhoneApiKey, openPhonePhoneNumberId, openPhoneWebhookSecret, quietHoursEnd, quietHoursStart, status?.openPhoneApiKeyMasked, steps, stopRules, timezone]);

  const processNow = useCallback(async () => {
    setLoading(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/nurture/process?limit=25", { method: "POST", headers: authHeaders() });
      const data = await response.json().catch(() => ({})) as NurtureProcessResponse;
      if (!response.ok || !data.ok) throw new Error(data.error ?? "Could not process nurture messages.");
      await loadStatus(password); setMessage(`Processor finished: ${data.sent ?? 0} sent, ${data.skipped ?? 0} skipped.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not process nurture messages."); }
    finally { setLoading(false); }
  }, [authHeaders, loadStatus, password]);

  const copyValue = async (key: string, value: string) => {
    await navigator.clipboard.writeText(value); setCopied(key); window.setTimeout(() => setCopied(""), 1600);
  };

  if (!authed) return <main className={styles.loginPage}><form className={styles.login} onSubmit={handleLogin}><div className={styles.loginIcon}><HeartHandshake size={24} /></div><p className={styles.eyebrow}>Leads</p><h1>Quote nurture</h1><p>Sign in to manage automatic lead follow-up.</p><label>Admin password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label><button type="submit" disabled={loading}>{loading ? "Checking…" : "Continue"}</button>{error ? <p className={styles.error}>{error}</p> : null}</form></main>;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div><p className={styles.eyebrow}>Leads / Nurture</p><div className={styles.titleRow}><h1>Quote nurture</h1><span className={enabled ? styles.enabledPill : styles.pausedPill}>{enabled ? "Enabled" : "Paused"}</span></div><p>Follow up with quote leads automatically, then hand every reply to your team.</p></div>
        <div className={styles.headerActions}><button className={styles.secondaryButton} type="button" onClick={() => void loadStatus(password)} disabled={loading}><RefreshCw size={16} />Refresh</button><button className={styles.primaryButton} type="button" onClick={() => void handleSave()} disabled={loading}><Save size={16} />{loading ? "Saving…" : "Save changes"}</button></div>
      </header>

      {message ? <div className={styles.notice}><CheckCircle2 size={18} />{message}</div> : null}
      {error ? <div className={styles.error}><Ban size={18} />{error}</div> : null}

      <section className={styles.metrics} aria-label="Nurture totals">
        <Metric icon={<UsersRound />} value={dashboard?.activeCount ?? 0} label="Active journeys" tone="blue" />
        <Metric icon={<Send />} value={dashboard?.sentCount ?? 0} label="Texts sent" tone="violet" />
        <Metric icon={<CheckCircle2 />} value={dashboard?.deliveredCount ?? 0} label="Delivered" tone="green" />
        <Metric icon={<MessageSquareReply />} value={dashboard?.manualCount ?? 0} label="Needs a person" tone="amber" />
        <Metric icon={<CheckCircle2 />} value={dashboard?.signedUpCount ?? 0} label="Converted" tone="green" />
        <Metric icon={<Ban />} value={dashboard?.suppressionCount ?? 0} label="Suppressed" tone="slate" />
      </section>

      <nav className={styles.tabs} aria-label="Nurture sections">
        {([['overview', Activity, 'Overview'], ['journey', Send, 'Journey'], ['rules', Filter, 'Eligibility & stops'], ['connections', Settings2, 'Connections']] as const).map(([value, Icon, label]) => <button type="button" className={tab === value ? styles.activeTab : ""} onClick={() => setTab(value)} key={value}><Icon size={16} />{label}</button>)}
      </nav>

      {tab === "overview" ? <Overview dashboard={dashboard} enabled={enabled} readyCount={readyCount} readiness={readiness} onEnable={() => setEnabled(true)} onProcess={() => void processNow()} loading={loading} /> : null}
      {tab === "journey" ? (
        <div className={styles.twoColumn}>
          <section className={styles.panel}>
            <PanelHeading icon={<Webhook />} title="1. Choose how leads enter" description="Both sources feed the same journey and use phone-number duplicate control." />
            <div className={styles.choiceGrid}>
              <Choice checked={entrySources.quoteDisplayed} onChange={(checked) => setEntrySources((current) => ({ ...current, quoteDisplayed: checked }))} title="Quote displayed" description="Enroll after the website shows a completed quote and the quote tool has passed its required gates." badge="Website" />
              <Choice checked={entrySources.externalWebhook} onChange={(checked) => setEntrySources((current) => ({ ...current, externalWebhook: checked }))} title="Lead webhook" description="Accept consented leads from Make, Zapier, Facebook Lead Ads, or another form source." badge="External" />
            </div>
          </section>
          <section className={styles.panel}>
            <PanelHeading icon={<Clock3 />} title="Sending window" description="Due messages wait during quiet hours and resume afterward." />
            <div className={styles.fieldGrid}><Field label="Timezone"><input value={timezone} onChange={(event) => setTimezone(event.target.value)} placeholder="America/Phoenix" /></Field><Field label="Quiet starts"><input type="time" value={quietHoursStart} onChange={(event) => setQuietHoursStart(event.target.value)} /></Field><Field label="Quiet ends"><input type="time" value={quietHoursEnd} onChange={(event) => setQuietHoursEnd(event.target.value)} /></Field></div>
          </section>
          <section className={`${styles.panel} ${styles.fullWidth}`}>
            <div className={styles.panelHeadingRow}><PanelHeading icon={<Send />} title="2. Build the message sequence" description="Every delay is measured from the moment the lead enters—not from the previous message." /><button type="button" className={styles.secondaryButton} onClick={addStep} disabled={steps.length >= 6}><Plus size={16} />Add message</button></div>
            <div className={styles.timeline}>{steps.map((step, index) => <MessageStep key={step.id} step={step} index={index} canRemove={steps.length > 1} onChange={(change) => updateStep(step.id, change)} onRemove={() => removeStep(step.id)} businessName={businessName} />)}</div>
          </section>
        </div>
      ) : null}

      {tab === "rules" ? (
        <div className={styles.rulesLayout}>
          <section className={styles.panel}>
            <PanelHeading icon={<ShieldCheck />} title="Required gates" description="These are controlled in Quote Tool settings so the website has one source of truth." />
            <div className={styles.lockedRules}><LockedRule title="Valid phone number" description="A usable phone number must be collected." /><LockedRule title="Explicit SMS consent" description="The lead must actively consent before enrollment." /><LockedRule title="Quote requirements" description="Service area and required quote fields are enforced before the quote is displayed." /></div>
            <a className={styles.inlineLink} href="/admin/quote-tool">Open Quote Tool settings</a>
          </section>
          <section className={styles.panel}>
            <PanelHeading icon={<Filter />} title="Configurable exclusions" description="A lead is skipped when any enabled exclusion matches." />
            <Choice checked={exclusions.excludeExistingCustomers} onChange={(checked) => setExclusions((current) => ({ ...current, excludeExistingCustomers: checked }))} title="Existing customers" description="Skip payloads identified as an active or existing customer." />
            <div className={styles.fieldGridTwo}><ListField label="Excluded lead sources" value={exclusions.excludedSources} placeholder="facebook-organic, referral" onChange={(value) => setExclusions((current) => ({ ...current, excludedSources: value }))} /><ListField label="Excluded ZIP codes" value={exclusions.excludedZipCodes} placeholder="85001, 85002" onChange={(value) => setExclusions((current) => ({ ...current, excludedZipCodes: value }))} /><ListField label="Excluded frequencies" value={exclusions.excludedFrequencies} placeholder="one_time, biweekly" onChange={(value) => setExclusions((current) => ({ ...current, excludedFrequencies: value }))} /><Field label="Restart cooldown"><div className={styles.numberSuffix}><input type="number" min={0} max={3650} value={exclusions.cooldownDays} onChange={(event) => setExclusions((current) => ({ ...current, cooldownDays: Number(event.target.value) }))} /><span>days</span></div></Field><Field label="Minimum quote"><input type="number" min={0} placeholder="No minimum" value={exclusions.minimumQuoteTotal ?? ""} onChange={(event) => setExclusions((current) => ({ ...current, minimumQuoteTotal: nullableNumber(event.target.value) }))} /></Field><Field label="Maximum quote"><input type="number" min={0} placeholder="No maximum" value={exclusions.maximumQuoteTotal ?? ""} onChange={(event) => setExclusions((current) => ({ ...current, maximumQuoteTotal: nullableNumber(event.target.value) }))} /></Field></div>
          </section>
          <section className={styles.panel}>
            <PanelHeading icon={<PauseCircle />} title="Stop automation when…" description="These events clear every future message for that phone number." />
            <div className={styles.stopGrid}><Choice checked={stopRules.signup} onChange={(checked) => setStopRules((current) => ({ ...current, signup: checked }))} title="They sign up" description="Customer signup or won lead." /><Choice checked={stopRules.booking} onChange={(checked) => setStopRules((current) => ({ ...current, booking: checked }))} title="They book" description="Appointment or service booked." /><Choice checked={stopRules.payment} onChange={(checked) => setStopRules((current) => ({ ...current, payment: checked }))} title="They pay" description="Deposit or payment completed." /><Choice checked={stopRules.customerCreated} onChange={(checked) => setStopRules((current) => ({ ...current, customerCreated: checked }))} title="Customer is created" description="CRM customer record created." /><LockedRule title="They reply" description="Any reply pauses automation. Your team continues manually in OpenPhone." /><LockedRule title="They opt out" description="STOP creates permanent global suppression by phone number." /></div>
          </section>
        </div>
      ) : null}

      {tab === "connections" ? (
        <div className={styles.connectionsLayout}>
          <section className={styles.panel}>
            <PanelHeading icon={<HeartHandshake />} title="OpenPhone" description="REGGIE sends through this number and listens for replies." />
            <Field label="Business name"><input value={businessName} onChange={(event) => setBusinessName(event.target.value)} placeholder="Used as {{businessName}}" /></Field>
            <Field label={`API key${status?.openPhoneApiKeyMasked ? ` (${status.openPhoneApiKeyMasked})` : ""}`}><input type="password" value={openPhoneApiKey} onChange={(event) => setOpenPhoneApiKey(event.target.value)} placeholder={status?.openPhoneApiKeyMasked ? "Leave blank to keep the saved key" : "Paste API key"} autoComplete="off" /></Field>
            <Field label="Phone number ID"><input value={openPhonePhoneNumberId} onChange={(event) => setOpenPhonePhoneNumberId(event.target.value)} placeholder="PN… or sending phone number" autoComplete="off" /></Field>
            <Field label={`Webhook signing secret${status?.openPhoneWebhookSecretMasked ? ` (${status.openPhoneWebhookSecretMasked})` : ""}`} hint="Used to verify message.received and message.delivered events from OpenPhone."><input type="password" value={openPhoneWebhookSecret} onChange={(event) => setOpenPhoneWebhookSecret(event.target.value)} placeholder={status?.openPhoneWebhookSecretMasked ? "Leave blank to keep the saved secret" : "Paste the base64 signing secret"} autoComplete="off" /></Field>
            {status?.usesEnvOverride ? <p className={styles.callout}>Environment credentials currently override saved OpenPhone credentials.</p> : null}
          </section>
          <section className={styles.panel}>
            <PanelHeading icon={<Webhook />} title="Webhook endpoints" description="Use the lead endpoint for Make, Zapier, Facebook, and other forms." />
            <Endpoint label="New lead" value={webhookUrl} copied={copied === "lead"} onCopy={() => void copyValue("lead", webhookUrl)} note="Authorization: Bearer NURTURE_EVENT_TOKEN" />
            <Endpoint label="Inbound OpenPhone reply" value={replyUrl} copied={copied === "reply"} onCopy={() => void copyValue("reply", replyUrl)} note="Subscribe to message.received; signed requests stop automation." />
            <Endpoint label="Conversion / stop event" value={stopUrl} copied={copied === "stop"} onCopy={() => void copyValue("stop", stopUrl)} note="Reasons: signup, booking, payment, customer_created" />
            <div className={styles.schedulerNote}><Clock3 size={17} /><span><strong>Automatic processor</strong>The installed GitHub workflow checks for due messages every 10 minutes. Set repository variable <code>REGGIE_LIVE_URL</code> and secret <code>NURTURE_EVENT_TOKEN</code>.</span></div>
            {!status?.eventTokenReady ? <div className={styles.warning}><Ban size={17} /><span><strong>Webhook token not configured</strong>External lead and stop endpoints remain locked until support adds <code>NURTURE_EVENT_TOKEN</code>.</span></div> : null}
          </section>
          <section className={`${styles.panel} ${styles.fullWidth}`}>
            <PanelHeading icon={<ShieldCheck />} title="Activation" description="Save first, then enable the journey when every readiness check is green." />
            <div className={styles.activationRow}><label className={styles.activationToggle} aria-label="Nurture activation"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /><span><strong>{enabled ? "Nurture enabled" : "Nurture paused"}</strong><small>{enabled ? "Eligible leads can enter and scheduled texts can send." : "Settings remain saved, but no new messages will send."}</small></span></label><button type="button" className={styles.primaryButton} onClick={() => void handleSave()} disabled={loading}><Save size={16} />Save and apply</button></div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

function Metric({ icon, value, label, tone }: { icon: ReactNode; value: number; label: string; tone: string }) { return <article className={`${styles.metric} ${styles[`metric_${tone}`]}`}><span>{icon}</span><div><strong>{value.toLocaleString()}</strong><small>{label}</small></div></article>; }
function PanelHeading({ icon, title, description }: { icon: ReactNode; title: string; description: string }) { return <div className={styles.panelHeading}><span>{icon}</span><div><h2>{title}</h2><p>{description}</p></div></div>; }
function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) { return <label className={styles.field}><span>{label}</span>{hint ? <small>{hint}</small> : null}{children}</label>; }
function Choice({ checked, onChange, title, description, badge }: { checked: boolean; onChange: (value: boolean) => void; title: string; description: string; badge?: string }) { return <label className={`${styles.choice} ${checked ? styles.choiceChecked : ""}`}><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><span className={styles.choiceCheck}>{checked ? <Check size={14} /> : null}</span><span><strong>{title}{badge ? <em>{badge}</em> : null}</strong><small>{description}</small></span></label>; }
function LockedRule({ title, description }: { title: string; description: string }) { return <div className={styles.lockedRule}><span><Check size={14} /></span><div><strong>{title}</strong><small>{description}</small></div></div>; }
function ListField({ label, value, placeholder, onChange }: { label: string; value: string[]; placeholder: string; onChange: (value: string[]) => void }) { return <Field label={label} hint="Separate values with commas"><input value={value.join(", ")} placeholder={placeholder} onChange={(event) => onChange(event.target.value.split(",").map((item) => item.trim()).filter(Boolean))} /></Field>; }
function Endpoint({ label, value, note, copied, onCopy }: { label: string; value: string; note: string; copied: boolean; onCopy: () => void }) { return <div className={styles.endpoint}><div><strong>{label}</strong><code>{value}</code><small>{note}</small></div><button type="button" onClick={onCopy}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? "Copied" : "Copy"}</button></div>; }

function MessageStep({ step, index, canRemove, onChange, onRemove, businessName }: { step: NurtureDripStep; index: number; canRemove: boolean; onChange: (value: Partial<NurtureDripStep>) => void; onRemove: () => void; businessName: string }) {
  const preview = step.message.replaceAll("{{firstName}}", "Jamie").replaceAll("{{businessName}}", businessName || "Your business").replaceAll("{{quoteTotal}}", "$89").replaceAll("{{quoteLink}}", "your quote link");
  return <article className={styles.messageStep}><div className={styles.timelineMarker}><span>{index + 1}</span></div><div className={styles.messageCard}><div className={styles.messageHeader}><div><strong>Message {index + 1}</strong><span>Send {formatDelay(step.delayHours)} after entry</span></div><button type="button" onClick={onRemove} disabled={!canRemove} aria-label={`Remove message ${index + 1}`}><Trash2 size={16} /></button></div><div className={styles.messageFields}><Field label="Delay from entry"><div className={styles.numberSuffix}><input type="number" min={0} max={720} value={step.delayHours} onChange={(event) => onChange({ delayHours: Number(event.target.value) })} /><span>hours</span></div></Field><Field label="Text message"><textarea value={step.message} onChange={(event) => onChange({ message: event.target.value })} /><small className={styles.characterCount}>{step.message.length}/480</small></Field></div><div className={styles.preview}><span>Preview</span><p>{preview}</p></div></div></article>;
}

function Overview({ dashboard, enabled, readyCount, readiness, onEnable, onProcess, loading }: { dashboard: NurtureDashboard | null; enabled: boolean; readyCount: number; readiness: Array<{ label: string; ready: boolean }>; onEnable: () => void; onProcess: () => void; loading: boolean }) {
  return (
    <div className={styles.overviewLayout}>
      <section className={`${styles.panel} ${styles.journeyMap}`}>
        <PanelHeading icon={<Activity />} title="How this journey works" description="One clear path from quote to human conversation." />
        <div className={styles.flow}>
          <FlowStep icon={<Webhook />} label="Entry" value="Quote displayed or webhook" /><FlowArrow />
          <FlowStep icon={<ShieldCheck />} label="Qualify" value="Required gates + exclusions" /><FlowArrow />
          <FlowStep icon={<Send />} label="Nurture" value="Scheduled OpenPhone texts" /><FlowArrow />
          <FlowStep icon={<MessageSquareReply />} label="Handoff" value="Any reply goes manual" />
        </div>
      </section>
      <section className={styles.panel}>
        <div className={styles.readinessHeader}>
          <PanelHeading icon={<CheckCircle2 />} title="Launch readiness" description={`${readyCount} of ${readiness.length} checks ready`} />
          <span>{Math.round((readyCount / readiness.length) * 100)}%</span>
        </div>
        <div className={styles.progress}><span style={{ width: `${(readyCount / readiness.length) * 100}%` }} /></div>
        <div className={styles.checkList}>{readiness.map((item) => <div key={item.label} className={item.ready ? styles.checkReady : styles.checkMissing}>{item.ready ? <CheckCircle2 size={17} /> : <Clock3 size={17} />}<span>{item.label}</span></div>)}</div>
        {!enabled ? <button className={styles.primaryButton} type="button" onClick={onEnable}><Play size={16} />Ready to enable</button> : null}
      </section>
      <section className={styles.panel}>
        <div className={styles.panelHeadingRow}>
          <PanelHeading icon={<Clock3 />} title="Processor health" description={dashboard?.lastProcessedAt ? `Last ran ${formatRelative(dashboard.lastProcessedAt)}` : "No processor run recorded yet."} />
          <button className={styles.secondaryButton} type="button" onClick={onProcess} disabled={loading}><Play size={15} />Process now</button>
        </div>
        {dashboard?.failedCount ? <div className={styles.warning}><Ban size={17} /><span><strong>{dashboard.failedCount} failed attempts</strong>Each message retries hourly up to three times, then moves to manual review.</span></div> : <div className={styles.healthy}><CheckCircle2 size={18} /><span><strong>No send failures recorded</strong>{dashboard?.deliveredCount ?? 0} texts confirmed delivered.</span></div>}
      </section>
      <section className={`${styles.panel} ${styles.activityPanel}`}>
        <PanelHeading icon={<UsersRound />} title="Recent recipients" description="The newest journey state for each phone number." />
        {dashboard?.recentRecipients?.length ? <div className={styles.tableWrap}><table><thead><tr><th>Lead</th><th>Source</th><th>Status</th><th>Last activity</th><th>Next message</th></tr></thead><tbody>{dashboard.recentRecipients.map((recipient) => <tr key={recipient.id}><td><strong>{recipient.firstName || recipient.phoneE164}</strong><small>{recipient.firstName ? recipient.phoneE164 : recipient.quoteTotal || recipient.quoteId}</small></td><td>{humanize(recipient.source || "website")}</td><td><StatusBadge recipient={recipient} /></td><td>{formatRelative(recipient.updatedAt)}</td><td>{recipient.nextSendAt ? formatDateTime(recipient.nextSendAt) : "—"}</td></tr>)}</tbody></table></div> : <div className={styles.empty}><UsersRound size={26} /><strong>No nurture recipients yet</strong><span>Eligible quote and webhook leads will appear here.</span></div>}
      </section>
      <section className={`${styles.panel} ${styles.activityPanel}`}>
        <PanelHeading icon={<Activity />} title="Recent activity" description="Enrollment, exclusions, sends, deliveries, replies, and stop events." />
        {dashboard?.recentEvents?.length ? <div className={styles.tableWrap}><table><thead><tr><th>Event</th><th>Phone</th><th>Source</th><th>When</th></tr></thead><tbody>{dashboard.recentEvents.map((event) => <tr key={event.id}><td><strong>{humanize(event.eventType)}</strong><small>{typeof event.detail.reason === "string" ? humanize(event.detail.reason) : "Journey event"}</small></td><td>{event.phoneE164 || "—"}</td><td>{humanize(event.source || "system")}</td><td>{formatRelative(event.occurredAt)}</td></tr>)}</tbody></table></div> : <div className={styles.empty}><Activity size={26} /><strong>No nurture activity yet</strong><span>Rule decisions and message events will be logged here.</span></div>}
      </section>
    </div>
  );
}

function FlowStep({ icon, label, value }: { icon: ReactNode; label: string; value: string }) { return <div className={styles.flowStep}><span>{icon}</span><small>{label}</small><strong>{value}</strong></div>; }
function FlowArrow() { return <span className={styles.flowArrow}>→</span>; }
function StatusBadge({ recipient }: { recipient: NurtureRecipientSummary }) { const label = recipient.status === "signed_up" ? "Converted" : recipient.status === "replied" || recipient.status === "paused" ? "Needs a person" : recipient.status === "opted_out" ? "Opted out" : recipient.status === "completed" ? "Completed" : recipient.status === "processing" ? "Sending" : `Message ${recipient.currentStepIndex + 1}`; return <span className={`${styles.statusBadge} ${styles[`status_${recipient.status}`]}`}>{label}</span>; }
function nullableNumber(value: string) { if (!value.trim()) return null; const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; }
function formatDelay(hours: number) { if (hours === 0) return "immediately"; if (hours % 24 === 0) return `${hours / 24} ${hours === 24 ? "day" : "days"}`; return `${hours} ${hours === 1 ? "hour" : "hours"}`; }
function formatDateTime(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); }
function formatRelative(value: string) { const time = new Date(value).getTime(); if (!Number.isFinite(time)) return "never"; const minutes = Math.round((Date.now() - time) / 60000); if (minutes < 1) return "just now"; if (minutes < 60) return `${minutes}m ago`; const hours = Math.round(minutes / 60); if (hours < 24) return `${hours}h ago`; return `${Math.round(hours / 24)}d ago`; }
function humanize(value: string) { return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
