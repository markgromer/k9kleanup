const effectSetState = "EffectSetState: Calling setState synchronously within an effect can trigger cascading renders";
const managedDebt = (managedPath, ruleId, message, locations) =>
  locations.map(([line, column, baselineLine = line, baselineColumn = column]) => ({ managedPath, ruleId, message, line, column, baselineLine, baselineColumn }));

export const knownManagedDebt = [
  ...managedDebt("components/admin-shell/AdminShell.tsx", "react(react-compiler)", effectSetState, [[156, 16, 162, 16]]),
  ...managedDebt("components/admin-shell/AdminShell.tsx", "jsx-a11y(prefer-tag-over-role)", "Prefer `output` over `role` attribute `status`.", [[278, 69, 284, 69]]),
  ...managedDebt("components/admin-shell/AdminShell.tsx", "jsx-a11y(prefer-tag-over-role)", "Prefer `dialog` over `role` attribute `dialog`.", [[344, 51, 350, 51]]),
  ...managedDebt("components/reggie-mission-queue/ReggieMissionQueue.tsx", "react(react-compiler)", effectSetState, [[177, 5], [192, 43], [304, 5], [732, 5]]),
  ...managedDebt("components/reggie-mission-queue/ReggieMissionQueue.tsx", "react(react-compiler)", "MemoDependencies: Found extra memoization dependencies", [[160, 7]]),
  ...managedDebt("components/reggie-mission-queue/ReggieMissionQueue.tsx", "jsx-a11y(prefer-tag-over-role)", "Prefer `dialog` over `role` attribute `dialog`.", [[604, 46]]),
  ...managedDebt("components/reggie-mission-queue/ReggieMissionQueue.tsx", "jsx-a11y(prefer-tag-over-role)", "Prefer `output` over `role` attribute `status`.", [[707, 68], [774, 49], [786, 54]]),
  ...managedDebt("components/reggie-lens/ReggieLensWorkspace.tsx", "react(react-compiler)", effectSetState, [[440, 9], [456, 7], [540, 12], [606, 142], [630, 98], [653, 12], [724, 5]]),
  ...managedDebt("components/reggie-lens/ReggieLensWorkspace.tsx", "react(react-compiler)", "Immutability: This value cannot be modified", [[1021, 5]]),
  ...managedDebt("components/reggie-lens/ReggieLensWorkspace.tsx", "next(no-html-link-for-pages)", "Do not use `<a>` elements to navigate between Next.js pages.", [[1756, 11]]),
  ...managedDebt("components/reggie-lens/ReggieLensWorkspace.tsx", "jsx-a11y(control-has-associated-label)", "A control must be associated with a text label.", [[2086, 23]]),
  ...managedDebt("components/reggie-lens/ReggieLensWorkspace.tsx", "jsx-a11y(prefer-tag-over-role)", "Prefer `section` over `role` attribute `region`.", [[2343, 44]]),
  ...managedDebt("components/reggie-lens/ReggieLensWorkspace.tsx", "jsx-a11y(prefer-tag-over-role)", "Prefer `dialog` over `role` attribute `dialog`.", [[2478, 69]]),
];

export function isKnownManagedDebt(diagnostic) {
  return knownManagedDebt.some((allowance) =>
    (diagnostic.path === allowance.managedPath || diagnostic.path === `${allowance.managedPath}`)
    && diagnostic.ruleId === allowance.ruleId
    && diagnostic.message === allowance.message
    && Number(diagnostic.line || 0) === allowance.line
    && Number(diagnostic.column || 0) === allowance.column);
}

export function countTrustedManagedBaseline(baseline, candidate) {
  const allowance = knownManagedDebt.find((entry) =>
    (candidate.path === entry.managedPath || candidate.path === `${entry.managedPath}`)
    && candidate.ruleId === entry.ruleId
    && candidate.message === entry.message
    && Number(candidate.line || 0) === entry.line
    && Number(candidate.column || 0) === entry.column);
  if (!allowance) return 0;
  return baseline.filter((diagnostic) =>
    diagnostic.path === candidate.path
    && diagnostic.ruleId === allowance.ruleId
    && diagnostic.message === allowance.message
    && Number(diagnostic.line || 0) === allowance.baselineLine
    && Number(diagnostic.column || 0) === allowance.baselineColumn).length;
}
