"use client";

import {
  ArrowRight,
  BarChart3,
  Bell,
  Bot,
  ChevronDown,
  ClipboardList,
  CircleHelp,
  ExternalLink,
  Globe2,
  MessageSquareQuote,
  LayoutDashboard,
  Menu,
  Plug,
  Receipt,
  Settings,
  ShieldCheck,
  Target,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useState, type FormEvent, type ReactNode } from "react";

import { adminApiUrl } from "@/lib/admin-api-client";
import { clearSavedAdminPassword, createAdminSession, readSavedAdminPassword, requestDashboardAccessEmail, restoreAdminSession, setDashboardPasswordFromEmail } from "@/lib/admin-auth-client";
import { dashboardSiteProfile } from "@/lib/dashboard-site-profile";
import styles from "./AdminShell.module.css";

type NavItem = { href: string; label: string };
type NavGroup = { id: string; label: string; icon: LucideIcon; items: NavItem[] };
type UpdateNotice = {
  installedVersion: string;
  latest: {
    version?: string;
    releasedAt?: string;
    title?: string;
    changes?: string[];
  };
};

const groups: NavGroup[] = [
  {
    id: "website",
    label: "Website",
    icon: Globe2,
    items: [
      { href: "/admin/website/pages", label: "Pages" },
      { href: "/admin/website/services", label: "Services" },
      { href: "/admin/website/locations", label: "Locations" },
      { href: "/admin/media", label: "Media" },
      { href: "/admin/website/branding", label: "Branding" },
    ],
  },
  {
    id: "reggie",
    label: "Reggie",
    icon: Bot,
    items: [
      { href: "/admin/reggie", label: "Ask Reggie / Help" },
      { href: "/admin/reggie/feedback", label: "Feedback" },
      { href: "/admin/reggie-lens", label: "Reggie Lens" },
      { href: "/admin/reggie/requests", label: "Requests" },
      { href: "/admin/reggie/review", label: "Drafts / Ready to Publish" },
      { href: "/admin/reggie/published", label: "Published Changes" },
    ],
  },
  {
    id: "growth",
    label: "Growth",
    icon: Target,
    items: [
      { href: "/admin/growth/opportunities", label: "Opportunities" },
      { href: "/admin/seo", label: "SEO" },
      { href: "/admin/blog-posts", label: "Content" },
      { href: "/admin/landing-pages", label: "Landing Pages / Campaigns" },
    ],
  },
  {
    id: "leads",
    label: "Leads",
    icon: Users,
    items: [
      { href: "/admin/leads", label: "Leads Overview" },
      { href: "/admin/leads/activity", label: "Form / Quote Activity" },
      { href: "/admin/leads/sources", label: "Sources" },
    ],
  },
];

const nurtureLink: (NavItem & { icon: LucideIcon }) | null = { href: "/admin/nurture", label: "Nurture", icon: MessageSquareQuote };

