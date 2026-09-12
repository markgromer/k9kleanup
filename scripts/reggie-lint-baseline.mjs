#!/usr/bin/env node

import fs from "node:fs";

const option = (name) => {
  const index = process.argv.indexOf(name);
  if (index < 0) throw new Error(`${name} is required.`);
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value.`);
  return value;
};
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const baseline = read(option("--baseline")).diagnostics || [];
const candidate = read(option("--candidate")).diagnostics || [];
const changedFiles = new Set(fs.readFileSync(option("--changed-files"), "utf8").split(/\r?\n/).filter(Boolean).map((file) => file.replaceAll("\\", "/").replace(/^\.\//, "")));
const fingerprint = (diagnostic) => [diagnostic.path, diagnostic.ruleId, diagnostic.message].join("\u0000");
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
for (const [key, entry] of candidateSet) {
  const baselineCount = baselineSet.get(key)?.count || 0;
  if (entry.count > baselineCount) blockers.push({ ...entry.diagnostic, count: entry.count - baselineCount, reason: "new_or_increased_error" });
  else admitted.push({ ...entry.diagnostic, count: entry.count, reason: changedFiles.has(entry.diagnostic.path) ? "unchanged_or_reduced_changed_file_baseline" : "unchanged_customer_baseline" });
}
const serialize = (set) => [...set.values()].map(({ diagnostic, count }) => ({ ...diagnostic, count }));
const result = { ok: blockers.length === 0, baseline: serialize(baselineSet), candidate: serialize(candidateSet), admitted, blockers };
fs.writeFileSync(option("--output"), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result));
if (!result.ok) process.exit(1);
