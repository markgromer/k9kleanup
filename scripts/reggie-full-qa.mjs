#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const baseUrl = getOption("--base-url") || process.env.REGGIE_QA_BASE_URL || "";
const recoveryPasswordPath = path.resolve(".reggie", "admin-password");
const password = getOption("--password") || process.env.REGGIE_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || (fs.existsSync(recoveryPasswordPath) ? fs.readFileSync(recoveryPasswordPath, "utf8").trim() : "");
const outDir = path.resolve(getOption("--out-dir") || "tmp-reggie-full-qa");
const runBrowser = args.includes("--browser") || process.env.REGGIE_BROWSER_QA === "1";
fs.mkdirSync(outDir, { recursive: true });

const checks = [
  run("doctor", ["scripts/reggie-doctor.mjs"]),
  run("workflow", ["scripts/reggie-workflow-qa.mjs"]),
  baseUrl
    ? run("api", ["scripts/reggie-api-qa.mjs", "--base-url", baseUrl, "--out-dir", path.join(outDir, "api")], { REGGIE_ADMIN_PASSWORD: password })
    : { name: "api", ok: true, skipped: "No --base-url or REGGIE_QA_BASE_URL supplied; live API check was not run." },
  baseUrl && runBrowser
    ? run("lens-browser", ["scripts/reggie-lens-browser-qa.mjs", "--base-url", baseUrl, "--out-dir", path.join(outDir, "lens-browser")], { REGGIE_ADMIN_PASSWORD: password })
    : { name: "lens-browser", ok: true, skipped: runBrowser ? "No base URL supplied; browser QA was not run." : "Pass --browser or set REGGIE_BROWSER_QA=1 to run Lens browser QA." },
];
const result = { baseUrl, checks };
fs.writeFileSync(path.join(outDir, "results.json"), `${JSON.stringify(result, null, 2)}\n`);
if (checks.some((check) => !check.ok)) {
  console.error(JSON.stringify(result, null, 2));
  process.exit(1);
}
console.log(JSON.stringify(result, null, 2));

function run(name, commandArgs, extraEnv = {}) {
  const result = spawnSync(process.execPath, commandArgs, { cwd: process.cwd(), encoding: "utf8", env: { ...process.env, ...extraEnv } });
  const logPath = path.join(outDir, `${name}.log`);
  fs.writeFileSync(logPath, `${result.stdout ?? ""}\n${result.stderr ?? ""}`);
  return { name, ok: result.status === 0, status: result.status, logPath };
}

function getOption(name) {
  const index = args.indexOf(name);
  return index === -1 || !args[index + 1] || args[index + 1].startsWith("-") ? "" : args[index + 1];
}
