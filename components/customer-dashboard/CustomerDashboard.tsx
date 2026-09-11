"use client";

import {
  ArrowRight,
  BarChart3,
  Bot,
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  FileText,
  Gauge,
  Globe2,
  Image as ImageIcon,
  Lightbulb,
  MapPin,
  MousePointerClick,
  Plug,
  RefreshCw,
  Search,
  Send,
  Settings2,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";

import { adminApiUrl } from "@/lib/admin-api-client";
import { BillingHomeCard } from "@/components/billing/BillingHomeCard";
import { clearSavedAdminPassword, readSavedAdminPassword, saveAdminPassword } from "@/lib/admin-auth-client";
import {
  dashboardActivity,
  dashboardIntegrations,
  dashboardMetrics,
  dashboardRecommendations,
  healthChecks,
} from "@/lib/dashboard-data";
import type { DashboardApiData, DashboardMetric, DashboardSitePage, SiteHealthCheck } from "@/lib/dashboard-models";
import { dashboardSiteProfile } from "@/lib/dashboard-site-profile";
import styles from "./CustomerDashboard.module.css";

export type CustomerDashboardMode =
  | "home"
  | "setup"
  | "website"
  | "pages"
  | "services"
  | "locations"
  | "branding"
  | "growth"
  | "opportunities"
  | "leads"
  | "lead-activity"
  | "lead-sources"
  | "analytics"
  | "settings";

type ApiRecord = Record<string, unknown>;
type SetupIntegrationField = {
  key: string;
  label: string;
  type: "text" | "url" | "password" | "textarea";
  secret: boolean;
  placeholder?: string;
};
type SetupIntegration = {
  provider: string;
  label: string;
  category: string;
  description: string;
  enabled: boolean;
  configured: boolean;
  connectionState?: "not-connected" | "configured" | "connected" | "attention";
  syncState?: "never" | "syncing" | "success" | "error";
  fields?: SetupIntegrationField[];
  config?: Record<string, string>;
  maskedSecrets?: Record<string, string>;
  updatedAt?: string;
};

const setupCrmProviders = ["sweep-and-go", "jobber", "scoopilot", "housecall-pro", "gohighlevel", "quote-tool"] as const;
const setupCommunicationProviders = ["openphone"] as const;

const modeHeadings: Record<CustomerDashboardMode, { eyebrow: string; title: string; description: string }> = {
  home: { eyebrow: "Overview", title: "Dashboard", description: "Your website, leads, and next growth moves in one place." },
  website: { eyebrow: "Website", title: "Your website", description: "Control what customers see without rebuilding pages yourself." },
  pages: { eyebrow: "Website", title: "Pages", description: "See what is live, how each page is performing, and ask Reggie for changes." },
  services: { eyebrow: "Website", title: "Services", description: "Keep every service accurate, useful, and easy to request." },
  locations: { eyebrow: "Website", title: "Locations", description: "Manage published service areas and uncover local growth opportunities." },
  branding: { eyebrow: "Website", title: "Branding", description: "Keep your voice, visuals, and customer experience consistent." },
  growth: { eyebrow: "Growth", title: "Growth snapshot", description: "A focused view of the search and content work most likely to help." },
  opportunities: { eyebrow: "Growth", title: "Opportunities", description: "Prioritized actions based on the website data currently available." },
  leads: { eyebrow: "Leads", title: "Leads overview", description: "Understand where inquiries come from and what happens next." },
  "lead-activity": { eyebrow: "Leads", title: "Form and quote activity", description: "Recent conversion events from your website and quote experience." },
  "lead-sources": { eyebrow: "Leads", title: "Lead sources", description: "See which channels and pages are creating customer interest." },
  analytics: { eyebrow: "Analytics", title: "Website performance", description: "The numbers that matter to a local service business, without the noise." },
  settings: { eyebrow: "Settings", title: "Dashboard settings", description: "Manage business tools, quote preferences, and account access." },
  setup: { eyebrow: "Setup", title: "Setup wizard", description: "Connect the CRM and phone tools that run your leads." },
};

const quickActions = [
  { label: "Create a location page", prompt: "Create a high-quality local service page for a location I serve." },
  { label: "Update website copy", prompt: "Help me update the copy on an existing website page." },
  { label: "Check my SEO", prompt: "Review my website SEO and fix the most important opportunity." },
  { label: "Create a promotion", prompt: "Create a focused promotion and landing page for my business." },
  { label: "Add a service", prompt: "Add a new service to my website and make it easy to request a quote." },
  { label: "Improve a page", prompt: "Improve an existing page so it is clearer and generates more quote requests." },
];

export function CustomerDashboard({ mode }: { mode: CustomerDashboardMode }) {
  const [password, setPassword] = useState(() => readSavedAdminPassword());
  const [authed, setAuthed] = useState(() => Boolean(readSavedAdminPassword()));
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [prompt, setPrompt] = useState("");
  const [data, setData] = useState<DashboardApiData>({});
  const heading = modeHeadings[mode];

  const authorizedRequest = useCallback(async (path: string, token = password) => {
    const response = await fetch(adminApiUrl(path), { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    const payload = await response.json().catch(() => ({})) as ApiRecord;
    if (!response.ok || payload.ok === false) throw new Error(String(payload.error ?? "The dashboard could not load this data."));
    return payload;
  }, [password]);

  const load = useCallback(async (token = password) => {
    const overview = await authorizedRequest("/api/admin/dashboard-overview", token);
    const siteHealth = overview.siteHealth as DashboardApiData["siteHealth"];
    setData({
      dashboard: overview.dashboard as DashboardApiData["dashboard"],
      analytics: overview.analytics as DashboardApiData["analytics"],
      seo: overview.seo as DashboardApiData["seo"],
      rankings: overview.rankings as DashboardApiData["rankings"],
      integrations: overview.integrations as DashboardApiData["integrations"],
      missions: (overview.missions ?? []) as DashboardApiData["missions"],
      siteHealth,
      reggieSetup: overview.reggieSetup as DashboardApiData["reggieSetup"],
    });
    if (healthNeedsRefresh(siteHealth)) {
      void fetch(adminApiUrl("/api/admin/site-health"), { method: "POST", headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }).then(async (response) => { const payload = await response.json().catch(() => ({})) as ApiRecord; if (response.ok && payload.health) setData((current) => ({ ...current, siteHealth: payload.health as DashboardApiData["siteHealth"] })); }).catch(() => undefined);
    }
  }, [authorizedRequest, password]);

  const authenticate = useCallback(async (token: string) => {
    await load(token);
    saveAdminPassword(token);
    setAuthed(true);
  }, [load]);

  useEffect(() => {
    if (authed) window.scrollTo({ top: 0, behavior: "auto" });
  }, [authed]);

  useEffect(() => {
    const saved = readSavedAdminPassword();
    if (!saved) return;
    setPassword(saved);
    setLoading(true);
    void load(saved).catch((reason) => setError(reason instanceof Error ? reason.message : "The dashboard could not load.")).finally(() => setLoading(false));
  }, [load]);

  async function login(event: FormEvent) {
    event.preventDefault();
    setLoading(true); setError("");
    try { await authenticate(password); }
    catch (reason) { clearSavedAdminPassword(); setError(reason instanceof Error ? reason.message : "Could not sign in."); }
    finally { setLoading(false); }
  }

  async function refresh() {
    setRefreshing(true); setError("");
    try { await load(); setMessage("Dashboard updated."); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not refresh the dashboard."); }
    finally { setRefreshing(false); }
  }

  async function submitReggie(event: FormEvent) {
    event.preventDefault();
    if (prompt.trim().length < 12) { setError("Tell Reggie a little more about what you want changed."); return; }
    setLoading(true); setError(""); setMessage("");
    try {
      const response = await fetch(adminApiUrl("/api/admin/reggie-mission"), {
        method: "POST",
        headers: { Authorization: `Bearer ${password}`, "Content-Type": "application/json" },
        body: JSON.stringify({ requestType: "site_revision", title: requestTitle(prompt), prompt: prompt.trim() }),
      });
      const payload = await response.json().catch(() => ({})) as ApiRecord;
      if (!response.ok || payload.ok === false) throw new Error(String(payload.error ?? "Reggie could not accept the request."));
      setPrompt(""); setMessage("Request received. Reggie is getting to work.");
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Reggie could not accept the request."); }
    finally { setLoading(false); }
  }

  async function saveSetupIntegration(provider: string, values: Record<string, string>, shouldTest: boolean) {
    setLoading(true); setError(""); setMessage("");
    try {
      const response = await fetch(adminApiUrl("/api/admin/integrations"), {
        method: "PATCH",
        headers: { Authorization: `Bearer ${password}`, "Content-Type": "application/json" },
        body: JSON.stringify({ provider, enabled: true, values }),
      });
      const payload = await response.json().catch(() => ({})) as ApiRecord;
      if (!response.ok || payload.ok === false) throw new Error(String(payload.error ?? "Integration credentials could not be saved."));
      if (shouldTest) {
        const verifyResponse = await fetch(adminApiUrl("/api/admin/integrations"), {
          method: "POST",
          headers: { Authorization: `Bearer ${password}`, "Content-Type": "application/json" },
          body: JSON.stringify({ provider }),
        });
        const verifyPayload = await verifyResponse.json().catch(() => ({})) as ApiRecord;
        if (!verifyResponse.ok || verifyPayload.ok === false) throw new Error(String(verifyPayload.error ?? "Integration saved, but the connection test failed."));
      }
      setMessage(shouldTest ? "Integration saved and verified." : "Integration saved.");
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Integration setup failed."); }
    finally { setLoading(false); }
  }

  if (!authed) return <DashboardLogin password={password} loading={loading} error={error} setPassword={setPassword} onSubmit={login} />;

  const checks = healthChecks(data);
  const siteHealthy = checks.some((item) => item.id === "online" && item.state === "healthy") && checks.every((item) => item.state !== "attention");
  const metrics = dashboardMetrics(data, siteHealthy);
  const recommendations = dashboardRecommendations(data, dashboardSiteProfile);
  const activities = dashboardActivity(data);

  return (
    <main className={styles.page}>
      {mode === "home" ? <HomeHeader healthy={siteHealthy} /> : <PageHeader {...heading} onRefresh={refresh} refreshing={refreshing} />}
      {message ? <div className={styles.success} role="status"><CheckCircle2 size={17} />{message}</div> : null}
      {error ? <div className={styles.error} role="alert"><CircleAlert size={17} />{error}</div> : null}
      {mode === "home" ? <Home data={data} metrics={metrics} checks={checks} recommendations={recommendations} activities={activities} prompt={prompt} setPrompt={setPrompt} submit={submitReggie} loading={loading} onSaveIntegration={saveSetupIntegration} /> : null}
      {mode === "setup" ? <SetupWizard data={data} loading={loading} onSaveIntegration={saveSetupIntegration} /> : null}
      {mode === "website" ? <WebsiteOverview data={data} /> : null}
      {mode === "pages" ? <SiteInventory title="Website pages" items={dashboardSiteProfile.pages} data={data} empty="No website pages are listed yet." /> : null}
      {mode === "services" ? <SiteInventory title="Services" items={dashboardSiteProfile.services} data={data} empty="No services have been added to the dashboard profile yet." createLabel="Add a service with Reggie" /> : null}
      {mode === "locations" ? <SiteInventory title="Service locations" items={dashboardSiteProfile.locations} data={data} empty="No service locations have been added to the dashboard profile yet." createLabel="Create a location page with Reggie" /> : null}
      {mode === "branding" ? <Branding /> : null}
      {mode === "growth" || mode === "opportunities" ? <Growth data={data} recommendations={recommendations} /> : null}
      {mode === "leads" || mode === "lead-activity" || mode === "lead-sources" ? <Leads data={data} mode={mode} /> : null}
      {mode === "analytics" ? <Analytics data={data} /> : null}
      {mode === "settings" ? <Settings checks={checks} /> : null}
    </main>
  );
}

function DashboardLogin({ password, loading, error, setPassword, onSubmit }: { password: string; loading: boolean; error: string; setPassword: (value: string) => void; onSubmit: (event: FormEvent) => void }) {
  return <main className={styles.page}><section className={styles.loginPanel}><div className={styles.reggieAvatar}><Bot size={25} /></div><p className={styles.eyebrow}>PoopSites Dashboard</p><h1>Welcome back</h1><p>Sign in to manage your website and marketing.</p><form onSubmit={onSubmit}><label htmlFor="dashboard-password">Dashboard password</label><input id="dashboard-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /><button type="submit" disabled={loading}>{loading ? "Signing in..." : "Continue"}<ArrowRight size={16} /></button></form>{error ? <div className={styles.error} role="alert">{error}</div> : null}</section></main>;
}

function HomeHeader({ healthy }: { healthy: boolean }) {
  const greeting = timeGreeting();
  return <header className={styles.homeHeader}><div><p className={styles.eyebrow}>Dashboard</p><h1>{greeting}, {dashboardSiteProfile.name}</h1><p>Your website {healthy ? "is healthy" : "has a few items to review"}. Here&apos;s what has happened recently.</p></div><a className={styles.secondaryButton} href="/" target="_blank" rel="noreferrer">View website<ExternalLink size={15} /></a></header>;
}

function PageHeader({ eyebrow, title, description, onRefresh, refreshing }: { eyebrow: string; title: string; description: string; onRefresh: () => void; refreshing: boolean }) {
  return <header className={styles.pageHeader}><div><p className={styles.eyebrow}>{eyebrow}</p><h1>{title}</h1><p>{description}</p></div><button className={styles.iconTextButton} type="button" onClick={onRefresh} disabled={refreshing}><RefreshCw size={15} className={refreshing ? styles.spin : ""} />{refreshing ? "Refreshing" : "Refresh"}</button></header>;
}

function Home({ data, metrics, checks, recommendations, activities, prompt, setPrompt, submit, loading, onSaveIntegration }: { data: DashboardApiData; metrics: DashboardMetric[]; checks: SiteHealthCheck[]; recommendations: ReturnType<typeof dashboardRecommendations>; activities: ReturnType<typeof dashboardActivity>; prompt: string; setPrompt: (value: string) => void; submit: (event: FormEvent) => void; loading: boolean; onSaveIntegration: (provider: string, values: Record<string, string>, shouldTest: boolean) => Promise<void> }) {
  return <>
    <MetricStrip metrics={metrics} />
    <BillingHomeCard />
    <GetStartedSetup data={data} loading={loading} onSaveIntegration={onSaveIntegration} />
    <ReggiePrompt prompt={prompt} setPrompt={setPrompt} submit={submit} loading={loading} />
    <section className={styles.section}><SectionHeader icon={<Lightbulb size={18} />} title="Recommended for you" description="The clearest next steps based on the data available now." href="/admin/growth/opportunities" linkLabel="View all" /><RecommendationGrid recommendations={recommendations} /></section>
    <div className={styles.dashboardColumns}>
      <section className={styles.section}><SectionHeader icon={<Sparkles size={18} />} title="Recent activity" description="Website and lead events in plain English." /><ActivityFeed activities={activities} /></section>
      <section className={styles.section}><SectionHeader icon={<Gauge size={18} />} title="Site health" description="Checks that keep your website ready for customers." href="/admin/settings" linkLabel="View checks" /><SiteHealth checks={checks.slice(0, 5)} /></section>
    </div>
    <GrowthSnapshot data={data} />
  </>;
}

function SetupWizard({ data, loading, onSaveIntegration }: { data: DashboardApiData; loading: boolean; onSaveIntegration: (provider: string, values: Record<string, string>, shouldTest: boolean) => Promise<void> }) {
  return <><GetStartedSetup data={data} loading={loading} onSaveIntegration={onSaveIntegration} /><section className={styles.section}><SectionHeader icon={<Plug size={18} />} title="More integrations" description="Analytics, search, advertising, and advanced service connections are available in the full integrations workspace." href="/admin/integrations" linkLabel="Open integrations" /></section></>;
}

function GetStartedSetup({ data, loading, onSaveIntegration }: { data: DashboardApiData; loading: boolean; onSaveIntegration: (provider: string, values: Record<string, string>, shouldTest: boolean) => Promise<void> }) {
  const integrations = ((data.integrations?.integrations ?? []) as SetupIntegration[]);
  const providerById = new Map(integrations.map((item) => [item.provider, item]));
  const connectedCrm = setupCrmProviders.find((provider) => setupReady(providerById.get(provider)));
  const connectedPhone = setupCommunicationProviders.find((provider) => setupReady(providerById.get(provider)));
  const [step, setStep] = useState(connectedCrm || connectedPhone ? 2 : 1);
  const [crmProvider, setCrmProvider] = useState<string>(connectedCrm ?? "sweep-and-go");
  const [communicationProvider, setCommunicationProvider] = useState<string>(connectedPhone ?? "openphone");
  const selectedProviders = [crmProvider, communicationProvider].filter((provider, index, list) => provider !== "none" && list.indexOf(provider) === index);
  const complete = selectedProviders.length ? selectedProviders.every((provider) => setupReady(providerById.get(provider))) : true;

  return <section className={styles.getStarted}>
    {data.reggieSetup && !data.reggieSetup.complete ? <div className={styles.error} role="alert"><CircleAlert size={17} /><div><strong>PoopSites setup is incomplete</strong><p>{data.reggieSetup.issues.join(" ")} Contact the web team before relying on revisions, publishing, media, or stored integrations.</p></div></div> : null}
    <div className={styles.getStartedHeader}>
      <div><p className={styles.eyebrow}>Get started</p><h2>Connect the tools that run your leads</h2><p>Choose the CRM and phone setup this site should use, then paste the credentials each provider needs.</p></div>
      <div className={styles.setupProgress}><span className={step >= 1 ? styles.activeStep : ""}>1</span><i /><span className={step >= 2 ? styles.activeStep : ""}>2</span><i /><span className={complete ? styles.activeStep : ""}>3</span></div>
    </div>
    <div className={styles.setupGrid}>
      <div className={styles.setupChooser}>
        <h3>CRM</h3>
        <div className={styles.providerChoices}>
          {setupCrmProviders.map((provider) => <ProviderChoice key={provider} integration={providerById.get(provider)} selected={crmProvider === provider} onClick={() => { setCrmProvider(provider); setStep(2); }} />)}
          <button type="button" className={crmProvider === "none" ? styles.selectedChoice : ""} onClick={() => { setCrmProvider("none"); setStep(2); }}><strong>No CRM</strong><small>Keep leads in the dashboard for now.</small></button>
        </div>
        <h3>Phone and SMS</h3>
        <div className={styles.providerChoices}>
          {setupCommunicationProviders.map((provider) => <ProviderChoice key={provider} integration={providerById.get(provider)} selected={communicationProvider === provider} onClick={() => { setCommunicationProvider(provider); setStep(2); }} />)}
          <button type="button" className={communicationProvider === "none" ? styles.selectedChoice : ""} onClick={() => { setCommunicationProvider("none"); setStep(2); }}><strong>No phone provider</strong><small>Skip automated calls and SMS for now.</small></button>
        </div>
      </div>
      <div className={styles.setupForms}>
        <h3>{complete ? "Setup complete" : "Paste credentials"}</h3>
        {selectedProviders.length ? selectedProviders.map((provider) => <SetupIntegrationForm key={`${provider}:${providerById.get(provider)?.updatedAt ?? ""}`} integration={providerById.get(provider)} loading={loading} onSave={onSaveIntegration} />) : <div className={styles.setupDone}><CheckCircle2 size={22} /><strong>No external tools selected</strong><p>The dashboard can collect website activity and quote events without a CRM or phone provider.</p></div>}
      </div>
    </div>
  </section>;
}

function ProviderChoice({ integration, selected, onClick }: { integration?: SetupIntegration; selected: boolean; onClick: () => void }) {
  return <button type="button" className={selected ? styles.selectedChoice : ""} onClick={onClick}>
    <strong>{integration?.label ?? "Provider"}</strong>
    <small>{setupReady(integration) ? "Connected" : integration?.configured ? "Needs attention" : "Not connected"}</small>
  </button>;
}

function SetupIntegrationForm({ integration, loading, onSave }: { integration?: SetupIntegration; loading: boolean; onSave: (provider: string, values: Record<string, string>, shouldTest: boolean) => Promise<void> }) {
  const [values, setValues] = useState<Record<string, string>>(() => ({ ...(integration?.config ?? {}) }));
  if (!integration) return null;
  const fields = integration.fields ?? [];
  const hasTest = integration.provider === "sweep-and-go" || integration.provider === "google-analytics" || integration.provider === "google-search-console" || integration.provider === "google-pagespeed";
  const ready = setupReady(integration);
  if (integration.provider === "warren") return <div className={styles.setupForm}>
    <div className={styles.setupFormHeader}><div><strong>{integration.label}</strong><span>Managed securely by PoopSites. No GitHub, Cloudflare, Google, or API credentials are required from you.</span></div><StatusBadge status={ready ? "Connected" : "PoopSites setup pending"} /></div>
  </div>;
  return <form className={styles.setupForm} onSubmit={(event) => { event.preventDefault(); void onSave(integration.provider, values, hasTest); }}>
    <div className={styles.setupFormHeader}><div><strong>{integration.label}</strong><span>{integration.description}</span></div><StatusBadge status={ready ? "Connected" : integration.configured ? "Needs attention" : "Not connected"} /></div>
    <div className={styles.setupFieldGrid}>{fields.map((field) => <label key={field.key}><span>{field.label}</span>{field.type === "textarea" ? <textarea value={values[field.key] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))} placeholder={integration.maskedSecrets?.[field.key] || field.placeholder} spellCheck={false} /> : <input type={field.type} value={values[field.key] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))} placeholder={integration.maskedSecrets?.[field.key] || field.placeholder} autoComplete="off" />}</label>)}</div>
    <button type="submit" disabled={loading}>{loading ? "Saving..." : hasTest ? "Save and verify" : "Save connection"}<ArrowRight size={14} /></button>
  </form>;
}

function MetricStrip({ metrics }: { metrics: DashboardMetric[] }) {
  const icons = { leads: Users, visitors: Globe2, conversion: MousePointerClick, health: Gauge };
  return <section className={styles.metricStrip} aria-label="Website performance summary">{metrics.map((metric) => { const Icon = icons[metric.id]; return <article className={styles.metric} key={metric.id}><div className={styles.metricTop}><span>{metric.label}</span><Icon size={17} /></div><div className={styles.metricValue}>{metric.value}{metric.change !== null && metric.change !== undefined ? <Trend value={metric.change} /> : null}</div><small>{metric.detail}</small></article>; })}</section>;
}

function Trend({ value }: { value: number }) { const positive = value >= 0; return <span className={positive ? styles.trendUp : styles.trendDown}>{positive ? <TrendingUp size={13} /> : <TrendingDown size={13} />}{Math.abs(value)}%</span>; }

function ReggiePrompt({ prompt, setPrompt, submit, loading }: { prompt: string; setPrompt: (value: string) => void; submit: (event: FormEvent) => void; loading: boolean }) {
  return <section className={styles.reggiePrompt}><div className={styles.reggieHeading}><div className={styles.reggieAvatar}><Bot size={22} /></div><div><span>Reggie</span><h2>What would you like to change on your website?</h2></div></div><form onSubmit={submit}><label className={styles.srOnly} htmlFor="reggie-dashboard-prompt">Describe a website revision or landing page</label><textarea id="reggie-dashboard-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Revise my homepage CTA, update a service page, or create a new landing page..." /><button type="submit" aria-label="Send request to Reggie" title="Send request" disabled={loading || prompt.trim().length < 12}><Send size={18} /></button></form><p>Reggie focuses on revisions to your existing website and new landing pages.</p><div className={styles.quickActions}>{quickActions.map((item) => <button type="button" key={item.label} onClick={() => setPrompt(item.prompt)}>{item.label}</button>)}</div></section>;
}

function SectionHeader({ icon, title, description, href, linkLabel }: { icon?: ReactNode; title: string; description?: string; href?: string; linkLabel?: string }) {
  return <div className={styles.sectionHeader}><div><h2>{icon}{title}</h2>{description ? <p>{description}</p> : null}</div>{href ? <Link href={href}>{linkLabel}<ArrowRight size={14} /></Link> : null}</div>;
}

function RecommendationGrid({ recommendations }: { recommendations: ReturnType<typeof dashboardRecommendations> }) {
  if (!recommendations.length) return <EmptyState icon={<CheckCircle2 size={24} />} title="You are caught up" description="No immediate website or growth recommendations are available." />;
  const icons = { website: Globe2, seo: Search, content: FileText, integration: Settings2 };
  return <div className={styles.recommendationGrid}>{recommendations.map((item) => { const Icon = icons[item.category]; return <article className={styles.recommendation} key={item.id}><div className={styles.recommendationIcon}><Icon size={18} /></div><div><span className={styles.priority}>{item.priority} priority</span><h3>{item.title}</h3><p>{item.reason}</p><Link href={item.href}>{item.actionLabel}<ArrowRight size={14} /></Link></div></article>; })}</div>;
}

function ActivityFeed({ activities }: { activities: ReturnType<typeof dashboardActivity> }) {
  if (!activities.length) return <EmptyState icon={<Sparkles size={24} />} title="Nothing to report yet" description="Reggie requests, published content, and lead activity will appear here." />;
  return <div className={styles.activityFeed}>{activities.map((item) => <div className={styles.activityItem} key={item.id}><span className={`${styles.activityDot} ${styles[`status_${item.status}`]}`} /><div><strong>{item.title}</strong><span>{item.detail}</span></div><time dateTime={item.occurredAt}>{formatDate(item.occurredAt)}</time></div>)}</div>;
}

function SiteHealth({ checks }: { checks: SiteHealthCheck[] }) {
  return <div className={styles.healthList}>{checks.map((item) => <div className={styles.healthItem} key={item.id}>{item.state === "healthy" ? <CheckCircle2 size={18} className={styles.healthyIcon} /> : item.state === "attention" ? <CircleAlert size={18} className={styles.attentionIcon} /> : <span className={styles.unknownDot} />}<div><strong>{item.label}</strong><span>{item.detail}</span></div><StatusBadge status={item.state === "healthy" ? "Healthy" : item.state === "attention" ? "Needs attention" : "Optional"} /></div>)}</div>;
}

function GrowthSnapshot({ data }: { data: DashboardApiData }) {
  const analytics = data.analytics;
  const gaConnected = dashboardIntegrations(data).some((item) => item.provider === "google-analytics" && item.state === "connected");
  return <section className={styles.section}><SectionHeader icon={<BarChart3 size={18} />} title="Growth snapshot" description="A quick view of where customers are finding you." href="/admin/analytics" linkLabel="Open analytics" />{analytics ? <div className={styles.growthGrid}><RankedList title="Top landing pages" items={(analytics.topPages ?? []).slice(0, 5).map((item) => ({ label: pageLabel(item.path), value: item.count }))} empty="No customer page visits recorded yet." /><RankedList title="Top sources" items={(analytics.topSources ?? []).slice(0, 5).map((item) => ({ label: item.source || "Direct", value: item.count }))} empty="No customer traffic sources recorded yet." /><div className={styles.connectionPanel}><Target size={22} /><h3>{gaConnected ? "Google Analytics connected" : "Add visitor trends"}</h3><p>{gaConnected ? "Google Analytics is available alongside first-party events." : "Connect Google Analytics to see broader visitor and campaign trends."}</p><Link href="/admin/integrations#google-analytics">{gaConnected ? "Manage connection" : "Connect Google Analytics"}<ArrowRight size={14} /></Link></div></div> : <EmptyState icon={<BarChart3 size={24} />} title="Connect analytics to see trends" description="First-party website events and connected analytics will populate this section." actionHref="/admin/integrations" actionLabel="Open integrations" />}</section>;
}

function WebsiteOverview({ data }: { data: DashboardApiData }) {
  const groups = [{ title: "Pages", count: dashboardSiteProfile.pages.length, href: "/admin/website/pages", icon: FileText }, { title: "Services", count: dashboardSiteProfile.services.length, href: "/admin/website/services", icon: Sparkles }, { title: "Locations", count: dashboardSiteProfile.locations.length, href: "/admin/website/locations", icon: MapPin }, { title: "Media", count: data.dashboard?.counts?.mediaAssets ?? 0, href: "/admin/media", icon: ImageIcon }];
  return <><div className={styles.inventorySummary}>{groups.map((item) => { const Icon = item.icon; return <Link key={item.title} href={item.href}><Icon size={20} /><span>{item.title}</span><strong>{item.count}</strong><ArrowRight size={15} /></Link>; })}</div><section className={styles.section}><SectionHeader title="Recently managed pages" href="/admin/website/pages" linkLabel="All pages" /><PageTable items={enrichPages(dashboardSiteProfile.pages, data)} /></section></>;
}

function SiteInventory({ title, items, data, empty, createLabel = "Create with Reggie" }: { title: string; items: DashboardSitePage[]; data: DashboardApiData; empty: string; createLabel?: string }) {
  const enriched = enrichPages(items, data);
  return <section className={styles.section}><SectionHeader title={title} description={`${enriched.filter((item) => item.status === "published").length} published`} href={`/admin/reggie?prompt=${encodeURIComponent(createLabel)}`} linkLabel={createLabel} />{enriched.length ? <PageTable items={enriched} /> : <EmptyState icon={<Globe2 size={24} />} title={empty} description="Reggie can create and maintain these pages without a page builder." actionHref={`/admin/reggie?prompt=${encodeURIComponent(createLabel)}`} actionLabel={createLabel} />}</section>;
}

function PageTable({ items }: { items: DashboardSitePage[] }) {
  return <div className={styles.tableWrap}><table><thead><tr><th>Page</th><th>Status</th><th>SEO</th><th>Last updated</th><th><span className={styles.srOnly}>Actions</span></th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><strong>{item.title}</strong><small>{item.path}</small></td><td><StatusBadge status={capitalize(item.status)} /></td><td>{item.seoScore === null || item.seoScore === undefined ? <span className={styles.muted}>Not scored</span> : <span className={item.seoScore >= 75 ? styles.scoreGood : styles.scoreWarn}>{item.seoScore}/100</span>}</td><td>{item.updatedAt ? formatDate(item.updatedAt) : "-"}</td><td><div className={styles.tableActions}><a href={item.path} target="_blank" rel="noreferrer" title={`View ${item.title}`} aria-label={`View ${item.title}`}><ExternalLink size={16} /></a><Link href={`/admin/reggie?prompt=${encodeURIComponent(`Improve ${item.title} at ${item.path}.`)}`}>Edit with Reggie</Link></div></td></tr>)}</tbody></table></div>;
}

