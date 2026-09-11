"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import { adminApiUrl } from "@/lib/admin-api-client";
import { clearSavedAdminPassword, readSavedAdminPassword, saveAdminPassword } from "@/lib/admin-auth-client";
import { adminRevisionRequestTypes, getAdminRevisionRequestTypeLabel, type AdminRevisionRequestType } from "@/lib/admin-revision";
import { getReggieSectionRecipe, reggieSectionRecipes, type ReggieSectionRecipeId } from "@/lib/reggie-section-recipes";
import {
  cacheBustReviewAssetUrl,
  missionEvidencePresentation,
  missionQueuePresentation,
  missionRetryAction,
  type ReggieMissionEvidenceStatus,
  type ReggieMissionQueueState,
} from "@/lib/reggie-mission-state.mjs";
import { isReggieJobActive, ReggieProgress, type ReggieProgressJob } from "@/components/reggie-progress/ReggieProgress";
import styles from "./ReggieMissionQueue.module.css";

type ReggieMissionJob = ReggieProgressJob & {
  id: string;
  title?: string;
  requestType?: AdminRevisionRequestType;
  branchName?: string;
  prompt?: string;
  targetPath?: string;
  reviewDescription?: string;
  summary?: string;
  workflowRunUrl?: string;
  pullRequestUrl?: string;
  pullRequestNumber?: number | null;
  pullRequestMerged?: boolean;
  liveUrl?: string;
  attentionStage?: string;
  createdAt?: string;
  updatedAt?: string;
  attemptNumber?: number;
  maxAttempts?: number;
  queue?: ReggieMissionQueueState;
  dispatchStatus?: string;
  dispatchAttempts?: number;
  clientChecksStatus?: string;
  clientChecksRunUrl?: string;
  evidenceStatus?: ReggieMissionEvidenceStatus;
  evidenceError?: string;
  draftPreview?: { url: string; commitSha: string; expiresAt: string } | null;
  reviewScreenshots?: Array<{
    name: string;
    url: string;
    path?: string;
    kind?: "before" | "after" | "diff";
    viewport?: string;
  }>;
};

type QueueResponse = {
  ok: boolean;
  configured?: boolean;
  warning?: string;
  error?: string;
  jobs?: ReggieMissionJob[];
  openAiSecretConfigured?: boolean;
  cloudflareDeployConfigured?: boolean;
};
type MissionMutationResponse = { ok?: boolean; error?: string };

type LandingPageBrief = {
  recipeId: ReggieSectionRecipeId;
  audience: string;
  goal: string;
  primaryCta: string;
  ctaLabel: string;
  offer: string;
  leadMagnet: string;
  notes: string;
};

const landingPageCtas = [
  { value: "get_quote", label: "Get a quote" },
  { value: "book_now", label: "Book now" },
  { value: "fill_out_form", label: "Fill out a form" },
  { value: "call_now", label: "Call now" },
  { value: "other", label: "Other" },
];

const emptyLandingPageBrief: LandingPageBrief = {
  recipeId: "local-service-lead-gen",
  audience: "",
  goal: "Generate qualified leads",
  primaryCta: "get_quote",
  ctaLabel: "",
  offer: "",
  leadMagnet: "",
  notes: "",
};

