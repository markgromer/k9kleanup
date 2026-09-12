#!/usr/bin/env node

import fs from "node:fs";
import { countTrustedManagedBaseline } from "./reggie-lint-managed-debt.mjs";

const option = (name) => {
  const index = process.argv.indexOf(name);
  if (index < 0) throw new Error(`${name} is required.`);
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value.`);
  return value;
};
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const baselineReport = read(option("--baseline"));
const candidateReport = read(option("--candidate"));
const baseline = baselineReport.diagnostics || [];
const candidate = candidateReport.diagnostics || [];
const changedFiles = new Set(fs.readFileSync(option("--changed-files"), "utf8").split(/\r?\n/).filter(Boolean).map((file) => file.replaceAll("\\", "/").replace(/^\.\//, "")));
const fingerprint = (diagnostic) => [diagnostic.path, diagnostic.ruleId, diagnostic.message, Number(diagnostic.line || 0), Number(diagnostic.column || 0)].join("\u0000");
const toMultiset = (diagnostics) => {
  const result = new Map();
  for (const diagnostic of diagnostics) {
    const key = fingerprint(diagnostic);
    const entry = result.get(key) || { diagnostic, count: 0 };
    entry.count += 1;
    result.set(key, entry);
  }
  return result;
};
const baselineSet = toMultiset(baseline);
const candidateSet = toMultiset(candidate);
const admitted = [];
const blockers = [];
if (baselineReport.skipped !== true && baselineReport.lintReportParsed !== true) blockers.push({ artifact: "baseline", reason: "unparsed_lint_report" });
if (candidateReport.skipped !== true && candidateReport.lintReportParsed !== true) blockers.push({ artifact: "candidate", reason: "unparsed_lint_report" });
for (const [key, entry] of candidateSet) {
  const baselineCount = baselineSet.get(key)?.count || 0;
  const trustedManagedCount = countTrustedManagedBaseline(baseline, entry.diagnostic);
  if (trustedManagedCount > 0) {
    if (entry.count > trustedManagedCount) blockers.push({ ...entry.diagnostic, count: entry.count - trustedManagedCount, reason: "new_or_increased_error" });
    else admitted.push({ ...entry.diagnostic, count: entry.count, reason: "exact_known_managed_baseline" });
  }
  else if (entry.count > baselineCount) blockers.push({ ...entry.diagnostic, count: entry.count - baselineCount, reason: "new_or_increased_error" });
  else if (changedFiles.has(entry.diagnostic.path) && entry.count >= baselineCount) {
    blockers.push({ ...entry.diagnostic, count: entry.count, reason: "baseline_error_in_reggie_modified_file" });
  }
  else admitted.push({ ...entry.diagnostic, count: entry.count, reason: changedFiles.has(entry.diagnostic.path) ? "exact_error_reduced" : "unchanged_customer_baseline" });
}
const serialize = (set) => [...set.values()].map(({ diagnostic, count }) => ({ ...diagnostic, count }));
const result = { ok: blockers.length === 0, baseline: serialize(baselineSet), candidate: serialize(candidateSet), admitted, blockers };
fs.writeFileSync(option("--output"), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result));
if (!result.ok) process.exit(1);
