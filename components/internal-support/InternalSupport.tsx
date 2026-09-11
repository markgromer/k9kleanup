"use client";

import { Activity, ArrowRight, Cloud, Code2, Database, GitBranch, ListChecks, ScanSearch } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

import { adminApiUrl } from "@/lib/admin-api-client";
import { createAdminSession, readSavedAdminPassword, saveAdminPassword } from "@/lib/admin-auth-client";
import styles from "./InternalSupport.module.css";

const tools = [

  { title: "Reggie mission queue", description: "Mission records, review artifacts, publish state, and support diagnostics.", href: "/admin/reggie-queue", icon: ListChecks },
  { title: "Lens workspace", description: "Advanced visual annotation and revision packet tooling.", href: "/admin/reggie-lens", icon: ScanSearch },
  { title: "Connection and deployment", description: "Hub connection, repository, deployment, and updater status.", href: "/admin/reggie-deploy", icon: Cloud },
  { title: "SEO inventory", description: "Raw page metadata records and scoring fields.", href: "/admin/seo", icon: Database },
  { title: "Ranking records", description: "Raw tracked keyword positions and updates.", href: "/admin/rankings", icon: Activity },
  { title: "Integration credentials", description: "Encrypted configuration records and environment-backed connections.", href: "/admin/integrations", icon: Code2 },
] as const;

export function InternalSupport() {
  const [password, setPassword] = useState("");
  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function authenticate(token: string) {
    const response = await fetch(adminApiUrl("/api/admin/support-auth"), { headers: token ? { Authorization: `Bearer ${token}` } : {}, cache: "no-store" });
    if (!response.ok) throw new Error("PoopSites support access is required.");
    saveAdminPassword(token); setAuthed(true);
  }

  useEffect(() => {
    if (authed) window.scrollTo({ top: 0, behavior: "auto" });
  }, [authed]);

  useEffect(() => { if (!readSavedAdminPassword()) return; void authenticate("").catch(() => undefined); }, []);
  async function login(event: FormEvent) { event.preventDefault(); setLoading(true); setError(""); try { await createAdminSession(password); await authenticate(""); setPassword(""); } catch (reason) { setError(reason instanceof Error ? reason.message : "Support access was not accepted."); } finally { setLoading(false); } }

  if (!authed) return <main className={styles.page}><form className={styles.login} onSubmit={login}><GitBranch size={25} /><span>Internal</span><h1>PoopSites support</h1><p>This workspace is restricted to PoopSites support credentials.</p><label>Support password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /></label><button disabled={loading}>{loading ? "Checking..." : "Continue"}</button>{error ? <div className={styles.error}>{error}</div> : null}</form></main>;
  return <main className={styles.page}><header><span>Internal support</span><h1>Site operations</h1><p>Technical tools retained for PoopSites staff. These are intentionally absent from the customer navigation.</p></header><div className={styles.grid}>{tools.map((item) => { const Icon = item.icon; return <Link href={item.href} key={item.href}><Icon size={20} /><div><strong>{item.title}</strong><span>{item.description}</span></div><ArrowRight size={16} /></Link>; })}</div></main>;
}
