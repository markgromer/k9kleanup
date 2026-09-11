"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

import { adminApiUrl } from "@/lib/admin-api-client";
import { clearSavedAdminPassword, createAdminSession, readSavedAdminPassword, saveAdminPassword } from "@/lib/admin-auth-client";
import styles from "./ReggieConnectionPage.module.css";

type ConnectStatus = { connected?: boolean; status?: "connected" | "needs_attention"; message?: string; latestMission?: { status?: string; summary?: string } | null };

export default function ReggieConnectionPage() {
  const [password, setPassword] = useState(() => readSavedAdminPassword());
  const [authed, setAuthed] = useState(() => Boolean(readSavedAdminPassword()));
  const [status, setStatus] = useState<ConnectStatus | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const load = useCallback(async (adminPassword: string) => {
    const response = await fetch(adminApiUrl("/api/admin/reggie-connect"), { headers: { Authorization: `Bearer ${adminPassword}` }, cache: "no-store" });
    const data = await response.json().catch(() => ({})) as ConnectStatus & { error?: string };
    if (!response.ok) throw new Error(data.error ?? "Could not load Reggie connection status.");
    setStatus(data as ConnectStatus);
  }, []);

  useEffect(() => {
    const saved = readSavedAdminPassword();
    if (!saved) return;
    setPassword(saved);
    void load(saved).then(() => setAuthed(true)).catch(() => clearSavedAdminPassword());
  }, [load]);

  async function login(event: FormEvent) {
    event.preventDefault(); setLoading(true); setError(""); setMessage("");
    try { await load(password); saveAdminPassword(password); setAuthed(true); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not sign in."); }
    finally { setLoading(false); }
  }

  async function updatePassword(event: FormEvent) {
    event.preventDefault(); setLoading(true); setError(""); setMessage("");
    try {
      const response = await fetch(adminApiUrl("/api/admin/settings"), {
        method: "PATCH",
        headers: { Authorization: `Bearer ${password}`, "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({})) as { ok?: boolean; error?: string; message?: string };
      if (!response.ok || !data.ok) throw new Error(data.error ?? "Could not update the admin password.");
      await createAdminSession(newPassword);
      setPassword(readSavedAdminPassword());
      setCurrentPassword("");
      setNewPassword("");
      setMessage(data.message ?? "Admin password updated.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update the admin password.");
    } finally {
      setLoading(false);
    }
  }

  if (!authed) return <main className={styles.page}><section className={styles.card}><p className={styles.eyebrow}>REGGIE CONNECTION</p><h1 className={styles.title}>Sign in to view Reggie</h1><form className={styles.form} onSubmit={login}><input className={styles.input} type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Admin password" autoComplete="current-password" /><button className={styles.button} disabled={loading}>{loading ? "Signing in..." : "Continue"}</button></form>{error ? <p className={styles.error}>{error}</p> : null}</section></main>;

  const needsAttention = status?.status === "needs_attention" || !status?.connected;
  return <main className={styles.page}><section className={styles.card}><p className={styles.eyebrow}>REGGIE CONNECTION</p><h1 className={styles.title}>{needsAttention ? "Reggie needs web-team attention" : "Reggie is connected"}</h1><p className={styles.copy}>{status?.message ?? "Checking the Reggie connection..."}</p><div className={needsAttention ? styles.warning : styles.status}>{needsAttention ? "Needs attention" : "Connected and ready"}</div>{status?.latestMission ? <div className={styles.latest}><strong>Latest request:</strong> {status.latestMission.summary || status.latestMission.status}</div> : null}<button className={styles.button} type="button" disabled={loading} onClick={() => { setLoading(true); setError(""); setMessage(""); void load(password).catch((reason) => setError(reason instanceof Error ? reason.message : "Could not refresh Reggie status.")).finally(() => setLoading(false)); }}>{loading ? "Refreshing..." : "Refresh status"}</button><form className={styles.form} onSubmit={updatePassword}><h2 className={styles.sectionTitle}>Change Admin Password</h2><input className={styles.input} type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} placeholder="Current admin password" autoComplete="current-password" /><input className={styles.input} type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="New admin password" autoComplete="new-password" /><button className={styles.button} type="submit" disabled={loading || currentPassword.trim().length < 1 || newPassword.trim().length < 10}>{loading ? "Saving..." : "Update password"}</button></form><p className={styles.note}>Admin access starts with your site&apos;s private deployment secret. Reggie has no built-in password.</p><p className={styles.note}>Your web team securely manages Reggie automation. You never need to enter OpenAI, GitHub, Cloudflare, or deployment credentials here.</p>{message ? <p className={styles.success}>{message}</p> : null}{error ? <p className={styles.error}>{error}</p> : null}</section></main>;
}