function Branding() {
  const actions = [{ title: "Voice and messaging", description: "Update how the website sounds and what it emphasizes.", prompt: "Help me update my website voice and messaging." }, { title: "Colors and visual style", description: "Request a visual refresh while preserving the working website.", prompt: "Help me update my website colors and visual style." }, { title: "Logo and imagery", description: "Replace brand assets and keep media organized.", href: "/admin/media" }];
  return <div className={styles.brandLayout}><section className={styles.brandSummary}><div className={styles.brandPreview}>{dashboardSiteProfile.name.slice(0, 1).toUpperCase()}</div><div><span>Current brand</span><h2>{dashboardSiteProfile.name}</h2><p>Reggie applies approved brand direction consistently across website changes.</p></div></section><section className={styles.section}><SectionHeader title="Brand controls" description="Tell Reggie what should change; the site structure stays protected." /><div className={styles.actionList}>{actions.map((item) => <div key={item.title}><div><strong>{item.title}</strong><span>{item.description}</span></div><Link href={item.href ?? `/admin/reggie?prompt=${encodeURIComponent(item.prompt ?? "")}`}>{item.href ? "Open media" : "Update with Reggie"}<ArrowRight size={14} /></Link></div>)}</div></section></div>;
}

function Growth({ data, recommendations }: { data: DashboardApiData; recommendations: ReturnType<typeof dashboardRecommendations> }) {
  const seoPages = data.seo?.pages ?? [];
  const average = seoPages.length ? Math.round(seoPages.reduce((sum, page) => sum + page.score, 0) / seoPages.length) : null;
  const keywords = data.rankings?.keywords ?? [];
  const search = data.seo?.searchConsole?.data;
  return <><div className={styles.summaryStrip}><SummaryItem label="SEO pages reviewed" value={seoPages.length ? String(seoPages.length) : "-"} /><SummaryItem label="Average SEO score" value={average === null ? "-" : `${average}/100`} /><SummaryItem label={search ? "Search clicks" : "Searches tracked"} value={search ? String(search.clicks) : keywords.length ? String(keywords.length) : "-"} /><SummaryItem label={search ? "Search impressions" : "Content published"} value={search ? String(search.impressions) : String(data.dashboard?.counts?.blogPosts ?? 0)} /></div><section className={styles.section}><SectionHeader title="Priority opportunities" description="Work from the top down for the clearest impact." /><RecommendationGrid recommendations={recommendations} /></section><div className={styles.dashboardColumns}><section className={styles.section}><SectionHeader title="Search visibility" href="/admin/seo" linkLabel="Open SEO" /><RankedList title={search ? "Google searches" : "Tracked searches"} items={search ? search.topQueries.slice(0, 6).map((item) => ({ label: item.query, value: item.position ? `#${Math.round(item.position)}` : "-" })) : keywords.slice(0, 6).map((item) => ({ label: item.keyword, value: item.latestPosition ? `#${Math.round(item.latestPosition)}` : "-" }))} empty={data.seo?.searchConsole?.state === "error" ? "Search Console needs attention." : "No search rankings are available yet."} /></section><section className={styles.section}><SectionHeader title="Content momentum" href="/admin/blog-posts" linkLabel="Open content" /><ActivityFeed activities={dashboardActivity(data).filter((item) => item.id.startsWith("content-"))} /></section></div></>;
}

