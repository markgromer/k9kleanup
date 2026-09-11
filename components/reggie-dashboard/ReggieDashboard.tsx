"use client";

import { Archive, ArrowRight, Bot, CheckCircle2, CircleAlert, Clock3, ExternalLink, Paperclip, Plus, RefreshCw, Send, Sparkles, Trash2, Video } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import { adminApiUrl } from "@/lib/admin-api-client";
import { readSavedAdminPassword, saveAdminPassword } from "@/lib/admin-auth-client";
import { customerStatusLabel, missionCustomerStatus } from "@/lib/dashboard-data";
import type { CustomerStatus, DashboardMission } from "@/lib/dashboard-models";
import { missionRetryAction } from "@/lib/reggie-mission-state.mjs";
import styles from "./ReggieDashboard.module.css";

export type ReggieDashboardMode = "ask" | "requests" | "review" | "published";

const quickActions = [
  ["Update a page", "I want to update this page: "],
  ["Create a landing page", "I want a new landing page for: "],
  ["Something isn't working", "Something on my website isn't working: "],
] as const;

type ChatSource = { id: string; label: string; kind: string; observedAt: string | null; freshness: "live" | "fresh" | "stale" | "unknown"; details?: string };
type ProposedAction = {
  id: string;
  kind: string;
  summary: string;
  acceptanceCriteria: string[];
  proposalState: "none" | "read_only" | "needs_confirmation" | "executable" | "unsupported";
  executable: boolean;
  resolution?: { strategy: "STRUCTURED_MUTATION" | "CODE_MISSION" | "HYBRID" | "NO_CHANGE" | "NEEDS_CONFIRMATION" | "UNSUPPORTED"; reason: string };
};
type DevelopmentRequest = { id: string; reference: string; title: string; status: "sent_for_review"; scopeExplanation: string; calendlyUrl: string; websitePortionSuggestion: string };
type ChatMessage = { id: string; role: "user" | "assistant"; content: string; createdAt: string; status?: string; requestKey?: string | null; sources?: ChatSource[]; proposedAction?: ProposedAction | null; developmentRequest?: DevelopmentRequest | null };
type ChatConversation = { id: string; title: string; createdAt: string; updatedAt: string; busy?: boolean };

