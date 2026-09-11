#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const outputIndex = process.argv.indexOf("--output");
if (outputIndex >= 0 && (!process.argv[outputIndex + 1] || process.argv[outputIndex + 1].startsWith("--"))) {
  throw new Error("--output requires a value.");
}
const artifact = path.resolve(outputIndex >= 0 ? process.argv[outputIndex + 1] : "tmp-reggie-lint/current.json");
const deferErrors = process.argv.includes("--defer-errors");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const lintScript = String(packageJson.scripts?.lint || "").trim();
fs.mkdirSync(path.dirname(artifact), { recursive: true });

if (!lintScript || /^next\s+lint(?:\s|$)/.test(lintScript)) {
  const result = { ok: true, skipped: true, reason: lintScript ? "legacy_next_lint" : "no_lint_script", overrides: [], diagnostics: [] };
  fs.writeFileSync(artifact, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result));
  process.exit(0);
}

const requireFromClient = createRequire(path.join(root, "package.json"));
let plugin;
try { plugin = requireFromClient("eslint-plugin-react-hooks"); } catch { plugin = null; }
const availableRules = plugin?.rules && typeof plugin.rules === "object" ? plugin.rules : {};
const overrides = ["set-state-in-effect", "immutability"]
  .filter((rule) => Object.prototype.hasOwnProperty.call(availableRules, rule))
  .map((rule) => `react-hooks/${rule}:off`);
const eslintOutput = `${artifact}.eslint.json`;
const usesOxlint = /(?:^|\s)oxlint(?:\s|$)/.test(lintScript);
const args = usesOxlint
  ? ["run", "lint", "--", "--format", "json"]
  : ["run", "lint", "--", "--format", "json", "--output-file", eslintOutput,
    "--ignore-pattern", "public/_assets/**", "--ignore-pattern", ".reggie/backups/**"];
if (!usesOxlint) for (const rule of overrides) args.push("--rule", rule);
const execution = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", args, {
  cwd: root, encoding: "utf8", shell: process.platform === "win32", stdio: ["ignore", "pipe", "pipe"],
});
let reports = [];
let oxlintDiagnostics = [];
if (fs.existsSync(eslintOutput)) {
  reports = JSON.parse(fs.readFileSync(eslintOutput, "utf8"));
  fs.rmSync(eslintOutput, { force: true });
} else if (usesOxlint) {
  const output = String(execution.stdout || "").trim();
  const jsonStart = output.indexOf("{");
  if (jsonStart >= 0) {
    const payload = JSON.parse(output.slice(jsonStart));
    oxlintDiagnostics = Array.isArray(payload.diagnostics) ? payload.diagnostics : [];
  }
}
const diagnostics = usesOxlint
  ? oxlintDiagnostics
    .filter((diagnostic) => String(diagnostic.severity).toLowerCase() === "error")
    .map((diagnostic) => ({
      path: String(diagnostic.filename || "").replaceAll("\\", "/"),
      ruleId: String(diagnostic.code || "oxlint/unknown"),
      message: String(diagnostic.message || "").replace(/\s+/g, " ").trim(),
    }))
  : reports.flatMap((report) => (report.messages || [])
  .filter((message) => Number(message.severity) === 2)
  .map((message) => ({
    path: path.relative(root, path.resolve(report.filePath || "")).split(path.sep).join("/").replace(/^\.\//, ""),
    ruleId: String(message.ruleId || "eslint/unknown"),
    message: String(message.message || "").replace(/\s+/g, " ").trim(),
  })));
const result = { ok: execution.status === 0, skipped: false, exitCode: execution.status ?? 1, overrides, diagnostics,
  stderr: [execution.stderr, diagnostics.length === 0 ? execution.stdout : ""].filter(Boolean).join("\n").trim() };
fs.writeFileSync(artifact, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result));
// Existing lint errors are evaluated against the exact base. A configuration
// failure produces no diagnostics and must fail immediately.
if (!result.ok && (!deferErrors || result.exitCode >= 2 || diagnostics.length === 0)) process.exit(1);