function Leads({ data, mode }: { data: DashboardApiData; mode: "leads" | "lead-activity" | "lead-sources" }) {
  const analytics = data.analytics;
  const conversions = analytics?.conversions;
  const visitors = analytics?.visitors;
  const conversionRate = visitors && conversions !== undefined ? `${((conversions / visitors) * 100).toFixed(1)}%` : "-";
  const conversionEvents = (analytics?.recentEvents ?? []).filter((event) => ["quote_submitted", "quote_completed", "lead_created", "booking_completed", "conversion"].includes(event.eventName));
  const topSource = analytics?.topSources?.[0]?.source || "-";
  const topPage = analytics?.topPages?.[0]?.path ? pageLabel(analytics.topPages[0].path) : "-";
  return <><div className={styles.summaryStrip}><SummaryItem label="New leads" value={conversions === undefined ? "-" : String(conversions)} /><SummaryItem label="Lead conversion" value={conversionRate} /><SummaryItem label="Top source" value={topSource} /><SummaryItem label="Top landing page" value={topPage} /></div>{mode === "lead-sources" ? <section className={styles.section}><SectionHeader title="Sources" description="Channels recorded by first-party website tracking." /><RankedList title="Lead and visitor sources" items={(analytics?.topSources ?? []).map((item) => ({ label: item.source || "Direct", value: item.count }))} empty="No source data is available yet." /></section> : <section className={styles.section}><SectionHeader title={mode === "lead-activity" ? "Recent form and quote activity" : "Recent leads"} description="Contact details will appear when a CRM or quote provider supplies them." />{conversionEvents.length ? <div className={styles.tableWrap}><table><thead><tr><th>Activity</th><th>Date</th><th>Source</th><th>Landing page</th><th>Status</th></tr></thead><tbody>{conversionEvents.map((event) => <tr key={event.id}><td><strong>{eventLabel(event.eventName)}</strong></td><td>{formatDate(event.occurredAt)}</td><td>{event.source || "Direct"}</td><td>{pageLabel(event.path)}</td><td><StatusBadge status="New" /></td></tr>)}</tbody></table></div> : <EmptyState icon={<Users size={24} />} title="No lead records are available yet" description="First-party conversion events will appear here. Connect your quote tool or CRM to add customer details and pipeline status." actionHref="/admin/integrations" actionLabel="Connect a lead source" />}</section>}</>;
}

