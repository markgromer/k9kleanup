"use client";

import { missionQueuePresentation, type ReggieMissionQueueState } from "@/lib/reggie-mission-state.mjs";
import styles from "./ReggieProgress.module.css";

export type ReggieProgressJob = {
  id?: string;
  status: string;
  failureReason?: string;
  attentionStage?: string;
  deployStatus?: string;
  deployFailureReason?: string;
  deployCreatedAt?: string;
  deployUpdatedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  queue?: ReggieMissionQueueState;
  dispatchStatus?: string;
};

type ReggieProgressPhase = {
  label: string;
  detail: string;
  minute: number;
};

const revisionProgressPhases: ReggieProgressPhase[] = [
  { label: "Queued", detail: "Saving the mission and waiting for GitHub Actions to pick it up.", minute: 0 },
  { label: "Preparing coding environment", detail: "Installing dependencies and checking the site context.", minute: 1 },
  { label: "Reggie is drafting changes", detail: "Codex is editing the branch based on the mission brief.", minute: 2 },
  { label: "Running checks", detail: "Lint and production build checks are running.", minute: 6 },
  { label: "Preparing review", detail: "The pull request is being attached for your review.", minute: 8 },
];

const deployProgressPhases: ReggieProgressPhase[] = [
  { label: "Publish requested", detail: "Merging the approved pull request into main.", minute: 0 },
  { label: "Waiting for deploy", detail: "GitHub is starting the Cloudflare deploy workflow.", minute: 1 },
  { label: "Deploy running", detail: "Cloudflare is building and publishing the latest site.", minute: 2 },
  { label: "Verifying live site", detail: "Waiting for the deploy workflow to finish cleanly.", minute: 5 },
];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function minutesBetween(start?: string, now = Date.now()) {
  if (!start) return 0;
  const startedAt = new Date(start).getTime();
  if (Number.isNaN(startedAt)) return 0;
  return Math.max(0, (now - startedAt) / 60000);
}

function formatWaitTime(totalMinutes: number, elapsedMinutes: number) {
  const remaining = Math.ceil(clamp(totalMinutes - elapsedMinutes, 0, totalMinutes));
  if (remaining <= 0) return "Any minute now";
  if (remaining === 1) return "About 1 minute";
  return `About ${remaining} minutes`;
}

function getPhaseForElapsed(phases: ReggieProgressPhase[], elapsedMinutes: number) {
  return phases.reduce((current, phase) => (elapsedMinutes >= phase.minute ? phase : current), phases[0]);
}

function formatDeployStatus(job: ReggieProgressJob) {
  if (!job.deployStatus || job.deployStatus === "not_started") return "";
  const labels: Record<string, string> = {
    waiting_for_deploy: "Waiting for deploy run",
    queued: "Deploy queued",
    in_progress: "Deploy running",
    success: "Deploy live",
    failed: "Deploy failed",
    not_found: "Deploy not found",
  };
  return labels[job.deployStatus] ?? `Deploy ${job.deployStatus}`;
}

export function isReggieJobActive(job: ReggieProgressJob) {
  if (["queued", "working", "drafting", "checking", "publishing", "published"].includes(job.status)) {
    return job.status !== "published" || Boolean(job.deployStatus && !["success", "failed", "not_found"].includes(job.deployStatus));
  }
  return false;
}

