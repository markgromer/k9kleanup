"use client";

import { Bot, Camera, CheckCircle2, CircleAlert, Clock3, Send, UserRound } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { adminApiUrl } from "@/lib/admin-api-client";
import styles from "./ReggieFeedback.module.css";

type FeedbackItem = {
  id: string; summary: string; description: string; status: string; nextAction: string; assessment: string;
  needsHuman: boolean; humanQuestion: string; prepareFixApproved: boolean; missionId: string | null; createdAt: string; updatedAt: string;
};

export function ReggieFeedback() {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [description, setDescription] = useState("");
  const [expectedBehavior, setExpectedBehavior] = useState("");
  const [reproductionSteps, setReproductionSteps] = useState("");
  const [pageUrl, setPageUrl] = useState("");
  const [prepareFixApproved, setPrepareFixApproved] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const requestKeyRef = useRef("");

  const load = useCallback(async () => {
    const response = await fetch(adminApiUrl("/api/admin/reggie-feedback"), { credentials: "include", cache: "no-store" });
    const data = await response.json().catch(() => ({})) as { feedback?: FeedbackItem[]; error?: string };
    if (!response.ok) throw new Error(data.error || "Reggie could not load feedback.");
    setItems(data.feedback || []);
  }, []);

  useEffect(() => {
    let active = true;
    void load().catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Reggie could not load feedback."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [load]);

  function chooseFiles(next: FileList | null) {
    setError("");
    const selected = Array.from(next || []).slice(0, 3);
    const invalid = selected.find((file) => !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 8 * 1024 * 1024);
    if (invalid) { setFiles([]); setError("Use up to three JPEG, PNG, or WebP screenshots, no larger than 8 MB each."); return; }
    setFiles(selected);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (description.trim().length < 12) { setError("Tell Reggie a little more about what happened."); return; }
    setSubmitting(true); setError(""); setMessage("");
    try {
      const requestKey = requestKeyRef.current || `feedback:${crypto.randomUUID()}`;
      requestKeyRef.current = requestKey;
      const response = await fetch(adminApiUrl("/api/admin/reggie-feedback"), {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json", "Idempotency-Key": requestKey },
        body: JSON.stringify({
          description, expectedBehavior, reproductionSteps, pageUrl, prepareFixApproved,
          context: { dashboardPath: window.location.pathname, browser: navigator.userAgent.slice(0, 200), viewportWidth: window.innerWidth, viewportHeight: window.innerHeight },
        }),
      });
      const data = await response.json().catch(() => ({})) as { feedback?: FeedbackItem; error?: string };
      if (!response.ok || !data.feedback) throw new Error(data.error || "Reggie could not save this report.");
      let uploadFailures = 0;
      for (const file of files) {
        try {
          const upload = await fetch(adminApiUrl(`/api/admin/reggie-feedback?feedbackId=${encodeURIComponent(data.feedback.id)}`), {
            method: "PUT", credentials: "include", cache: "no-store", headers: { "Content-Type": file.type, "X-File-Name": file.name }, body: file,
          });
          if (!upload.ok) uploadFailures += 1;
        } catch { uploadFailures += 1; }
      }
      requestKeyRef.current = "";
      setDescription(""); setExpectedBehavior(""); setReproductionSteps(""); setPageUrl(""); setPrepareFixApproved(false); setFiles([]);
      setMessage(uploadFailures ? `Reggie saved the report, but ${uploadFailures} screenshot${uploadFailures === 1 ? "" : "s"} did not upload.` : "Got it. Reggie saved this and is ready to triage it.");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Reggie could not save this report.");
    } finally { setSubmitting(false); }
  }

  return <main className={styles.page}>
    <header className={styles.hero}><div className={styles.avatar}><Bot size={24} /></div><div><span>Feedback with follow-through</span><h1>Tell Reggie what happened</h1><p>Report something broken, confusing, or not working the way you expected. Reggie will sort out what can be fixed and what needs a decision.</p></div></header>
    <div className={styles.layout}>
      <form className={styles.form} onSubmit={submit}>
        <div className={styles.formHeading}><div><strong>New feedback</strong><span>Give Reggie the clearest version of the problem.</span></div><Send size={18} /></div>
        <label htmlFor="reggie-feedback-description">What happened?<textarea id="reggie-feedback-description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Example: The quote button stops responding after I change the service frequency." required minLength={12} /></label>
        <label htmlFor="reggie-feedback-expected">What did you expect?<textarea id="reggie-feedback-expected" value={expectedBehavior} onChange={(event) => setExpectedBehavior(event.target.value)} placeholder="Optional, but helpful for deciding whether this is a bug or intended behavior." /></label>
        <label htmlFor="reggie-feedback-reproduction">How can we see it again?<textarea id="reggie-feedback-reproduction" value={reproductionSteps} onChange={(event) => setReproductionSteps(event.target.value)} placeholder="Optional steps to reproduce the issue." /></label>
        <label htmlFor="reggie-feedback-page">Affected page<input id="reggie-feedback-page" type="url" value={pageUrl} onChange={(event) => setPageUrl(event.target.value)} placeholder="https://yoursite.com/page" /></label>
        <label className={styles.upload} htmlFor="reggie-feedback-screenshots" aria-label="Add screenshots"><Camera size={18} /><span><strong>Add screenshots</strong><small>Up to 3 JPEG, PNG, or WebP files. Please redact personal information.</small></span><input id="reggie-feedback-screenshots" type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={(event) => chooseFiles(event.target.files)} /></label>
        {files.length ? <div className={styles.fileList}>{files.map((file) => <span key={`${file.name}-${file.size}`}>{file.name}</span>)}</div> : null}
        <label className={styles.consent} htmlFor="reggie-feedback-consent" aria-label="Let Reggie prepare a fix"><input id="reggie-feedback-consent" type="checkbox" checked={prepareFixApproved} onChange={(event) => setPrepareFixApproved(event.target.checked)} /><span><strong>Let Reggie prepare a fix</strong><small>If Reggie verifies a safe website defect, he may create a draft for review. Nothing will be published automatically.</small></span></label>
        {error ? <div className={styles.error} role="alert"><CircleAlert size={16} />{error}</div> : null}
        {message ? <div className={styles.success} role="status"><CheckCircle2 size={16} />{message}</div> : null}
        <button className={styles.submit} type="submit" disabled={submitting}>{submitting ? "Saving with Reggie..." : "Send to Reggie"}<Send size={15} /></button>
      </form>
      <section className={styles.inbox}><div className={styles.inboxHeading}><div><strong>Feedback inbox</strong><span>{items.length ? `${items.length} recent report${items.length === 1 ? "" : "s"}` : "Reports and decisions will appear here."}</span></div></div>
        {loading ? <div className={styles.empty}>Reggie is loading the inbox...</div> : items.length ? <div className={styles.cards}>{items.map((item) => <article key={item.id}>
          <div className={styles.cardTop}><StatusIcon item={item} /><span className={item.needsHuman ? styles.humanBadge : styles.reggieBadge}>{item.needsHuman ? "Needs human" : statusLabel(item)}</span><time>{formatDate(item.updatedAt)}</time></div>
          <h2>{item.summary}</h2><p>{item.humanQuestion || item.assessment || defaultUpdate(item)}</p>
          <footer><span>{item.prepareFixApproved ? "Draft fix authorized" : "Triage only"}</span>{item.missionId ? <a href="/admin/reggie/requests">View Reggie request</a> : null}</footer>
        </article>)}</div> : <div className={styles.empty}><Bot size={23} /><strong>No feedback yet</strong><span>Your first report will get a durable receipt here.</span></div>}
      </section>
    </div>
  </main>;
}

function StatusIcon({ item }: { item: FeedbackItem }) { return item.needsHuman ? <UserRound size={16} /> : item.status === "resolved" ? <CheckCircle2 size={16} /> : <Clock3 size={16} />; }
function statusLabel(item: FeedbackItem) { return item.status === "received" ? "Reggie checking" : item.status.replace(/_/g, " "); }
function defaultUpdate(item: FeedbackItem) { return item.status === "received" ? "Reggie has the report. Automated triage will appear here as the next implementation slice comes online." : "Reggie recorded the latest feedback state."; }
function formatDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "Recently" : new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date); }
