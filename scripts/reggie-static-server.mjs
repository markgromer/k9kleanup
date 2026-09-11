#!/usr/bin/env node

import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";

const port = Number(argument("--port") || process.env.PORT || 3101);
const root = path.resolve(argument("--directory") || "out");
const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);

http.createServer(async (request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") return send(response, 405, "Method Not Allowed");
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url || "/", "http://127.0.0.1").pathname); }
  catch { return send(response, 400, "Bad Request"); }
  const relative = pathname.replace(/^\/+/, "");
  if (relative.split("/").includes("..")) return send(response, 403, "Forbidden");
  const base = path.resolve(root, relative);
  if (base !== root && !base.startsWith(`${root}${path.sep}`)) return send(response, 403, "Forbidden");
  const candidates = relative
    ? [base, `${base}.html`, path.join(base, "index.html")]
    : [path.join(root, "index.html")];
  for (const candidate of candidates) {
    try {
      const stat = await fs.stat(candidate);
      if (!stat.isFile()) continue;
      const body = request.method === "HEAD" ? undefined : await fs.readFile(candidate);
      response.writeHead(200, { "Content-Type": mimeTypes.get(path.extname(candidate).toLowerCase()) || "application/octet-stream", "Cache-Control": "no-store" });
      return response.end(body);
    } catch (error) {
      if (error?.code !== "ENOENT" && error?.code !== "ENOTDIR") return send(response, 500, "Internal Server Error");
    }
  }
  return send(response, 404, "Not Found");
}).listen(port, "127.0.0.1", () => console.log(`Reggie static QA server: http://127.0.0.1:${port}`));

function argument(name) { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] || "" : ""; }
function send(response, status, message) { response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }); response.end(message); }