export function getReggieProgress(job: ReggieProgressJob, now = Date.now()) {
  const revisionElapsed = minutesBetween(job.createdAt, now);
  const deployElapsed = minutesBetween(job.deployCreatedAt || job.deployUpdatedAt || job.updatedAt, now);

  if (job.status === "cancelled") {
    return {
      label: "Discarded",
      detail: "This draft was discarded and will not be published.",
      percent: 100,
      estimate: "Stopped",
      tone: "bad" as const,
      phases: revisionProgressPhases,
      currentLabel: "Preparing review",
    };
  }

  if (job.status === "failed" || job.status === "needs_attention" || job.failureReason) {
    const deploymentFailure = job.attentionStage === "deployment";
    return {
      label: deploymentFailure ? "Deploy needs attention" : "Mission needs attention",
      detail: job.failureReason || (deploymentFailure ? "The deployment workflow stopped before the site could be confirmed live." : "The draft workflow stopped before it was ready for review."),
      percent: 100,
      estimate: "Stopped",
      tone: "bad" as const,
      phases: deploymentFailure ? deployProgressPhases : revisionProgressPhases,
      currentLabel: "Needs attention",
    };
  }

  if (job.deployStatus === "failed" || job.deployStatus === "not_found") {
    return {
      label: formatDeployStatus(job) || "Deploy needs attention",
      detail: job.deployFailureReason || "The deploy workflow did not finish cleanly.",
      percent: 100,
      estimate: "Stopped",
      tone: "bad" as const,
      phases: deployProgressPhases,
      currentLabel: formatDeployStatus(job) || "Deploy needs attention",
    };
  }

  if (job.deployStatus === "success") {
    return {
      label: "Live",
      detail: "The revision was published and the Cloudflare deploy completed.",
      percent: 100,
      estimate: "Complete",
      tone: "good" as const,
      phases: deployProgressPhases,
      currentLabel: "Live",
    };
  }

  if (job.status === "published") {
    const phase = job.deployStatus === "in_progress"
      ? deployProgressPhases[2]
      : job.deployStatus === "queued"
      ? deployProgressPhases[1]
      : getPhaseForElapsed(deployProgressPhases, deployElapsed);

    return {
      label: formatDeployStatus(job) || phase.label,
      detail: phase.detail,
      percent: clamp(60 + (deployElapsed / 6) * 40, 62, 96),
      estimate: formatWaitTime(6, deployElapsed),
      tone: "working" as const,
      phases: deployProgressPhases,
      currentLabel: phase.label,
    };
  }

  if (job.status === "ready_for_review") {
    return {
      label: "Ready to publish",
      detail: "The draft passed its checks. Review it, then use Publish Mission to send it live.",
      percent: 100,
      estimate: "Waiting to publish",
      tone: "good" as const,
      phases: revisionProgressPhases,
      currentLabel: "Ready to publish",
    };
  }

  const statusPhase = job.status === "checking"
    ? revisionProgressPhases[3]
    : job.status === "drafting" || job.status === "working"
      ? revisionProgressPhases[2]
      : null;
  if (statusPhase) {
    return {
      label: statusPhase.label,
      detail: statusPhase.detail,
      percent: job.status === "checking" ? 72 : 44,
      estimate: job.status === "checking" ? "Checking" : "Drafting",
      tone: "working" as const,
      phases: revisionProgressPhases,
      currentLabel: statusPhase.label,
    };
  }

  const phase = job.status === "queued" ? revisionProgressPhases[0] : getPhaseForElapsed(revisionProgressPhases, revisionElapsed);
  const queue = missionQueuePresentation(job);

  return {
    label: job.status === "queued" ? queue.label : phase.label,
    detail: job.status === "queued" ? queue.detail : phase.detail,
    percent: clamp((revisionElapsed / 10) * 92, job.status === "queued" ? 8 : 18, 94),
    estimate: formatWaitTime(10, revisionElapsed),
    tone: "working" as const,
    phases: revisionProgressPhases,
    currentLabel: phase.label,
  };
}

export function ReggieProgress({ job, now, compact = false }: { job: ReggieProgressJob; now?: number; compact?: boolean }) {
  const fallbackNow = new Date(job.deployUpdatedAt || job.deployCreatedAt || job.updatedAt || job.createdAt || "").getTime();
  const progress = getReggieProgress(job, now ?? (Number.isFinite(fallbackNow) ? fallbackNow : 0));

  return (
    <div className={`${styles.reggieProgress} ${compact ? styles.reggieProgressCompact : ""}`} data-tone={progress.tone}>
      <div className={styles.progressHeader}>
        <div>
          <p className={styles.progressLabel}>{progress.label}</p>
          <p className={styles.progressDetail}>{progress.detail}</p>
        </div>
        <span className={styles.progressEstimate}>{progress.estimate}</span>
      </div>
      <div className={styles.progressTrack} aria-label={`${Math.round(progress.percent)} percent`}>
        <span className={styles.progressFill} style={{ width: `${progress.percent}%` }} />
      </div>
      {!compact ? (
        <ol className={styles.progressSteps}>
          {progress.phases.map((phase) => (
            <li className={phase.label === progress.currentLabel ? styles.progressStepActive : ""} key={phase.label}>
              {phase.label}
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