export function ReggieDashboard({ mode }: { mode: ReggieDashboardMode }) {
  const [password, setPassword] = useState(() => readSavedAdminPassword());
  const [authed, setAuthed] = useState(() => Boolean(readSavedAdminPassword()));
  const [jobs, setJobs] = useState<DashboardMission[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [conversationId, setConversationId] = useState("");
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [followUp, setFollowUp] = useState("");
  const [loading, setLoading] = useState(false);
  const [queueLoading, setQueueLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const pendingFollowUpKeyRef = useRef("");
  const pendingChatKeyRef = useRef("");
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async (token = password) => {
    setQueueLoading(true);
    try {
      const response = await fetch(adminApiUrl("/api/admin/reggie-mission?refresh=1"), { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const payload = await response.json().catch(() => ({})) as { ok?: boolean; jobs?: DashboardMission[]; error?: string };
      if (!response.ok || payload.ok === false) throw new Error(payload.error ?? "Reggie requests could not be loaded.");
      setJobs(payload.jobs ?? []);
    } finally { setQueueLoading(false); }
  }, [password]);

  const loadChat = useCallback(async (token = password, requestedConversationId = "") => {
    const response = await fetch(adminApiUrl(`/api/admin/reggie-chat${requestedConversationId ? `?conversationId=${encodeURIComponent(requestedConversationId)}` : ""}`), { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    const payload = await response.json().catch(() => ({})) as { ok?: boolean; conversations?: ChatConversation[]; conversation?: ChatConversation | null; messages?: ChatMessage[]; error?: string };
    if (!response.ok || payload.ok === false) throw new Error(payload.error ?? "Your Reggie conversation could not be loaded.");
    setConversations(payload.conversations ?? []);
    setConversationId(payload.conversation?.id ?? "");
    setChatMessages(payload.messages ?? []);
  }, [password]);

  const authenticate = useCallback(async (token: string) => {
    const response = await fetch(adminApiUrl("/api/admin/dashboard"), { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (!response.ok) throw new Error("That dashboard password was not accepted.");
    saveAdminPassword(token); setAuthed(true); await Promise.all([load(token), loadChat(token)]);
  }, [load, loadChat]);

  useEffect(() => {
    if (authed) window.scrollTo({ top: 0, behavior: "auto" });
  }, [authed]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedPrompt = params.get("prompt");
    if (requestedPrompt) setPrompt(requestedPrompt);
  }, []);

  useEffect(() => {
    const saved = readSavedAdminPassword();
    if (!saved) return;
    setPassword(saved);
    void load(saved).catch((reason) => setError(reason instanceof Error ? reason.message : "Reggie requests could not be loaded."));
    void loadChat(saved).catch((reason) => setError(reason instanceof Error ? reason.message : "Your Reggie conversation could not be loaded."));
  }, [load, loadChat]);

  useEffect(() => { if (mode === "ask") chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [chatMessages, mode]);

  useEffect(() => {
    if (!authed || !jobs.some((job) => ["requested", "working", "publishing"].includes(missionCustomerStatus(job)))) return;
    const timer = window.setInterval(() => void load().catch(() => undefined), 12000);
    return () => window.clearInterval(timer);
  }, [authed, jobs, load]);

  const visibleJobs = useMemo(() => jobs.filter((job) => {
    if (["cancelled", "superseded"].includes(job.status ?? "")) return false;
    const status = missionCustomerStatus(job);
    if (mode === "review") return status === "ready";
    if (mode === "published") return status === "published" || status === "publishing";
    return true;
  }), [jobs, mode]);
  const selected = jobs.find((job) => job.id === selectedId) ?? null;
  const selectedRetry = selected ? missionRetryAction(selected) : null;

  async function login(event: FormEvent) { event.preventDefault(); setLoading(true); setError(""); try { await authenticate(password); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not sign in."); } finally { setLoading(false); } }

  async function submitChat(event: FormEvent) {
    event.preventDefault();
    const content = prompt.trim();
    if (content.length < 2) { setError("Ask Reggie a question or share a little more detail."); return; }
    setShowHistory(true);
    setLoading(true); setError(""); setMessage("");
    const optimistic: ChatMessage = { id: `local-${Date.now()}`, role: "user", content, createdAt: new Date().toISOString() };
    setChatMessages((current) => [...current, optimistic]);
    setPrompt("");
    try {
      const requestKey = pendingChatKeyRef.current || `chat-${crypto.randomUUID()}`;
      pendingChatKeyRef.current = requestKey;
      const response = await fetch(adminApiUrl("/api/admin/reggie-chat"), { method: "POST", headers: { Authorization: `Bearer ${password}`, "Content-Type": "application/json", "Idempotency-Key": requestKey }, body: JSON.stringify({ conversationId: conversationId || undefined, message: content, requestKey }) });
      const payload = await response.json().catch(() => ({})) as { ok?: boolean; conversationId?: string; message?: ChatMessage; error?: string };
      if (!response.ok || payload.ok === false || !payload.message) throw new Error(payload.error ?? "Reggie could not answer right now.");
      setConversationId(payload.conversationId ?? conversationId);
      setChatMessages((current) => [...current.filter((item) => item.id !== optimistic.id), optimistic, payload.message as ChatMessage]);
      pendingChatKeyRef.current = "";
      void loadChat(password, payload.conversationId ?? conversationId).catch(() => undefined);
    } catch (reason) { setChatMessages((current) => current.filter((item) => item.id !== optimistic.id)); setPrompt(content); setError(reason instanceof Error ? reason.message : "Reggie could not answer right now."); }
    finally { setLoading(false); }
  }

  async function newConversation() {
    setLoading(true); setError("");
    try {
      const response = await fetch(adminApiUrl("/api/admin/reggie-chat"), { method: "POST", headers: { Authorization: `Bearer ${password}`, "Content-Type": "application/json" }, body: JSON.stringify({ action: "new" }) });
      const payload = await response.json().catch(() => ({})) as { ok?: boolean; conversation?: ChatConversation; error?: string };
      if (!response.ok || !payload.conversation) throw new Error(payload.error ?? "A new conversation could not be started.");
      setConversationId(payload.conversation.id); setChatMessages([]); setPrompt(""); setShowHistory(false); pendingChatKeyRef.current = ""; await loadChat(password, payload.conversation.id);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "A new conversation could not be started."); } finally { setLoading(false); }
  }

  async function archiveConversation() {
    if (!conversationId) return;
    setLoading(true); setError("");
    try {
      const response = await fetch(adminApiUrl("/api/admin/reggie-chat"), { method: "POST", headers: { Authorization: `Bearer ${password}`, "Content-Type": "application/json" }, body: JSON.stringify({ action: "archive", conversationId }) });
      if (!response.ok) throw new Error("This conversation could not be archived.");
      setConversationId(""); setChatMessages([]); setShowHistory(false); pendingChatKeyRef.current = ""; await loadChat(password);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "This conversation could not be archived."); } finally { setLoading(false); }
  }

  async function deleteConversation() {
    if (!conversationId || !window.confirm("Permanently delete this conversation and all of its messages?")) return;
    setLoading(true); setError("");
    try {
      const response = await fetch(adminApiUrl("/api/admin/reggie-chat"), { method: "POST", headers: { Authorization: `Bearer ${password}`, "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete", conversationId }) });
      const payload = await response.json().catch(() => ({})) as { ok?: boolean; error?: string };
      if (!response.ok || payload.ok === false) throw new Error(payload.error ?? "This conversation could not be deleted.");
      setConversationId(""); setChatMessages([]); setShowHistory(false); pendingChatKeyRef.current = ""; await loadChat(password);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "This conversation could not be deleted."); } finally { setLoading(false); }
  }

  async function createMissionFromAnswer(item: ChatMessage) {
    if (!conversationId || !isActionableAnswer(item) || !window.confirm(`Approve this exact ${item.proposedAction?.kind.replaceAll("_", " ")} action? Reggie will retain its evidence and acceptance criteria, and you will still review the completed change before publishing.`)) return;
    setLoading(true); setError(""); setMessage("");
    try {
      const idempotencyKey = `chat-mission:${item.id}`;
      const response = await fetch(adminApiUrl("/api/admin/reggie-chat"), {
        method: "POST",
        headers: { Authorization: `Bearer ${password}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({ action: "create_mission", approved: true, conversationId, assistantMessageId: item.id, proposedActionId: item.proposedAction?.id, requestType: "site_revision", idempotencyKey }),
      });
      const payload = await response.json().catch(() => ({})) as { ok?: boolean; duplicate?: boolean; job?: DashboardMission; error?: string };
      if (!response.ok || payload.ok === false || !payload.job) throw new Error(payload.error ?? "This recommendation could not be turned into a mission.");
      setMessage(payload.duplicate ? "This recommendation is already in your request queue." : "Mission created. Reggie is preparing the approved change.");
      await load();
      if (payload.job.id) setSelectedId(payload.job.id);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "This recommendation could not be turned into a mission."); }
    finally { setLoading(false); }
  }

  async function publish() {
    if (!selected?.pullRequestNumber) return;
    setLoading(true); setError("");
    try {
      const response = await fetch(adminApiUrl("/api/admin/reggie-mission"), { method: "PATCH", headers: { Authorization: `Bearer ${password}`, "Content-Type": "application/json" }, body: JSON.stringify({ missionId: selected.id, pullRequestNumber: selected.pullRequestNumber, branchName: selected.branchName }) });
      const payload = await response.json().catch(() => ({})) as { ok?: boolean; error?: string };
      if (!response.ok || payload.ok === false) throw new Error(payload.error ?? "This change could not be published.");
      setMessage("Approved. Reggie is publishing the change."); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "This change could not be published."); }
    finally { setLoading(false); }
  }

  async function decline() {
    if (!selected?.id || !["ready", "attention"].includes(missionCustomerStatus(selected))) return;
    if (!window.confirm("Decline this revision? Reggie will close its pull request and remove the draft branch when possible.")) return;
    setLoading(true); setError("");
    try {
      const response = await fetch(adminApiUrl("/api/admin/reggie-mission"), { method: "PATCH", headers: { Authorization: `Bearer ${password}`, "Content-Type": "application/json" }, body: JSON.stringify({ action: "cancel", missionId: selected.id, pullRequestNumber: selected.pullRequestNumber, branchName: selected.branchName }) });
      const payload = await response.json().catch(() => ({})) as { ok?: boolean; error?: string; warnings?: string[] };
      if (!response.ok || payload.ok === false) throw new Error(payload.error ?? "This revision could not be removed.");
      setSelectedId("");
      setMessage(payload.warnings?.length ? `Revision declined. ${payload.warnings.join(" ")}` : "Revision declined and its draft was removed.");
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "This revision could not be removed."); }
    finally { setLoading(false); }
  }

  async function retryMission() {
    if (!selected?.id || missionCustomerStatus(selected) !== "attention" || !missionRetryAction(selected).kind) return;
    setLoading(true); setError(""); setMessage("");
    try {
      const response = await fetch(adminApiUrl(`/api/admin/reggie-mission?retryMissionId=${encodeURIComponent(selected.id)}`), { method: "POST", headers: { Authorization: `Bearer ${password}` } });
      const payload = await response.json().catch(() => ({})) as { ok?: boolean; error?: string; revalidating?: boolean };
      if (!response.ok || payload.ok === false) throw new Error(payload.error ?? "This request could not be retried.");
      setMessage(payload.revalidating ? "Production checks were queued for revalidation." : "Retry queued. Reggie will show its progress here.");
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "This request could not be retried."); }
    finally { setLoading(false); }
  }

  async function requestEdits(event: FormEvent) {
    event.preventDefault();
    if (!selected || followUp.trim().length < 8) return;
    setLoading(true); setError("");
    try {
      const idempotencyKey = pendingFollowUpKeyRef.current || `dashboard-followup-${selected.id}-${crypto.randomUUID()}`;
      pendingFollowUpKeyRef.current = idempotencyKey;
      const response = await fetch(adminApiUrl("/api/admin/reggie-mission"), { method: "POST", headers: { Authorization: `Bearer ${password}`, "Content-Type": "application/json" }, body: JSON.stringify({ requestType: "site_revision", title: `Update: ${selected.title || selected.summary || "website request"}`, targetPath: selected.targetPath || "/", prompt: followUp.trim(), parentMissionId: selected.id, idempotencyKey }) });
      const payload = await response.json().catch(() => ({})) as { ok?: boolean; error?: string };
      if (!response.ok || payload.ok === false) throw new Error(payload.error ?? "Edits could not be requested.");
      pendingFollowUpKeyRef.current = "";
      setFollowUp(""); setMessage("Your feedback was sent to Reggie as a new revision."); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Edits could not be requested."); }
    finally { setLoading(false); }
  }

  if (!authed) return <main className={styles.page}><form className={styles.login} onSubmit={login}><div className={styles.avatar}><Bot size={24} /></div><span>PoopSites Dashboard</span><h1>Ask Reggie</h1><p>Sign in to request and review website changes.</p><label>Dashboard password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /></label><button disabled={loading}>{loading ? "Signing in..." : "Continue"}<ArrowRight size={16} /></button>{error ? <div className={styles.error}>{error}</div> : null}</form></main>;

  return <main className={styles.page}>
    <header className={styles.header}><div><span>Reggie</span><h1>{mode === "ask" ? "What would you like to change?" : mode === "review" ? "Ready for review" : mode === "published" ? "Published changes" : "Your requests"}</h1><p>{mode === "ask" ? "Reggie handles page updates and landing pages. Bigger projects are saved and sent to Mark for development review." : "Follow every request in clear, customer-friendly stages."}</p></div><button type="button" onClick={() => void load()} disabled={queueLoading}><RefreshCw size={15} className={queueLoading ? styles.spin : ""} />{queueLoading ? "Refreshing" : "Refresh"}</button></header>
    {message ? <div className={styles.notice}><CheckCircle2 size={17} />{message}</div> : null}
    {error ? <div className={styles.error}><CircleAlert size={17} />{error}</div> : null}
    {mode === "ask" ? <section className={styles.askPanel}>
      <div className={styles.askTitle}><div className={styles.avatar}><Bot size={22} /></div><div><span>Ask Reggie</span><h2>Describe the website change</h2><p>Use plain language. Reggie will guide the request to the right next step.</p></div><details className={styles.historyTools} open={showHistory} onToggle={(event) => setShowHistory(event.currentTarget.open)}><summary>History{chatMessages.length ? ` (${chatMessages.length})` : ""}</summary><div className={styles.chatTools}><select aria-label="Conversation" value={conversationId} onChange={(event) => { setShowHistory(Boolean(event.target.value)); void loadChat(password, event.target.value); }}><option value="">New conversation</option>{conversations.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select><button type="button" onClick={() => void newConversation()} disabled={loading}><Plus size={14} />New</button><button type="button" onClick={() => void archiveConversation()} disabled={loading || !conversationId} aria-label="Archive this conversation"><Archive size={14} /></button><button type="button" onClick={() => void deleteConversation()} disabled={loading || !conversationId} aria-label="Permanently delete this conversation"><Trash2 size={14} /></button></div></details></div>
      {showHistory ? <div className={styles.chatLog} aria-live="polite">{chatMessages.length ? chatMessages.map((item) => <article className={`${styles.chatMessage} ${item.role === "user" ? styles.chatUser : styles.chatAssistant}`} key={item.id}><span>{item.role === "user" ? "You" : "Reggie"}</span><p>{item.content}</p>{item.developmentRequest ? <DevelopmentHandoffCard request={item.developmentRequest} password={password} onContinue={(value) => setPrompt(value)} /> : null}{item.sources?.length ? <details className={styles.chatSources}><summary>{item.sources.length} source{item.sources.length === 1 ? "" : "s"}</summary>{item.sources.map((source) => <div key={source.id}><strong>{source.id} · {source.label}</strong><small className={source.freshness === "stale" ? styles.sourceStale : ""}>{source.freshness}{source.observedAt ? ` · ${formatDateTime(source.observedAt)}` : ""}</small>{source.details ? <p>{source.details}</p> : null}</div>)}</details> : null}{isActionableAnswer(item) ? <div className={styles.chatMissionActions}><button type="button" onClick={() => void createMissionFromAnswer(item)} disabled={loading}><Sparkles size={13} />Make this change</button><Link href={`/admin/reggie-lens?conversationId=${encodeURIComponent(conversationId)}&messageId=${encodeURIComponent(item.id)}`}>Open in Lens<ArrowRight size={13} /></Link></div> : null}</article>) : <div className={styles.chatWelcome}><Sparkles size={18} /><strong>What would you like to change?</strong><p>Describe it in your own words. Reggie handles the website details.</p></div>}{loading ? <article className={`${styles.chatMessage} ${styles.chatAssistant}`}><span>Reggie</span><p className={styles.thinking}>Working out the right next step...</p></article> : null}<div ref={chatEndRef} /></div> : null}
      <form className={styles.chatComposer} onSubmit={submitChat}><label htmlFor="request">Your request</label><textarea id="request" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="For example: Change the headline on my home page and add a photo." /><button type="submit" disabled={loading || prompt.trim().length < 2}>{loading ? "Working..." : "Send"}<Send size={16} /></button></form>
      <div className={styles.quickActions}>{quickActions.map(([label, value]) => <button type="button" key={label} onClick={() => setPrompt(value)}>{label}</button>)}</div>
    </section> : null}
    <section className={styles.workflow}><div className={styles.workflowHeader}><div><h2>{mode === "ask" ? "Recent requests" : mode === "review" ? "Changes waiting for you" : mode === "published" ? "Live and publishing" : "All requests"}</h2><p>Requested <ArrowRight size={12} /> Working <ArrowRight size={12} /> Ready for Review <ArrowRight size={12} /> Published</p></div><span>{visibleJobs.length}</span></div>{visibleJobs.length ? <div className={styles.requestList}>{visibleJobs.map((job) => <button type="button" key={job.id} onClick={() => setSelectedId(job.id)} className={selectedId === job.id ? styles.selected : ""}><StatusIcon status={missionCustomerStatus(job)} /><span><strong>{job.title || job.summary || "Website request"}</strong><small>{job.targetPath || "Website"} · {formatDate(job.updatedAt || job.createdAt)}</small></span><StatusBadge status={missionCustomerStatus(job)} /></button>)}</div> : <div className={styles.empty}><Clock3 size={25} /><strong>{mode === "review" ? "Nothing is waiting for review" : mode === "published" ? "No published changes yet" : "No requests yet"}</strong><p>New Reggie requests will appear here as soon as they are submitted.</p>{mode !== "ask" ? <Link href="/admin/reggie">Ask Reggie<ArrowRight size={14} /></Link> : null}</div>}</section>
    {selected ? <div className={styles.modalBackdrop} onMouseDown={() => setSelectedId("")}><section className={styles.detail} role="dialog" aria-modal="true" aria-labelledby="request-detail-title" onMouseDown={(event) => event.stopPropagation()}><header><div><StatusBadge status={missionCustomerStatus(selected)} /><h2 id="request-detail-title">{selected.title || selected.summary || "Website request"}</h2><p>{selected.reviewDescription || selected.summary || selected.prompt || "Reggie is working from the request you submitted."}</p></div><button type="button" onClick={() => setSelectedId("")} aria-label="Close request details">Close</button></header><dl><div><dt>Affected page</dt><dd>{selected.targetPath || "Website"}</dd></div><div><dt>Requested</dt><dd>{formatDate(selected.createdAt)}</dd></div><div><dt>Updated</dt><dd>{formatDate(selected.updatedAt)}</dd></div></dl>{missionCustomerStatus(selected) === "ready" ? <section className={styles.reviewEvidence}><div><strong>Review the actual change</strong><p>{selected.reviewScreenshots?.length ? "Compare the captured preview below before publishing." : "A visual preview was not captured. Ask PoopSites support to verify the change before publishing."}</p></div></section> : null}{selected.reviewScreenshots?.length ? <div className={styles.previewGrid}>{selected.reviewScreenshots.filter((asset) => asset.path).map((asset) => <ReviewImage missionId={selected.id} path={asset.path as string} password={password} alt={asset.name || "Reggie change preview"} key={`${asset.name}-${asset.path}`} />)}</div> : null}{missionCustomerStatus(selected) === "attention" ? <><div className={styles.attention}><CircleAlert size={17} /><span><strong>This request needs attention</strong>{selected.failureReason || "PoopSites support can review what stopped."}{selected.workflowRunUrl ? <a href={selected.workflowRunUrl} target="_blank" rel="noreferrer">View the failed run<ExternalLink size={13} /></a> : null}{!selectedRetry?.kind ? <small>{selectedRetry?.message || "Request an adjusted follow-up or contact support."}</small> : null}</span></div><div className={styles.reviewActions}><div className={styles.reviewDecision}><button className={styles.decline} type="button" onClick={() => void decline()} disabled={loading}>Decline and remove draft</button>{selectedRetry?.kind ? <button className={styles.publish} type="button" onClick={() => void retryMission()} disabled={loading}>{loading ? "Working..." : selectedRetry.label}</button> : null}</div></div></> : null}{missionCustomerStatus(selected) === "ready" ? <div className={styles.reviewActions}><div className={styles.reviewDecision}><button className={styles.decline} type="button" onClick={() => void decline()} disabled={loading}>Decline and remove draft</button><button className={styles.publish} type="button" onClick={() => void publish()} disabled={loading || !selected.pullRequestNumber}>{loading ? "Working..." : "Approve and publish"}</button></div><form onSubmit={requestEdits}><label htmlFor="feedback">Request an adjustment</label><textarea id="feedback" value={followUp} onChange={(event) => setFollowUp(event.target.value)} placeholder="Tell Reggie what should be different..." /><button type="submit" disabled={loading || followUp.trim().length < 8}>Send feedback</button></form></div> : null}{missionCustomerStatus(selected) === "published" && selected.liveUrl ? <a className={styles.liveLink} href={selected.liveUrl} target="_blank" rel="noreferrer">View the published website<ExternalLink size={15} /></a> : null}</section></div> : null}
  </main>;
}

function DevelopmentHandoffCard({ request, password, onContinue }: { request: DevelopmentRequest; password: string; onContinue: (value: string) => void }) {
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");

  async function uploadFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true); setUploadStatus("");
    try {
      const selected = Array.from(files).slice(0, 3);
      for (const file of selected) {
        if (file.size > 5 * 1024 * 1024) throw new Error(`${file.name} is larger than 5 MB.`);
        const response = await fetch(adminApiUrl(`/api/admin/reggie-development-request?requestId=${encodeURIComponent(request.id)}`), {
          method: "PUT",
          headers: { Authorization: `Bearer ${password}`, "Content-Type": file.type, "X-File-Name": file.name },
          body: file,
        });
        const payload = await response.json().catch(() => ({})) as { ok?: boolean; error?: string };
        if (!response.ok || payload.ok === false) throw new Error(payload.error ?? `${file.name} could not be attached.`);
      }
      setUploadStatus(`${selected.length} file${selected.length === 1 ? "" : "s"} attached for Mark.`);
    } catch (reason) {
      setUploadStatus(reason instanceof Error ? reason.message : "The file could not be attached.");
    } finally { setUploading(false); }
  }

  return <section className={styles.developmentHandoff} aria-label="Development review handoff">
    <div className={styles.developmentHandoffHeader}><CheckCircle2 size={18} /><div><strong>Sent for development review</strong><small>Request {request.reference}</small></div></div>
    <p>Mark has the original request and an implementation brief. You can keep using Reggie while it is reviewed.</p>
    <div className={styles.developmentHandoffActions}>
      <a href={request.calendlyUrl} target="_blank" rel="noreferrer"><Video size={15} />Schedule a Zoom with Mark</a>
      {request.websitePortionSuggestion ? <button type="button" onClick={() => onContinue(request.websitePortionSuggestion)}>Continue with the website-only part</button> : null}
    </div>
    <details className={styles.developmentAssets}><summary><Paperclip size={13} />Add supporting files <span>optional</span></summary><label>JPEG, PNG, WebP, or PDF · up to 3 files · 5 MB each<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple disabled={uploading} onChange={(event) => void uploadFiles(event.target.files)} /></label>{uploadStatus ? <small role="status">{uploadStatus}</small> : null}</details>
  </section>;
}

function StatusIcon({ status }: { status: CustomerStatus }) { return status === "published" ? <CheckCircle2 className={styles.done} size={19} /> : status === "attention" ? <CircleAlert className={styles.failed} size={19} /> : status === "ready" ? <Sparkles className={styles.ready} size={19} /> : <Clock3 className={styles.waiting} size={19} />; }
function StatusBadge({ status }: { status: CustomerStatus }) { return <span className={`${styles.badge} ${styles[`badge_${status}`]}`}>{customerStatusLabel(status)}</span>; }

function ReviewImage({ missionId, path, password, alt }: { missionId: string; path: string; password: string; alt: string }) {
  const [url, setUrl] = useState("");
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    let currentUrl = "";
    setUrl("");
    setState("loading");

    const load = async () => {
      const assetUrl = adminApiUrl(`/api/admin/reggie-mission?assetMissionId=${encodeURIComponent(missionId)}&assetPath=${encodeURIComponent(path)}&assetAttempt=${attempt}`);
      const response = await fetch(assetUrl, { headers: { Authorization: `Bearer ${password}` }, cache: "no-store" });
      if (!response.ok) throw new Error("The authenticated screenshot request failed.");
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.toLowerCase().startsWith("image/")) throw new Error("The screenshot service returned a non-image response.");
      const blob = await response.blob();
      if (!blob.size) throw new Error("The screenshot file was empty.");
      currentUrl = URL.createObjectURL(blob);
      await preloadReviewImage(currentUrl);
      if (!active) return;
      setUrl(currentUrl);
      setState("ready");
    };

    void load().catch(() => {
      if (active) {
        setUrl("");
        setState("error");
      }
    });
    return () => {
      active = false;
      if (currentUrl) URL.revokeObjectURL(currentUrl);
    };
  }, [attempt, missionId, password, path]);

  if (state === "error") {
    return <div className={styles.previewFailure} role="status"><strong>{alt}</strong><p>The screenshot did not load. Retry it with a fresh authenticated request, or review the exact changes in GitHub.</p><button type="button" onClick={() => setAttempt((current) => current + 1)}>Retry screenshot</button></div>;
  }
  // Review captures are authenticated runtime blobs and cannot use next/image.
  // eslint-disable-next-line @next/next/no-img-element
  return state === "ready" && url ? <img className={styles.preview} src={url} alt={alt} onError={() => setState("error")} /> : <div className={styles.previewLoading} role="status">Loading authenticated screenshot...</div>;
}

function preloadReviewImage(url: string) {
  return new Promise<void>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Screenshot image decode failed."));
    image.src = url;
  });
}

function formatDate(value?: string) { if (!value) return "-"; const date = new Date(value); return Number.isNaN(date.valueOf()) ? "-" : date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }); }
function formatDateTime(value: string) { const date = new Date(value); return Number.isNaN(date.valueOf()) ? "Unknown date" : date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); }
function isActionableAnswer(item: ChatMessage) {
  const proposal = item.proposedAction;
  return item.role === "assistant"
    && !item.developmentRequest
    && item.status !== "failed"
    && Boolean(proposal?.id)
    && proposal?.proposalState === "executable"
    && proposal.executable === true
    && ["STRUCTURED_MUTATION", "CODE_MISSION", "HYBRID"].includes(proposal.resolution?.strategy || "");
}