function Analytics({ data }: { data: DashboardApiData }) {
  const analytics = data.analytics;
  const searchData = data.seo?.searchConsole?.data;
  const visitors = analytics?.visitors ?? 0;
  const quoteStarts = analytics?.quoteStarts ?? 0;
  const leads = analytics?.conversions ?? 0;
  const leadRate = visitors ? (leads / visitors) * 100 : 0;
  const topSource = analytics?.topSources?.[0];
  const topPage = analytics?.topPages?.[0];
  const opportunities = analytics?.market?.opportunities ?? [];
  const reportingSource = analytics?.dataSource === "warren" || analytics?.dataSource === "google-analytics" ? "Google Analytics and website actions" : "Website actions";
  const readout = leads > 0
    ? { title: `${leads} new ${leads === 1 ? "lead" : "leads"} from ${visitors} visitors`, detail: `The website turned ${leadRate.toFixed(1)}% of visitors into inquiries in the last 30 days.` }
    : quoteStarts > 0
      ? { title: "People are interested, but the quote path is not finishing", detail: `${quoteStarts} ${quoteStarts === 1 ? "person started" : "people started"} a quote, but no completed leads were recorded. This is the first place to improve.` }
      : visitors > 0
        ? { title: "The website is attracting visitors but not inquiries yet", detail: `${visitors} people visited in the last 30 days. The next goal is getting more of them to start a quote.` }
        : { title: "Reporting is connected and collecting activity", detail: "There is not enough recent traffic yet to judge performance. Nothing needs to be configured on this page." };
  return <>
    <section className={styles.performanceReadout}><div className={styles.readoutIcon}><Target size={22} /></div><div><span>What this means</span><h2>{readout.title}</h2><p>{readout.detail}</p><small>{reportingSource}{analytics?.lastSyncedAt ? ` | Updated ${formatDate(analytics.lastSyncedAt)}` : ""}</small></div></section>
    <section className={styles.ownerMetricGrid} aria-label="Website results for the last 30 days">
      <PerformanceKpi label="People who visited" value={visitors} detail="Potential customers reached" icon={<Globe2 size={18} />} />
      <PerformanceKpi label="Started a quote" value={quoteStarts} detail={visitors ? `${((quoteStarts / visitors) * 100).toFixed(1)}% of visitors` : "No visitor baseline yet"} icon={<MousePointerClick size={18} />} />
      <PerformanceKpi label="Became a lead" value={leads} detail="Completed inquiries" icon={<Users size={18} />} />
      <PerformanceKpi label="Visitor-to-lead rate" value={`${leadRate.toFixed(1)}%`} detail="The number to improve" icon={<TrendingUp size={18} />} />
    </section>
    <section className={styles.section}><SectionHeader title="Customer journey" description="How many people moved from visiting the site to contacting the business." /><div className={styles.journey}><JourneyStep label="Visited the website" value={visitors} width={100} /><JourneyStep label="Started a quote" value={quoteStarts} width={visitors ? (quoteStarts / visitors) * 100 : 0} /><JourneyStep label="Became a lead" value={leads} width={visitors ? (leads / visitors) * 100 : 0} /></div>{quoteStarts > 0 && leads === 0 ? <p className={styles.journeyNote}><CircleAlert size={16} />The biggest opportunity is between starting a quote and becoming a lead. REGGIE should review that handoff first.</p> : null}</section>
    <div className={styles.dashboardColumns}>
      <section className={styles.section}><SectionHeader title="Where customers came from" description={topSource ? `${trafficSourceLabel(topSource.source)} brought the most traffic.` : "How potential customers found the website."} /><RankedList title="Customer sources" items={(analytics?.topSources ?? []).slice(0, 6).map((item) => ({ label: trafficSourceLabel(item.source), value: visitLabel(item.count) }))} empty="Traffic sources will appear as more people visit." /></section>
      <section className={styles.section}><SectionHeader title="What customers looked at" description={topPage ? `${pageLabel(topPage.path)} was the most visited page.` : "The pages drawing the most customer attention."} /><RankedList title="Popular pages" items={(analytics?.topPages ?? []).slice(0, 6).map((item) => ({ label: pageLabel(item.path), value: visitLabel(item.count) }))} empty="Popular pages will appear as more people visit." /></section>
    </div>
    <section className={styles.section}><SectionHeader title="Google search" description="The searches that can bring more customers to the site." />{searchData ? <><div className={styles.searchSummary}><SummaryItem label="Visits from Google search" value={String(searchData.clicks)} /><SummaryItem label="Times shown in Google" value={String(searchData.impressions)} /><SummaryItem label="Search click rate" value={`${searchData.ctr.toFixed(1)}%`} /><SummaryItem label="Typical Google position" value={searchData.position ? `#${searchData.position.toFixed(1)}` : "-"} /></div><div className={styles.dashboardColumns}><RankedList title="Searches customers used" items={searchData.topQueries.slice(0, 6).map((item) => ({ label: item.query, value: visitLabel(item.clicks) }))} empty="Google has not reported customer searches yet." /><RankedList title="Pages found in Google" items={searchData.topPages.slice(0, 6).map((item) => ({ label: pageLabel(item.path), value: visitLabel(item.clicks) }))} empty="Google has not reported landing pages yet." /></div></> : <div className={styles.reportingNotice}><Search size={22} /><div><strong>Google search reporting is being prepared</strong><p>Nothing needs to be pasted or configured here. WARREN will add customer searches and page opportunities as soon as Google returns the first report.</p></div></div>}</section>
    <section className={styles.section}><SectionHeader title="Best next moves" description="WARREN combines Google search performance with competitor intelligence, then gives REGGIE work it can act on." />{opportunities.length ? <div className={styles.opportunityList}>{opportunities.slice(0, 6).map((item) => <article key={item.id}><div className={styles.opportunityType}>{item.type === "competitor" ? <Target size={17} /> : <Search size={17} />}<span>{item.source}</span></div><h3>{item.title}</h3><p>{item.reason}</p><Link href={`/admin/reggie?prompt=${encodeURIComponent(item.action)}`}>Ask REGGIE to do this<ArrowRight size={14} /></Link></article>)}</div> : <div className={styles.reportingNotice}><Sparkles size={22} /><div><strong>WARREN is building the first recommendations</strong><p>Search and competitor findings will appear here automatically. Owners will only see opportunities that can become a practical website action.</p></div></div>}</section>
  </>;
}

