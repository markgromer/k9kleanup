export type ReggieMissionQueueState = {
  state: "waiting" | "dispatching" | "running" | "complete";
  position: number | null;
  total: number;
};

export type ReggieMissionEvidenceStatus = "pending" | "available" | "partial" | "unavailable";

export type ReggieMissionStateInput = {
  status?: string;
  queue?: ReggieMissionQueueState;
  dispatchStatus?: string;
  evidenceStatus?: ReggieMissionEvidenceStatus | string;
  evidenceError?: string;
  reviewScreenshots?: unknown[];
  clientChecksStatus?: string;
  attemptNumber?: number;
  maxAttempts?: number;
};

export function missionQueuePresentation(job: ReggieMissionStateInput): { state: ReggieMissionQueueState["state"]; label: string; detail: string };
export function missionEvidencePresentation(job: ReggieMissionStateInput): { state: ReggieMissionEvidenceStatus; title: string; detail: string; tone: "working" | "good" | "warning" };
export function missionRetryAction(job: ReggieMissionStateInput): { kind: "retry" | "revalidate" | null; label: string; message: string };
export function cacheBustReviewAssetUrl(url: string, attempt: number, nonce?: number): string;
