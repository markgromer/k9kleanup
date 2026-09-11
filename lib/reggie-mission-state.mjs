export function missionQueuePresentation(job) {
  const queue = job.queue;
  if (queue?.state === "running" || job.dispatchStatus === "claimed") {
    return { state: "running", label: "Runner active", detail: "Reggie has claimed this mission and is working on it now." };
  }
  if (queue?.state === "dispatching" || ["reserved", "accepted"].includes(job.dispatchStatus || "")) {
    return { state: "dispatching", label: "Runner reserved", detail: "A runner slot is reserved and the mission is starting." };
  }
  if (queue?.state === "waiting" || ["pending", "retry_pending"].includes(job.dispatchStatus || "") || job.status === "queued") {
    const position = positiveInteger(queue?.position);
    const total = positiveInteger(queue?.total);
    const positionText = position ? `Position ${position}${total ? ` of ${total}` : ""}` : "Position is being calculated";
    return {
      state: "waiting",
      label: job.dispatchStatus === "retry_pending" ? "Retry waiting for a runner" : "Waiting for a runner",
      detail: `${positionText}. The request is saved and will start automatically when a runner is available.`,
    };
  }
  return { state: "complete", label: "Queue complete", detail: "This mission is no longer waiting for a runner." };
}

export function missionEvidencePresentation(job) {
  const screenshots = Array.isArray(job.reviewScreenshots) ? job.reviewScreenshots.length : 0;
  const reported = ["pending", "available", "partial", "unavailable"].includes(job.evidenceStatus || "")
    ? job.evidenceStatus
    : screenshots > 0
      ? "available"
      : ["queued", "working", "drafting", "checking"].includes(job.status || "")
        ? "pending"
        : "unavailable";
  const error = String(job.evidenceError || "").trim();

  if (reported === "pending") {
    return { state: "pending", title: "Screenshot evidence pending", detail: "Screenshots are captured after the draft and production checks are ready.", tone: "working" };
  }
  if (reported === "available" && screenshots > 0) {
    return { state: "available", title: "Screenshot evidence available", detail: `${screenshots} review ${screenshots === 1 ? "capture is" : "captures are"} ready.`, tone: "good" };
  }
  if (reported === "partial" && screenshots > 0) {
    return { state: "partial", title: "Partial screenshot evidence", detail: error || "Some review captures are ready, but at least one optional capture could not be produced.", tone: "warning" };
  }
  return {
    state: "unavailable",
    title: reported === "available" || reported === "partial" ? "Screenshot files could not be loaded" : "Screenshot evidence unavailable",
    detail: error || "The preview capture was unavailable. Review the pull request and mission run instead. This never blocks a safe review or publish.",
    tone: "warning",
  };
}

export function missionRetryAction(job) {
  if (job.status === "ready_for_review" && job.clientChecksStatus !== "succeeded") {
    return { kind: "revalidate", label: "Revalidate Checks", message: "Reggie will rerun the current production gates without drafting the change again." };
  }
  if (["failed", "needs_attention"].includes(job.status || "")) {
    const attempt = nonnegativeInteger(job.attemptNumber);
    const maximum = positiveInteger(job.maxAttempts) || 3;
    if (attempt < maximum) return { kind: "retry", label: "Retry Mission", message: `Retry ${attempt + 1} of ${maximum} will return this mission to the runner queue.` };
    return { kind: null, label: "Automatic retries used", message: "This mission used all automatic attempts. Request a follow-up mission with adjusted instructions or contact support." };
  }
  return { kind: null, label: "", message: "" };
}

export function cacheBustReviewAssetUrl(url, attempt, nonce = Date.now()) {
  const [withoutFragment, fragment = ""] = String(url || "").split("#", 2);
  const separator = withoutFragment.includes("?") ? "&" : "?";
  const next = `${withoutFragment}${separator}reggieAssetAttempt=${Math.max(0, Math.floor(attempt))}-${Math.max(0, Math.floor(nonce))}`;
  return fragment ? `${next}#${fragment}` : next;
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : 0;
}

function nonnegativeInteger(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : 0;
}