function PerformanceKpi({ label, value, detail, icon }: { label: string; value: string | number; detail: string; icon: ReactNode }) {
  return <article><div><span>{label}</span>{icon}</div><strong>{value}</strong><small>{detail}</small></article>;
}

function JourneyStep({ label, value, width }: { label: string; value: number; width: number }) {
  return <div><div><span>{label}</span><strong>{value}</strong></div><span className={styles.journeyTrack}><i style={{ width: `${value ? Math.max(8, Math.min(100, width)) : 0}%` }} /></span></div>;
}

function Settings({ checks }: { checks: SiteHealthCheck[] }) {
  return <div className={styles.settingsGrid}><section className={styles.section}><SectionHeader title="Business tools" /><div className={styles.actionList}><SettingsLink title="Quote tool settings" description="Pricing, service areas, booking handoff, and quote rules." href="/admin/quote-tool" /><SettingsLink title="Integrations" description="Analytics, search, advertising, communications, and field-service tools." href="/admin/integrations" /><SettingsLink title="Nurture" description="Lead follow-up status and customer messaging sequence." href="/admin/nurture" /></div></section><section className={styles.section}><SectionHeader title="Site health" /><SiteHealth checks={checks} /></section><section className={styles.section}><SectionHeader title="Account" /><div className={styles.accountRow}><div><strong>Dashboard access</strong><span>Your existing admin password protects this dashboard.</span></div><button type="button" onClick={() => { clearSavedAdminPassword(); window.location.assign("/admin"); }}>Sign out</button></div></section></div>;
}

