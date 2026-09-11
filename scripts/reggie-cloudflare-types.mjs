#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const command = process.argv[2] || "check";
if (!new Set(["sync", "check"]).has(command)) {
  console.error("Usage: node scripts/reggie-cloudflare-types.mjs <sync|check>");
  process.exit(2);
}

const root = process.cwd();
const packagePath = path.join(root, "package.json");
if (!fs.existsSync(packagePath)) {
  console.error("Run Cloudflare type generation from the website repository root.");
  process.exit(1);
}

const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
const usesVinext = Boolean(packageJson.dependencies?.vinext || packageJson.devDependencies?.vinext);
if (!usesVinext) {
  console.error("Cloudflare type generation is only managed for Vinext Worker sites.");
  process.exit(1);
}

const configPath = ["wrangler.jsonc", "wrangler.json", "wrangler.toml"]
  .map((name) => path.join(root, name))
  .find((candidate) => fs.existsSync(candidate));
if (!configPath) {
  console.error("No root Wrangler configuration was found for this Vinext Worker site.");
  process.exit(1);
}

const sourceRoot = fs.existsSync(path.join(root, "src", "app")) ? "src" : "";
const outputRelative = path.posix.join(sourceRoot || ".", "types", "worker-configuration.d.ts").replace(/^\.\//, "");
const outputPath = path.join(root, ...outputRelative.split("/"));
const wranglerBin = process.env.REGGIE_WRANGLER_BIN
  ? path.resolve(process.env.REGGIE_WRANGLER_BIN)
  : path.join(root, "node_modules", "wrangler", "bin", "wrangler.js");
if (!fs.existsSync(wranglerBin)) {
  console.error("Wrangler is not installed. Run npm install before generating Cloudflare types.");
  process.exit(1);
}

if (command === "sync") fs.mkdirSync(path.dirname(outputPath), { recursive: true });
const args = [wranglerBin, "types", outputRelative, "--config", path.basename(configPath)];
if (command === "check") args.push("--check");
const result = spawnSync(process.execPath, args, {
  cwd: root,
  env: {
    ...process.env,
    WRANGLER_SEND_METRICS: process.env.WRANGLER_SEND_METRICS ?? "false",
    WRANGLER_WRITE_LOGS: process.env.WRANGLER_WRITE_LOGS ?? "false",
  },
  stdio: "inherit",
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);

console.log(`${command === "sync" ? "Generated" : "Verified"} ${outputRelative} from ${path.basename(configPath)}.`);
