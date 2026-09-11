export class LensInfrastructureFailure extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "LensInfrastructureFailure";
    this.failureClass = "infrastructure";
  }
}

export function classifyLensFailure(error) {
  return error?.failureClass === "infrastructure" ? "infrastructure" : "functional";
}

export async function runLensCheckWithClassification(fn, { infrastructureAttempts = 2, functionalAttempts = 2, onFailure = () => {} } = {}) {
  let infrastructureFailures = 0;
  let functionalFailures = 0;
  const failures = [];
  while (infrastructureFailures < infrastructureAttempts && functionalFailures < functionalAttempts) {
    try {
      return { ok: true, value: await fn(), infrastructureFailures, functionalFailures, failures };
    } catch (error) {
      const failureClass = classifyLensFailure(error);
      const detail = error instanceof Error ? error.stack ?? error.message : String(error);
      failures.push({ failureClass, detail });
      onFailure({ failureClass, detail, attempt: failures.length });
      if (failureClass === "infrastructure") infrastructureFailures += 1;
      else functionalFailures += 1;
    }
  }
  return { ok: false, infrastructureFailures, functionalFailures, failures };
}