function SettingsLink({ title, description, href }: { title: string; description: string; href: string }) { return <div><div><strong>{title}</strong><span>{description}</span></div><Link href={href}>Manage<ArrowRight size={14} /></Link></div>; }

function SummaryItem({ label, value }: { label: string; value: string }) { return <div><span>{label}</span><strong>{value}</strong></div>; }

function RankedList({ title, items, empty }: { title: string; items: Array<{ label: string; value: string | number }>; empty: string }) {
  if (!items.length) return <EmptyState icon={<BarChart3 size={22} />} title={empty} />;
  const max = Math.max(...items.map((item) => typeof item.value === "number" ? item.value : 0), 1);
  return <div className={styles.rankedList} aria-label={title}>{items.map((item, index) => <div key={`${item.label}-${index}`}><span className={styles.rank}>{index + 1}</span><div><strong>{item.label}</strong>{typeof item.value === "number" ? <span className={styles.bar}><i style={{ width: `${Math.max(8, (item.value / max) * 100)}%` }} /></span> : null}</div><b>{item.value}</b></div>)}</div>;
}

function StatusBadge({ status }: { status: string }) { const key = status.toLowerCase().replaceAll(" ", "-"); return <span className={`${styles.badge} ${styles[`badge_${key}`] ?? ""}`}>{status}</span>; }