export function ReggieMissionQueue({ initialPassword = "", initialAuthed = false }: { initialPassword?: string; initialAuthed?: boolean } = {}) {
  const [password, setPassword] = useState(() => initialPassword || readSavedAdminPassword());
  const [authed, setAuthed] = useState(() => initialAuthed || Boolean(initialPassword || readSavedAdminPassword()));
  const [previewClock, setPreviewClock] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setPreviewClock(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const [jobs, setJobs] = useState<ReggieMissionJob[]>([]);
  const [selectedJob, setSelectedJob] = useState<ReggieMissionJob | null>(null);
  const [requestType, setRequestType] = useState<AdminRevisionRequestType>("site_revision");
  const [title, setTitle] = useState("");
  const [targetPath, setTargetPath] = useState("/");
  const [prompt, setPrompt] = useState("");
  const [landingBrief, setLandingBrief] = useState<LandingPageBrief>(emptyLandingPageBrief);
  const [followUpPrompt, setFollowUpPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [queueLoading, setQueueLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [statusNote, setStatusNote] = useState("");
  const [lastQueueLoadedAt, setLastQueueLoadedAt] = useState("");
  const lastQueueRefreshRef = useRef(0);
  const queueRequestIdRef = useRef(0);
  const pendingMissionKeyRef = useRef("");
  const pendingFollowUpKeyRef = useRef("");

  const authHeaders = useCallback((token = password) => ({ Authorization: `Bearer ${token}` }), [password]);
  const activeJobs = useMemo(() => jobs.filter(isReggieJobActive), [jobs]);
  const visibleJobs = useMemo(() => jobs.filter((job) => job.status !== "cancelled"), [jobs]);
  const isLandingPage = requestType === "landing_page";

  const loadQueue = useCallback(async (token = password, refresh = false) => {
    const requestId = queueRequestIdRef.current + 1;
    queueRequestIdRef.current = requestId;
    lastQueueRefreshRef.current = Date.now();
    setQueueLoading(true);
    try {
      const res = await fetch(adminApiUrl(`/api/admin/reggie-mission${refresh ? "?refresh=1" : ""}`), {
        headers: authHeaders(token),
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({})) as QueueResponse;
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Could not load Reggie missions.");
      }
      if (queueRequestIdRef.current === requestId) {
        const nextJobs = data.jobs ?? [];
        setJobs((currentJobs) => {
          if (refresh && currentJobs.length > 0 && nextJobs.length === 0 && data.configured !== false) {
            return currentJobs;
          }

          return nextJobs;
        });
        setStatusNote(data.warning ?? (!data.configured ? "This site has not been connected to Reggie yet." : ""));
        setLastQueueLoadedAt(new Date().toISOString());
      }
    } finally {
      if (queueRequestIdRef.current === requestId) {
        setQueueLoading(false);
      }
    }
  }, [authHeaders, password]);

  const authenticate = useCallback(async (token: string) => {
    // This endpoint exists in both Next/Workers and static Cloudflare Pages
    // installations. `/api/admin/settings` is intentionally Workers-only.
    const res = await fetch(adminApiUrl("/api/admin/reggie-lens/auth"), { headers: authHeaders(token) });
    if (!res.ok) {
      throw new Error("Invalid admin password or Reggie API is not configured.");
    }
    setAuthed(true);
    saveAdminPassword(token);
    await loadQueue(token, true);
  }, [authHeaders, loadQueue]);

  useEffect(() => {
    const saved = readSavedAdminPassword();
    if (!saved) return;
    setPassword(saved);
    void loadQueue(saved, true).catch((reason) => setError(reason instanceof Error ? reason.message : "Could not load Reggie missions."));
  }, [loadQueue]);

  useEffect(() => {
    if (!authed) return;
    const timer = window.setInterval(() => {
      void loadQueue(password, true).catch(() => undefined);
    }, activeJobs.length > 0 || jobs.length === 0 ? 10000 : 30000);
    return () => window.clearInterval(timer);
  }, [activeJobs.length, authed, jobs.length, loadQueue, password]);

  useEffect(() => {
    if (!selectedJob || jobs.length === 0) return;
    const latest = jobs.find((job) => job.id === selectedJob.id);
    if (latest && latest !== selectedJob) setSelectedJob(latest);
    if (!latest) setSelectedJob(null);
  }, [jobs, selectedJob]);

  useEffect(() => {
    if (!authed) return;

    const earlyRefreshTimers = [2500, 7500, 15000].map((delay) => window.setTimeout(() => {
      void loadQueue(password, true).catch(() => undefined);
    }, delay));

    const refreshIfStale = () => {
      if (document.visibilityState === "hidden") return;
      if (Date.now() - lastQueueRefreshRef.current < 5000) return;
      void loadQueue(password, true).catch(() => undefined);
    };

    window.addEventListener("focus", refreshIfStale);
    document.addEventListener("visibilitychange", refreshIfStale);

    return () => {
      earlyRefreshTimers.forEach((timer) => window.clearTimeout(timer));
      window.removeEventListener("focus", refreshIfStale);
      document.removeEventListener("visibilitychange", refreshIfStale);
    };
  }, [authed, loadQueue, password]);

  const handleLogin = useCallback(async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      await authenticate(password);
    } catch (err) {
      clearSavedAdminPassword();
      setError(err instanceof Error ? err.message : "Invalid admin password or Reggie API is not configured.");
    }
  }, [authenticate, password]);

  const submitMission = useCallback(async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const landingPath = isLandingPage ? normalizeLandingPagePath(targetPath) : "";
      if (isLandingPage && !landingPath) {
        throw new Error("Choose a new page address, such as /spring-cleanup. Landing pages cannot replace the homepage.");
      }

      const missionTitle = isLandingPage
        ? (title.trim() || `New landing page: ${landingPath}`)
        : title;
      const missionPrompt = isLandingPage
        ? buildLandingPagePrompt(landingPath, landingBrief)
        : prompt;
      const idempotencyKey = pendingMissionKeyRef.current || `mission-${crypto.randomUUID()}`;
      pendingMissionKeyRef.current = idempotencyKey;
      const res = await fetch(adminApiUrl("/api/admin/reggie-mission"), {
        method: "POST",
        headers: {
          ...authHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requestType,
          title: missionTitle,
          targetPath: isLandingPage ? landingPath : targetPath,
          prompt: missionPrompt,
          ...(isLandingPage ? landingBrief : {}),
          idempotencyKey,
        }),
      });
      const data = await res.json().catch(() => ({})) as MissionMutationResponse;
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Could not launch the mission.");
      }
      setMessage("Mission launched. Reggie is drafting the change.");
      pendingMissionKeyRef.current = "";
      setPrompt("");
      setTitle("");
      if (isLandingPage) {
        setTargetPath("");
        setLandingBrief(emptyLandingPageBrief);
      }
      await loadQueue(password, true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not launch the mission.");
    } finally {
      setLoading(false);
    }
  }, [authHeaders, isLandingPage, landingBrief, loadQueue, password, prompt, requestType, targetPath, title]);

  const chooseMissionType = useCallback((nextType: AdminRevisionRequestType) => {
    setRequestType(nextType);
    if (nextType === "landing_page") {
      setTargetPath("");
      setPrompt("");
    } else if (!targetPath.trim()) {
      setTargetPath("/");
    }
  }, [targetPath]);

  const startLandingPage = useCallback(() => {
    chooseMissionType("landing_page");
    setMessage("Tell Reggie who this page is for and what action it should drive. It will create a new route and leave the homepage alone.");
    setError("");
  }, [chooseMissionType]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("new") !== "landing-page") return;
    startLandingPage();
  }, [startLandingPage]);

  const publishMission = useCallback(async () => {
    if (!selectedJob?.pullRequestNumber) return;
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch(adminApiUrl("/api/admin/reggie-mission"), {
        method: "PATCH",
        headers: {
          ...authHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          missionId: selectedJob.id,
          pullRequestNumber: selectedJob.pullRequestNumber,
          branchName: selectedJob.branchName,
        }),
      });
      const data = await res.json().catch(() => ({})) as MissionMutationResponse;
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Could not publish this mission.");
      }
      setMessage("Mission published. Reggie is tracking deploy status.");
      await loadQueue(password, true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not publish this mission.");
    } finally {
      setLoading(false);
    }
  }, [authHeaders, loadQueue, password, selectedJob]);

  const discardMission = useCallback(async () => {
    if (!selectedJob?.id) return;
    if (!["ready_for_review", "failed", "needs_attention"].includes(selectedJob.status) || selectedJob.pullRequestMerged) return;
    const confirmed = window.confirm("Discard this Reggie revision? Reggie will close its pull request and remove the draft branch when possible.");
    if (!confirmed) return;
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch(adminApiUrl("/api/admin/reggie-mission"), {
        method: "PATCH",
        headers: {
          ...authHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "cancel",
          missionId: selectedJob.id,
          pullRequestNumber: selectedJob.pullRequestNumber,
          branchName: selectedJob.branchName,
        }),
      });
      const data = await res.json().catch(() => ({})) as { ok?: boolean; error?: string; warnings?: string[] };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Could not discard this mission.");
      }
      setMessage(data.warnings?.length ? `Mission discarded. ${data.warnings.join(" ")}` : "Mission discarded and its draft will not be published.");
      await loadQueue(password, true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not discard this mission.");
    } finally {
      setLoading(false);
    }
  }, [authHeaders, loadQueue, password, selectedJob]);

  const requestEdits = useCallback(async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedJob?.id || !selectedJob.branchName) return;
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch(adminApiUrl("/api/admin/reggie-mission"), {
        method: "POST",
        headers: {
          ...authHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requestType: selectedJob.requestType ?? "site_revision",
          prompt: followUpPrompt,
          title: `Follow-up for ${selectedJob.id}`,
          targetPath: "",
          parentMissionId: selectedJob.id,
          idempotencyKey: pendingFollowUpKeyRef.current || (pendingFollowUpKeyRef.current = `followup-${selectedJob.id}-${crypto.randomUUID()}`),
        }),
      });
      const data = await res.json().catch(() => ({})) as MissionMutationResponse;
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? "Could not request edits.");
      }
      setMessage("Follow-up edit requested as a new revision.");
      pendingFollowUpKeyRef.current = "";
      setFollowUpPrompt("");
      await loadQueue(password, true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not request edits.");
    } finally {
      setLoading(false);
    }
  }, [authHeaders, followUpPrompt, loadQueue, password, selectedJob]);

  const openDraft = async () => {
    if (!selectedJob?.draftPreview) return;
    const tab = window.open("about:blank", "_blank");
    if (tab) tab.opener = null;
    try {
      if (!tab) throw new Error("Allow popups to open the draft website.");
      const response = await fetch(adminApiUrl(`/api/admin/reggie-mission?previewMissionId=${encodeURIComponent(selectedJob.id)}`), { method: "POST", headers: authHeaders() });
      const data = await response.json() as { ok?: boolean; url?: string; error?: string };
      if (!response.ok || !data.ok || !data.url || !data.url.startsWith(`${selectedJob.draftPreview.url}/__reggie_open#`)) throw new Error(data.error || "Draft access could not be created.");
      tab.location.href = data.url;
    } catch (error) { tab?.close(); setError(error instanceof Error ? error.message : "Draft could not be opened."); }
  };

  const retryMission = useCallback(async (job = selectedJob) => {
    if (!job?.id) return;
    const action = missionRetryAction(job);
    if (!action.kind) return;
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch(adminApiUrl(`/api/admin/reggie-mission?retryMissionId=${encodeURIComponent(job.id)}`), {
        method: "POST",
        headers: authHeaders(),
      });
      const data = await res.json().catch(() => ({})) as { ok?: boolean; error?: string; revalidating?: boolean; job?: ReggieMissionJob };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Could not retry this mission.");
      setMessage(data.revalidating ? "Production checks were queued for revalidation." : "Mission retry queued. Its queue position will appear as soon as Reggie assigns it.");
      if (data.job) setSelectedJob(data.job);
      await loadQueue(password, true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not retry this mission.");
    } finally {
      setLoading(false);
    }
  }, [authHeaders, loadQueue, password, selectedJob]);

  if (!authed) {
    return (
      <main className={styles.page}>
        <form className={styles.login} onSubmit={handleLogin}>
          <h1>Ask Reggie</h1>
          <p>Review missions, pull requests, and deploy status.</p>
          <label>
            Admin password
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          <button type="submit">Enter Queue</button>
          {error ? <p className={styles.error}>{error}</p> : null}
        </form>
      </main>
    );
  }

  const selectedQueue = selectedJob ? missionQueuePresentation(selectedJob) : null;
  const selectedEvidence = selectedJob ? missionEvidencePresentation(selectedJob) : null;
  const selectedRetry = selectedJob ? missionRetryAction(selectedJob) : null;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>Ask Reggie</h1>
          <p>Launch missions, review the draft, request edits, and publish when ready.</p>
        </div>
        <div className={styles.headerActions}>
          <button type="button" onClick={startLandingPage}>New Landing Page</button>
          <button type="button" onClick={() => void loadQueue(password, true)} disabled={queueLoading}>
            {queueLoading ? "Refreshing..." : "Refresh Missions"}
          </button>
        </div>
      </header>

      {statusNote ? <p className={styles.notice}>{statusNote}</p> : null}
      {message ? <p className={styles.notice}>{message}</p> : null}
      {error ? <p className={styles.error}>{error}</p> : null}

      <section className={styles.layout}>
        <form className={styles.panel} onSubmit={submitMission}>
          <h2>{isLandingPage ? "Build a New Landing Page" : "Request a Website Change"}</h2>
          <label>
            Mission type
            <select value={requestType} onChange={(event) => chooseMissionType(event.target.value as AdminRevisionRequestType)}>
              {adminRevisionRequestTypes.map((type) => <option value={type.value} key={type.value}>{type.label}</option>)}
            </select>
          </label>
          {isLandingPage ? (
            <>
              <p className={styles.landingIntro}>Reggie will create a focused, conversion-ready page at a brand-new address. The homepage and existing pages are protected.</p>
              <label>
                New page address
                <input value={targetPath} onChange={(event) => setTargetPath(event.target.value)} placeholder="/spring-cleanup-special" autoCapitalize="none" />
              </label>
              <label>
                Page title (optional)
                <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Spring cleanup special" />
              </label>
              <div className={styles.landingGrid}>
                <label>
                  Approved page recipe
                  <select value={landingBrief.recipeId} onChange={(event) => setLandingBrief((current) => ({ ...current, recipeId: event.target.value as ReggieSectionRecipeId }))}>
                    {reggieSectionRecipes.map((recipe) => <option value={recipe.id} key={recipe.id}>{recipe.name}</option>)}
                  </select>
                </label>
                <label>
                  Who is this for?
                  <input value={landingBrief.audience} onChange={(event) => setLandingBrief((current) => ({ ...current, audience: event.target.value }))} placeholder="Busy dog owners in Las Cruces" />
                </label>
                <label>
                  Main goal
                  <input value={landingBrief.goal} onChange={(event) => setLandingBrief((current) => ({ ...current, goal: event.target.value }))} placeholder="Generate qualified leads" />
                </label>
                <label>
                  Primary CTA
                  <select value={landingBrief.primaryCta} onChange={(event) => setLandingBrief((current) => ({ ...current, primaryCta: event.target.value }))}>
                    {landingPageCtas.map((cta) => <option value={cta.value} key={cta.value}>{cta.label}</option>)}
                  </select>
                </label>
                <label>
                  CTA button text (optional)
                  <input value={landingBrief.ctaLabel} onChange={(event) => setLandingBrief((current) => ({ ...current, ctaLabel: event.target.value }))} placeholder="Get my free quote" />
                </label>
                <label>
                  Offer (optional)
                  <input value={landingBrief.offer} onChange={(event) => setLandingBrief((current) => ({ ...current, offer: event.target.value }))} placeholder="First cleanup free" />
                </label>
                <label>
                  Lead magnet (optional)
                  <input value={landingBrief.leadMagnet} onChange={(event) => setLandingBrief((current) => ({ ...current, leadMagnet: event.target.value }))} placeholder="Free yard cleanup checklist" />
                </label>
              </div>
              <label>
                Anything else Reggie should know? (optional)
                <textarea value={landingBrief.notes} onChange={(event) => setLandingBrief((current) => ({ ...current, notes: event.target.value }))} placeholder="Campaign, service area, must-have copy, or design direction." />
              </label>
              <p className={styles.landingSafety}>Safety rule: this mission creates <strong>{normalizeLandingPagePath(targetPath) || "a new page"}</strong>; it must not replace or rewrite <strong>/</strong>.</p>
            </>
          ) : (
            <>
              <label>
                Mission title
                <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Homepage CTA cleanup" />
              </label>
              <label>
                Page or area
                <input value={targetPath} onChange={(event) => setTargetPath(event.target.value)} placeholder="/" />
              </label>
              <label>
                Mission brief
                <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Describe the exact website change Reggie should draft." />
              </label>
            </>
          )}
          <button type="submit" disabled={loading || (isLandingPage ? !normalizeLandingPagePath(targetPath) : prompt.trim().length < 12)} aria-label="Submit Revision">
            {loading ? "Launching..." : "Launch Mission"}
          </button>
        </form>

        <section className={styles.queue}>
          <div className={styles.queueHeader}>
            <h2>Mission Queue</h2>
            <span>
              {visibleJobs.length} missions
              {lastQueueLoadedAt ? `, updated ${formatQueueTime(lastQueueLoadedAt)}` : ""}
            </span>
          </div>
          {queueLoading && visibleJobs.length === 0 ? (
            <div className={styles.empty}>Loading missions...</div>
          ) : visibleJobs.length === 0 ? (
            <div className={styles.empty}>No missions yet.</div>
          ) : visibleJobs.map((job) => (
            <article className={styles.jobCard} key={job.id}>
              <div className={styles.jobTop}>
                <div>
                  <strong>{job.title || job.id}</strong>
                  <span>{job.requestType ? getAdminRevisionRequestTypeLabel(job.requestType) : "Site revision"}</span>
                </div>
                <span className={styles.status}>{formatStatus(job)}</span>
              </div>
              <p>{job.reviewDescription || job.summary || job.prompt || "Reggie mission"}</p>
              <MissionDispatchState job={job} />
              <ReggieProgress job={job} compact />
              <div className={styles.cardActions}>
                <button type="button" onClick={() => setSelectedJob(job)}>Review &amp; Publish</button>
                {missionRetryAction(job).kind ? <button type="button" disabled={loading} onClick={() => void retryMission(job)}>{missionRetryAction(job).kind === "retry" ? "Retry Mission" : "Revalidate Checks"}</button> : null}
                {job.workflowRunUrl ? <a href={job.workflowRunUrl} target="_blank" rel="noreferrer">{job.status === "needs_attention" || job.status === "failed" ? "View failed run" : "View mission run"}</a> : null}
                {job.pullRequestUrl ? <a href={job.pullRequestUrl} target="_blank" rel="noreferrer">Open pull request</a> : null}
              </div>
            </article>
          ))}
        </section>
      </section>

      {selectedJob ? (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-labelledby="reggie-review-title">
          <section className={styles.modal}>
            <div className={styles.modalHeader}>
              <div>
                <h2 id="reggie-review-title">Review Mission</h2>
                <p>{selectedJob.reviewDescription || selectedJob.summary || selectedJob.prompt || selectedJob.id}</p>
              </div>
              <button type="button" onClick={() => setSelectedJob(null)}>Close</button>
            </div>

            <ReggieProgress job={selectedJob} />

            <div className={styles.metaGrid}>
              <span>Status: {formatStatus(selectedJob)}</span>
              <span>Mission type: {selectedJob.requestType ? getAdminRevisionRequestTypeLabel(selectedJob.requestType) : "Site revision"}</span>
              <span>Page or area: {selectedJob.targetPath || "Website"}</span>
              <span>Draft branch: {selectedJob.branchName || "Not ready"}</span>
              <span>Deployment: {formatDeployment(selectedJob.deployStatus)}</span>
              {selectedQueue?.state !== "complete" ? <span>Runner queue: {selectedQueue?.label}</span> : null}
              {selectedJob.dispatchStatus ? <span>Dispatch: {formatDispatchStatus(selectedJob.dispatchStatus)}</span> : null}
            </div>

            {selectedJob.draftPreview && Date.parse(selectedJob.draftPreview.expiresAt) > previewClock ? <section className={styles.screenshotReview} aria-label="Draft website preview">
              <h3>Explore the draft website</h3>
              <p>Scroll through the full pages and use the navigation before publishing. Try example pricing and signup with test details. Nothing is booked, sent, or charged.</p>
              <div className={styles.evidenceActions}><button type="button" onClick={() => void openDraft()}>Open draft website</button></div>
              <p>Access requires this signed-in dashboard and lasts 30 minutes. Preview available until {new Date(selectedJob.draftPreview.expiresAt).toLocaleString()}.</p>
            </section> : null}

            {selectedEvidence && (!selectedJob.draftPreview || Date.parse(selectedJob.draftPreview.expiresAt) <= previewClock) ? (
              <section className={styles.screenshotReview} aria-label="Screenshot evidence" data-tone={selectedEvidence.tone}>
                <div className={styles.sectionHeader}>
                  <h3>{selectedEvidence.title}</h3>
                  <span>{selectedJob.reviewScreenshots?.length ? `${selectedJob.reviewScreenshots.length} captures` : selectedEvidence.state}</span>
                </div>
                <p className={styles.evidenceDetail}>{selectedEvidence.detail}</p>
                {selectedJob.reviewScreenshots?.length ? <div className={styles.screenshotGrid}>
                  {selectedJob.reviewScreenshots.map((asset) => (
                    <ReviewScreenshot
                      asset={asset}
                      authHeaders={authHeaders}
                      key={`${asset.name}-${asset.path || asset.url}`}
                      missionId={selectedJob.id}
                      workflowRunUrl={selectedJob.workflowRunUrl}
                    />
                  ))}
                </div> : null}
                <div className={styles.evidenceActions}>
                  {selectedEvidence.state !== "available" ? <button type="button" disabled={queueLoading} onClick={() => void loadQueue(password, true)}>{queueLoading ? "Refreshing..." : "Refresh evidence status"}</button> : null}
                  {selectedJob.workflowRunUrl && selectedEvidence.state !== "available" ? <a href={selectedJob.workflowRunUrl} target="_blank" rel="noreferrer">Open mission run</a> : null}
                </div>
              </section>
            ) : null}

            {selectedJob.status === "needs_attention" || selectedJob.status === "failed" ? (
              <section className={styles.attention}>
                <h3>{selectedJob.attentionStage === "deployment" ? "The deployment needs attention" : "The draft needs attention"}</h3>
                <p>{selectedJob.failureReason || "Open the mission run to see the exact step that stopped."}</p>
                <p>{selectedJob.pullRequestUrl ? "The pull request was created and is available below." : "No pull request was created for this mission."}</p>
                {selectedRetry?.message ? <p>{selectedRetry.message}</p> : null}
                {selectedRetry?.kind === "retry" ? <button type="button" disabled={loading} onClick={() => void retryMission()}>{selectedRetry.label}</button> : null}
              </section>
            ) : null}

            {selectedRetry?.kind === "revalidate" ? (
              <section className={`${styles.attention} ${styles.revalidation}`}>
                <h3>Production checks need revalidation</h3>
                <p>{selectedRetry.message}</p>
                <button type="button" disabled={loading} onClick={() => void retryMission()}>{selectedRetry.label}</button>
              </section>
            ) : null}

            <form className={styles.reviewSection} onSubmit={requestEdits}>
              <h3>Request Edits</h3>
              <label>
                Ask Reggie to adjust this draft
                <textarea value={followUpPrompt} onChange={(event) => setFollowUpPrompt(event.target.value)} placeholder="Tell Reggie what should be changed on this same draft." />
              </label>
              <button type="submit" disabled={loading || followUpPrompt.trim().length < 12 || !selectedJob.branchName}>Request Edits</button>
            </form>

            <div className={styles.modalActions}>
              {selectedJob.workflowRunUrl ? <a href={selectedJob.workflowRunUrl} target="_blank" rel="noreferrer">{selectedJob.status === "needs_attention" || selectedJob.status === "failed" ? "View failed run" : "View mission run"}</a> : null}
              {selectedJob.pullRequestUrl ? <a href={selectedJob.pullRequestUrl} target="_blank" rel="noreferrer">Open pull request</a> : null}
              {selectedJob.liveUrl && selectedJob.deployStatus === "success" ? <a href={selectedJob.liveUrl} target="_blank" rel="noreferrer">View Live Site</a> : null}
              {["ready_for_review", "failed", "needs_attention"].includes(selectedJob.status) && !selectedJob.pullRequestMerged ? (
                <button className={styles.dangerButton} type="button" disabled={loading} onClick={() => void discardMission()}>Decline &amp; Remove Draft</button>
              ) : null}
              <button type="button" disabled={loading || selectedJob.status !== "ready_for_review" || !selectedJob.pullRequestNumber || selectedJob.pullRequestMerged} onClick={() => void publishMission()}>
                {selectedJob.pullRequestMerged ? "Already Published" : selectedJob.status === "ready_for_review" && selectedJob.pullRequestNumber ? "Publish Mission" : "Waiting for pull request"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

function MissionDispatchState({ job }: { job: ReggieMissionJob }) {
  const queue = missionQueuePresentation(job);
  if (queue.state === "complete") return null;
  return (
    <div className={styles.dispatchState} data-state={queue.state} role="status">
      <strong>{queue.label}</strong>
      <span>{queue.detail}</span>
    </div>
  );
}

function ReviewScreenshot({
  asset,
  authHeaders,
  missionId,
  workflowRunUrl,
}: {
  asset: NonNullable<ReggieMissionJob["reviewScreenshots"]>[number];
  authHeaders: () => { Authorization: string };
  missionId: string;
  workflowRunUrl?: string;
}) {
  const [imageUrl, setImageUrl] = useState("");
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let disposed = false;
    let objectUrl = "";
    setImageUrl("");
    setState("loading");

    const load = async () => {
      let candidateUrl = "";
      if (asset.path) {
        const proxyUrl = adminApiUrl(`/api/admin/reggie-mission?assetMissionId=${encodeURIComponent(missionId)}&assetPath=${encodeURIComponent(asset.path)}`);
        const response = await fetch(cacheBustReviewAssetUrl(proxyUrl, attempt), { headers: authHeaders(), cache: "no-store" });
        const contentType = response.headers.get("content-type") || "";
        if (!response.ok) throw new Error("The authenticated screenshot request failed.");
        if (!contentType.toLowerCase().startsWith("image/")) throw new Error("The screenshot service returned a non-image response.");
        const blob = await response.blob();
        if (!blob.size) throw new Error("The screenshot file was empty.");
        objectUrl = URL.createObjectURL(blob);
        candidateUrl = objectUrl;
      } else if (asset.url) {
        candidateUrl = cacheBustReviewAssetUrl(asset.url, attempt);
      } else {
        throw new Error("No screenshot file was supplied.");
      }

      await preloadScreenshot(candidateUrl);
      if (disposed) return;
      setImageUrl(candidateUrl);
      setState("ready");
    };

    void load().catch(() => {
      if (!disposed) {
        setImageUrl("");
        setState("error");
      }
    });

    return () => {
      disposed = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [asset.path, asset.url, attempt, authHeaders, missionId]);

  if (state === "error") {
    return (
      <div className={styles.screenshotFailure} role="status">
        <strong>{asset.name}</strong>
        <p>The screenshot did not load, so Reggie hid the broken image. Retry it with a fresh request, or open the mission run for capture details.</p>
        <div className={styles.evidenceActions}>
          <button type="button" onClick={() => setAttempt((current) => current + 1)}>Retry screenshot</button>
          {workflowRunUrl ? <a href={workflowRunUrl} target="_blank" rel="noreferrer">Open mission run</a> : null}
        </div>
      </div>
    );
  }

  if (state !== "ready" || !imageUrl) {
    return <div className={styles.screenshotLoading} role="status"><strong>{asset.name}</strong><span>Loading authenticated screenshot...</span></div>;
  }

  return (
    <a className={styles.screenshotLink} href={imageUrl} target="_blank" rel="noreferrer">
      {/* Authenticated review assets are short-lived blob URLs and cannot use the Next image optimizer. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imageUrl} alt={asset.name} loading="lazy" onError={() => setState("error")} />
      <span>{asset.name}</span>
    </a>
  );
}

function preloadScreenshot(url: string) {
  return new Promise<void>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Screenshot image decode failed."));
    image.src = url;
  });
}

function normalizeLandingPagePath(value: string) {
  const raw = value.trim().replace(/\\/g, "/").replace(/[?#].*$/, "");
  if (!raw) return "";
  const path = `/${raw.replace(/^\/+/, "").replace(/\/+$/, "")}`;
  if (path === "/" || path.includes("..") || !/^\/[a-z0-9][a-z0-9/_-]*$/i.test(path)) return "";
  return path;
}

function buildLandingPagePrompt(targetPath: string, brief: LandingPageBrief) {
  const cta = landingPageCtas.find((option) => option.value === brief.primaryCta)?.label ?? "Get a quote";
  const recipe = getReggieSectionRecipe(brief.recipeId);
  const details = [
    `Approved recipe: ${recipe.name}.`,
    `Approved section outline: ${recipe.sections.join("; ")}.`,
    `Audience: ${brief.audience || "Use the service and location context already in this site."}`,
    `Goal: ${brief.goal || "Generate qualified leads."}`,
    `Primary CTA: ${brief.ctaLabel || cta}.`,
    brief.offer ? `Offer: ${brief.offer}.` : "",
    brief.leadMagnet ? `Lead magnet: ${brief.leadMagnet}.` : "",
    brief.notes ? `Additional direction: ${brief.notes}` : "",
  ].filter(Boolean);

  return [
    `Create a brand-new landing page at ${targetPath}.`,
    "This is a new route, not a homepage revision. Do not replace, rewrite, or remove the homepage or existing page content.",
    "Use the site's existing design system, booking/quote flow, and components. Keep the CTA wired to the existing working conversion path.",
    ...details,
  ].join("\n");
}

function formatStatus(job: ReggieMissionJob) {
  if (job.status === "ready_for_review") return "Ready to publish";
  if (job.status === "drafting") return "Drafting change";
  if (job.status === "checking") return "Running checks";
  if (job.status === "publishing") return "Publishing";
  if (job.status === "live") return "Live";
  if (job.status === "cancelled") return "Discarded";
  if (job.status === "needs_attention") return "Needs your attention";
  if (job.status === "published") return job.deployStatus === "success" ? "Published live" : "Publishing";
  if (job.status === "working") return "Drafting";
  if (job.status === "queued") return "Queued";
  if (job.status === "failed") return "Needs attention";
  return job.status || "Unknown";
}

function formatDeployment(status?: string) {
  const labels: Record<string, string> = {
    not_started: "Not started",
    in_progress: "In progress",
    success: "Live",
    failed: "Failed",
  };
  return labels[status || "not_started"] ?? (status || "Not started");
}

function formatDispatchStatus(status?: string) {
  const labels: Record<string, string> = {
    pending: "Waiting for dispatch",
    retry_pending: "Retry waiting for dispatch",
    reserved: "Runner reserved",
    accepted: "Runner starting",
    claimed: "Runner active",
    terminal: "Dispatch complete",
  };
  return labels[status || ""] ?? (status || "Not started").replaceAll("_", " ");
}

function formatQueueTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "just now";
  }

  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}