const singleLinks = [
  { href: "/admin/reggie?prompt=How%20can%20I%20use%20this%20dashboard%20or%20get%20help%20with%20a%20problem%3F", label: "Help", icon: CircleHelp },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/admin/reviews", label: "Review Slider", icon: MessageSquareQuote },
  { href: "/admin/quote-tool", label: "Quote Tool", icon: ClipboardList },
  { href: "/admin/billing", label: "Billing", icon: Receipt },
  ...(nurtureLink ? [nurtureLink] : []),
  { href: "/admin/setup", label: "Setup", icon: Plug },
  { href: "/admin/integrations", label: "Integrations", icon: Plug },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

function isCurrent(pathname: string | null, href: string) {
  if (!pathname) return false;
  return href === "/admin" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [updateNotice, setUpdateNotice] = useState<UpdateNotice | null>(null);
  const [sessionState, setSessionState] = useState<"checking" | "authenticated" | "signed-out">("checking");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [emailMode, setEmailMode] = useState(false);
  const [accessEmail, setAccessEmail] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [accessMessage, setAccessMessage] = useState("");

  useLayoutEffect(() => {
    document.body.classList.add("reggie-dashboard-active");
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const siteChrome = Array.from(document.querySelectorAll<HTMLElement>("body > header, body > footer"));
    const previousDisplays = siteChrome.map((element) => element.style.getPropertyValue("display"));
    siteChrome.forEach((element) => element.style.setProperty("display", "none", "important"));
    return () => {
      document.body.classList.remove("reggie-dashboard-active");
      document.body.style.overflow = previousOverflow;
      siteChrome.forEach((element, index) => {
        const previous = previousDisplays[index];
        if (previous) element.style.setProperty("display", previous);
        else element.style.removeProperty("display");
      });
    };
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [mobileOpen]);

  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("reggie-access");
    if (token) setAccessToken(token);
    let active = true;
    void restoreAdminSession()
      .then((authenticated) => { if (active) setSessionState(authenticated ? "authenticated" : "signed-out"); })
      .catch(() => { if (active) setSessionState("signed-out"); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (sessionState !== "authenticated") return;
    const adminPassword = readSavedAdminPassword();
    if (!adminPassword) return;
    let cancelled = false;
    void fetch(adminApiUrl("/api/admin/reggie-update"), { headers: { Authorization: `Bearer ${adminPassword}` }, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return null;
        return await response.json() as { updateAvailable?: boolean; installedVersion?: string; latest?: UpdateNotice["latest"] };
      })
      .then((data) => {
        if (cancelled || !data?.updateAvailable || !data.latest?.version) return;
        const dismissedKey = `reggie:update-dismissed:${data.latest.version}`;
        if (sessionStorage.getItem(dismissedKey) === "true") return;
        setUpdateNotice({ installedVersion: String(data.installedVersion ?? ""), latest: data.latest });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [sessionState]);

  async function login(event: FormEvent) {
    event.preventDefault();
    setLoginLoading(true);
    setLoginError("");
    try {
      await createAdminSession(loginPassword);
      setLoginPassword("");
      setSessionState("authenticated");
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "The dashboard could not sign you in.");
    } finally {
      setLoginLoading(false);
    }
  }

  async function sendAccessEmail(event: FormEvent) {
    event.preventDefault();
    setLoginLoading(true);
    setLoginError("");
    setAccessMessage("");
    try {
      setAccessMessage(await requestDashboardAccessEmail(accessEmail));
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "The access email could not be sent.");
    } finally {
      setLoginLoading(false);
    }
  }

  async function finishPasswordSetup(event: FormEvent) {
    event.preventDefault();
    setLoginError("");
    if (newPassword !== confirmPassword) { setLoginError("Those passwords do not match."); return; }
    setLoginLoading(true);
    try {
      await setDashboardPasswordFromEmail(accessToken, newPassword);
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
      setAccessToken("");
      setNewPassword("");
      setConfirmPassword("");
      setSessionState("authenticated");
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "The secure link could not be used.");
    } finally {
      setLoginLoading(false);
    }
  }

  function signOut() {
    clearSavedAdminPassword();
    setSessionState("signed-out");
    setMobileOpen(false);
  }

  const dismissUpdate = () => {
    if (updateNotice?.latest.version) sessionStorage.setItem(`reggie:update-dismissed:${updateNotice.latest.version}`, "true");
    setUpdateNotice(null);
  };

  if (accessToken || sessionState !== "authenticated") {
    return (
      <div className={styles.clearance} data-reggie-admin-shell>
        <main className={styles.loginViewport}>
          <section className={styles.loginCard} aria-busy={sessionState === "checking" || loginLoading}>
            <div className={styles.loginBrand}><span className={styles.brandIcon}>R</span><span><strong>PoopSites</strong><small>{dashboardSiteProfile.name}</small></span></div>
            {sessionState === "checking" && !accessToken ? (
              <div className={styles.sessionCheck}><span className={styles.sessionSpinner} aria-hidden="true" /><h1>Opening your workspace</h1><p>Restoring your secure dashboard session.</p></div>
            ) : (
              <>
                <div className={styles.loginIntro}><ShieldCheck size={22} aria-hidden="true" /><p>SECURE DASHBOARD</p><h1>{accessToken ? "Choose your password" : emailMode ? "Get dashboard access" : "Welcome back"}</h1><span>{accessToken ? "Set the password you'll use for normal sign-ins." : emailMode ? "We'll email the address already authorized for this brand." : "Sign in once to manage your website, leads, and growth."}</span></div>
                {accessToken ? (
                  <form className={styles.loginForm} onSubmit={finishPasswordSetup}>
                    <label htmlFor="new-admin-password">New dashboard password</label>
                    <input id="new-admin-password" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" minLength={10} />
                    <label htmlFor="confirm-admin-password">Confirm password</label>
                    <input id="confirm-admin-password" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={10} />
                    <button type="submit" disabled={loginLoading || newPassword.length < 10 || !confirmPassword}>{loginLoading ? "Saving..." : "Set password and sign in"}<ArrowRight size={16} /></button>
                  </form>
                ) : emailMode ? (
                  <form className={styles.loginForm} onSubmit={sendAccessEmail}>
                    <label htmlFor="owner-email">Brand owner email</label>
                    <input id="owner-email" type="email" value={accessEmail} onChange={(event) => setAccessEmail(event.target.value)} autoComplete="email" />
                    <button type="submit" disabled={loginLoading || !accessEmail.trim()}>{loginLoading ? "Sending..." : "Email secure link"}<ArrowRight size={16} /></button>
                    <button className={styles.loginTextButton} type="button" onClick={() => { setEmailMode(false); setLoginError(""); setAccessMessage(""); }}>Back to password</button>
                  </form>
                ) : (
                  <form className={styles.loginForm} onSubmit={login}>
                    <label htmlFor="admin-password">Dashboard password</label>
                    <input id="admin-password" type="password" value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} autoComplete="current-password" />
                    <button type="submit" disabled={loginLoading || !loginPassword.trim()}>{loginLoading ? "Signing in..." : "Continue"}<ArrowRight size={16} /></button>
                    <button className={styles.loginTextButton} type="button" onClick={() => { setEmailMode(true); setLoginError(""); }}>First login or forgot password?</button>
                  </form>
                )}
                {loginError ? <p className={styles.loginError} role="alert">{loginError}</p> : null}
                {accessMessage ? <p className={styles.loginSuccess} role="status">{accessMessage}</p> : null}
                <p className={styles.loginNote}>{emailMode ? "You only need email for first-time setup or password recovery." : "Your password is exchanged for a secure, private browser session and is never stored in this browser."}</p>
              </>
            )}
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className={styles.clearance} data-reggie-admin-shell>
      <a className={styles.skipLink} href="#dashboard-content">Skip to dashboard content</a>
      <div className={styles.shell}>
        <aside id="poopsites-dashboard-navigation" className={`${styles.sidebar} ${mobileOpen ? styles.sidebarOpen : ""}`}>
          <div className={styles.brandBlock}>
            <Link href="/admin" className={styles.brandMark} aria-label={`${dashboardSiteProfile.name} dashboard`} onClick={() => setMobileOpen(false)}>
              <span className={styles.brandIcon}>R</span>
              <span><strong>PoopSites</strong><small>{dashboardSiteProfile.name}</small></span>
            </Link>
            <button className={styles.closeDrawer} type="button" onClick={() => setMobileOpen(false)} aria-label="Close navigation"><X size={20} /></button>
          </div>
          <nav className={styles.nav} aria-label="Dashboard">
            <Link href="/admin" className={`${styles.primaryLink} ${pathname === "/admin" ? styles.active : ""}`} aria-current={pathname === "/admin" ? "page" : undefined} onClick={() => setMobileOpen(false)}>
              <LayoutDashboard size={18} aria-hidden="true" /><span>Dashboard</span>
            </Link>
            {groups.map((group) => {
              const groupActive = group.items.some((item) => isCurrent(pathname, item.href));
              const Icon = group.icon;
              return (
                <details className={styles.group} key={group.id} open={groupActive}>
                  <summary><span><Icon size={18} aria-hidden="true" />{group.label}</span><ChevronDown className={styles.chevron} size={16} aria-hidden="true" /></summary>
                  <div className={styles.groupLinks}>
                    {group.items.map((item) => {
                      const active = isCurrent(pathname, item.href);
                      return <Link key={item.href} href={item.href} className={`${styles.navLink} ${active ? styles.active : ""}`} aria-current={active ? "page" : undefined} onClick={() => setMobileOpen(false)}>{item.label}</Link>;
                    })}
                  </div>
                </details>
              );
            })}
            {singleLinks.map((item) => {
              const active = isCurrent(pathname, item.href);
              const Icon = item.icon;
              return <Link key={item.href} href={item.href} className={`${styles.primaryLink} ${active ? styles.active : ""}`} aria-current={active ? "page" : undefined} onClick={() => setMobileOpen(false)}><Icon size={18} aria-hidden="true" /><span>{item.label}</span></Link>;
            })}
          </nav>
          <div className={styles.sidebarFooter}>
            <div className={styles.helpBlock}><strong>Questions or website help?</strong><span>Ask Reggie for instructions, troubleshooting, or a website change.</span><Link href="/admin/reggie" onClick={() => setMobileOpen(false)}>Open Help</Link></div>
            <button className={styles.signOut} type="button" onClick={signOut}>Sign out</button>
          </div>
        </aside>
        {mobileOpen ? <button className={styles.backdrop} type="button" onClick={() => setMobileOpen(false)} aria-label="Close navigation" /> : null}
        <header className={styles.topBar}>
          <button className={styles.menuButton} type="button" aria-expanded={mobileOpen} aria-controls="poopsites-dashboard-navigation" onClick={() => setMobileOpen((current) => !current)}><Menu size={20} /><span>Menu</span></button>
          <div className={styles.topTitle}><span>Dashboard</span><strong>{dashboardSiteProfile.name}</strong></div>
          <div className={styles.topActions}>
            <a className={styles.viewSite} href="/" target="_blank" rel="noreferrer"><span>View site</span><ExternalLink size={15} /></a>
            <button className={styles.iconButton} type="button" aria-label="Notifications" title="Notifications"><Bell size={18} /></button>
            <span className={styles.avatar} aria-hidden="true">{dashboardSiteProfile.name.slice(0, 1).toUpperCase()}</span>
          </div>
        </header>
        <div id="dashboard-content" className={styles.content}>{children}</div>
      </div>
      {updateNotice ? (
        <div className={styles.updateOverlay} role="presentation">
          <section className={styles.updateModal} role="dialog" aria-modal="true" aria-labelledby="reggie-update-title">
            <p className={styles.updateEyebrow}>REGGIE UPDATE</p>
            <h2 id="reggie-update-title">{updateNotice.latest.title || `Reggie ${updateNotice.latest.version}`}</h2>
            <p className={styles.updateCopy}>Installed: {updateNotice.installedVersion || "unknown"} - Latest: {updateNotice.latest.version}</p>
            {updateNotice.latest.releasedAt ? <p className={styles.updateCopy}>Released {updateNotice.latest.releasedAt}</p> : null}
            {Array.isArray(updateNotice.latest.changes) && updateNotice.latest.changes.length ? (
              <ul className={styles.updateList}>
                {updateNotice.latest.changes.slice(0, 6).map((change) => <li key={change}>{change}</li>)}
              </ul>
            ) : null}
            <div className={styles.updateActions}>
              <Link className={styles.updatePrimary} href="/admin/reggie" onClick={dismissUpdate}>Ask Reggie</Link>
              <button className={styles.updateSecondary} type="button" onClick={dismissUpdate}>Dismiss</button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