function EmptyState({ icon, title, description, actionHref, actionLabel }: { icon: ReactNode; title: string; description?: string; actionHref?: string; actionLabel?: string }) { return <div className={styles.emptyState}>{icon}<strong>{title}</strong>{description ? <p>{description}</p> : null}{actionHref ? <Link href={actionHref}>{actionLabel}<ArrowRight size={14} /></Link> : null}</div>; }

function enrichPages(items: DashboardSitePage[], data: DashboardApiData) {
  const seo = new Map((data.seo?.pages ?? []).map((page) => [page.path, page]));
  const content = new Map((data.dashboard?.recentContent ?? []).map((item) => [`/${item.slug}`, item]));
  return items.map((item) => ({ ...item, seoScore: seo.get(item.path)?.score ?? item.seoScore ?? null, updatedAt: seo.get(item.path)?.updatedAt || content.get(item.path)?.updatedAt || item.updatedAt }));
}

function requestTitle(value: string) { const clean = value.trim().replace(/\s+/g, " "); return clean.length > 72 ? `${clean.slice(0, 69)}...` : clean; }
function setupReady(integration?: SetupIntegration) { return Boolean(integration?.enabled && integration.configured && integration.connectionState !== "attention"); }
function pageLabel(value = "/") {
  let path = value.trim();
  try { if (/^https?:\/\//i.test(path)) path = new URL(path).pathname; } catch { /* Preserve the original path for normalization. */ }
  path = path.split("?")[0].split("#")[0].replace(/^\/+|\/+$/g, "");
  if (!path) return "Homepage";
  if (path.toLowerCase() === "(not set)") return "Unknown page";
  try { path = decodeURIComponent(path); } catch { /* Preserve malformed input so validation can reject it. */ }
  return path.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function trafficSourceLabel(value = "") {
  const source = value.trim().toLowerCase();
  if (!source || source.includes("direct") || source === "(not set)") return "Direct";
  if (source.includes("google")) return "Google";
  if (source.includes("instagram") || /^ig\s*\//.test(source)) return "Instagram";
  if (source.includes("facebook")) return "Facebook";
  if (source.includes("stackadapt")) return "Display ads";
  return value.split("/")[0].trim().replace(/^www\./i, "").replace(/\b\w/g, (letter) => letter.toUpperCase()) || "Other";
}
function visitLabel(value: number) { return `${value} ${value === 1 ? "visit" : "visits"}`; }
function formatDate(value: string) { const date = new Date(value); return Number.isNaN(date.valueOf()) ? "-" : date.toLocaleDateString([], { month: "short", day: "numeric", year: date.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined }); }
function capitalize(value: string) { return value.replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function eventLabel(value: string) { return ({ quote_submitted: "Quote submitted", quote_completed: "Quote completed", lead_created: "New lead", booking_completed: "Booking completed", conversion: "New conversion" } as Record<string, string>)[value] ?? "Website inquiry"; }
function timeGreeting() { const hour = new Date().getHours(); return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"; }
function healthNeedsRefresh(value?: DashboardApiData["siteHealth"]) { const age = Date.now() - Date.parse(value?.lastSuccessAt || ""); return !value?.data || !Number.isFinite(age) || age > 6 * 60 * 60 * 1000; }
