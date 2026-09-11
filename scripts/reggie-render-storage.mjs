import fs from "node:fs";
import path from "node:path";

const STORAGE_KEYS = ["REGGIE_STORAGE_DIR", "BLOG_STORAGE_DIR"];

export function inspectRenderPersistentStorage(rootValue) {
  const root = path.resolve(rootValue);
  const configPath = ["render.yaml", "render.yml"]
    .map((name) => path.join(root, name))
    .find((candidate) => fs.existsSync(candidate));
  if (!configPath) {
    return failure("Render Blueprint is missing. Add render.yaml with the managed web service, persistent disk, and REGGIE_STORAGE_DIR or BLOG_STORAGE_DIR.");
  }
  return { ...inspectRenderBlueprint(fs.readFileSync(configPath, "utf8")), configPath };
}

export function inspectRenderBlueprint(sourceValue) {
  const services = parseServices(String(sourceValue ?? ""));
  const webServices = services.filter((service) => service.type === "web");
  if (!webServices.length) {
    return failure("No Render web service was found in the Blueprint.");
  }
  if (webServices.length !== 1) {
    return failure("The Render Blueprint has multiple web services, so Reggie cannot prove which disk belongs to this install. Use a Blueprint with one managed web service before connecting.");
  }

  const configuredServices = webServices.filter((service) => STORAGE_KEYS.some((key) => service.env.has(key)));
  if (!configuredServices.length) {
    return failure("The Render web service must set REGGIE_STORAGE_DIR or BLOG_STORAGE_DIR to an absolute path on its persistent disk.");
  }

  const reports = configuredServices.map(validateServiceStorage);
  const valid = reports.find((report) => report.ok);
  if (valid) return valid;
  return failure(Array.from(new Set(reports.flatMap((report) => report.issues))).join(" "));
}

export function validateRenderLiveStorageReport(value, expectedSiteId) {
  const report = value && typeof value === "object" ? value : null;
  const storage = report?.storage && typeof report.storage === "object" ? report.storage : null;
  if (report?.configured !== true || report?.connected !== true) {
    return failure("The live adapter does not have a connected Reggie store.");
  }
  if (!expectedSiteId || report.siteId !== expectedSiteId) {
    return failure("The live adapter does not match the expected site connection.");
  }
  if (storage?.persistent !== true || storage?.provider !== "filesystem") {
    return failure("The live adapter did not prove configured persistent filesystem storage.");
  }
  return { ok: true, issues: [], serviceName: "", storageKey: "", storagePath: "", mountPath: "" };
}

function validateServiceStorage(service) {
  const label = service.name ? `Render service ${service.name}` : "The Render web service";
  const reggieValues = service.env.get("REGGIE_STORAGE_DIR") ?? [];
  const blogValues = service.env.get("BLOG_STORAGE_DIR") ?? [];
  const selectedKey = reggieValues.length ? "REGGIE_STORAGE_DIR" : "BLOG_STORAGE_DIR";
  const selectedValues = reggieValues.length ? reggieValues : blogValues;
  if (selectedValues.length !== 1) {
    return failure(`${label} has an ambiguous ${selectedKey} declaration. Declare it exactly once with a literal absolute path.`);
  }

  const storagePath = normalizeAbsolutePath(selectedValues[0]);
  if (!storagePath) {
    return failure(`${label} must give ${selectedKey} a literal absolute path; secret groups and relative or interpolated paths cannot prove persistence.`);
  }
  if (!service.mountPaths.length) {
    return failure(`${label} sets ${selectedKey}, but it has no persistent disk mountPath in render.yaml.`);
  }

  const mountPaths = service.mountPaths.map(normalizeAbsolutePath).filter(Boolean);
  if (!mountPaths.length) {
    return failure(`${label} has no literal absolute persistent disk mountPath.`);
  }
  const mountPath = mountPaths.find((candidate) => isSameOrDescendant(storagePath, candidate));
  if (!mountPath) {
    return failure(`${label} points ${selectedKey} outside its persistent disk. The configured storage path must equal or be below disk.mountPath.`);
  }
  return {
    ok: true,
    issues: [],
    serviceName: service.name,
    storageKey: selectedKey,
    storagePath,
    mountPath,
  };
}

function parseServices(source) {
  const lines = source.split(/\r?\n/).map((raw, index) => ({
    index,
    indent: raw.match(/^ */)?.[0].length ?? 0,
    content: stripComment(raw).trim(),
  })).filter((line) => line.content);
  const servicesLine = lines.find((line) => line.content === "services:");
  if (!servicesLine) return [];
  const serviceStarts = lines.filter((line) => line.index > servicesLine.index && line.indent > servicesLine.indent && line.content.startsWith("- "));
  if (!serviceStarts.length) return [];
  const serviceIndent = Math.min(...serviceStarts.map((line) => line.indent));
  const starts = serviceStarts.filter((line) => line.indent === serviceIndent);
  return starts.map((start, index) => {
    const next = starts[index + 1];
    const block = lines.filter((line) => line.index >= start.index && (!next || line.index < next.index));
    return parseService(block, serviceIndent);
  });
}

function parseService(lines, serviceIndent) {
  const service = { type: "", name: "", env: new Map(), mountPaths: [] };
  for (const line of lines) {
    const content = line.content.replace(/^-\s+/, "");
    if (!service.type && /^type\s*:/.test(content)) service.type = scalar(content.slice(content.indexOf(":") + 1));
    if (!service.name && /^name\s*:/.test(content)) service.name = scalar(content.slice(content.indexOf(":") + 1));
  }

  const diskIndexes = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line.indent > serviceIndent && line.content === "disk:");
  for (const { line: diskLine, index } of diskIndexes) {
    const block = nestedBlock(lines, index, diskLine.indent);
    const mount = block.find((entry) => /^mountPath\s*:/.test(entry.content));
    if (mount) service.mountPaths.push(scalar(mount.content.slice(mount.content.indexOf(":") + 1)));
  }

  const envIndex = lines.findIndex((line) => line.indent > serviceIndent && line.content === "envVars:");
  if (envIndex >= 0) {
    const envBlock = nestedBlock(lines, envIndex, lines[envIndex].indent);
    const itemIndent = envBlock.filter((line) => line.content.startsWith("- ")).reduce((minimum, line) => Math.min(minimum, line.indent), Number.POSITIVE_INFINITY);
    if (Number.isFinite(itemIndent)) {
      const starts = envBlock.map((line, index) => ({ line, index })).filter(({ line }) => line.indent === itemIndent && line.content.startsWith("- "));
      for (let index = 0; index < starts.length; index += 1) {
        const start = starts[index];
        const next = starts[index + 1];
        const item = envBlock.slice(start.index, next?.index ?? envBlock.length);
        const keyLine = item.find((line) => /^-\s+key\s*:/.test(line.content));
        if (!keyLine) continue;
        const key = scalar(keyLine.content.slice(keyLine.content.indexOf(":") + 1));
        if (!STORAGE_KEYS.includes(key)) continue;
        const valueLine = item.find((line) => /^value\s*:/.test(line.content));
        const values = service.env.get(key) ?? [];
        values.push(valueLine ? scalar(valueLine.content.slice(valueLine.content.indexOf(":") + 1)) : "");
        service.env.set(key, values);
      }
    }
  }
  return service;
}

function nestedBlock(lines, index, indent) {
  const block = [];
  for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
    if (lines[cursor].indent <= indent) break;
    block.push(lines[cursor]);
  }
  return block;
}

function stripComment(raw) {
  let quote = "";
  for (let index = 0; index < raw.length; index += 1) {
    const character = raw[index];
    if (quote) {
      if (character === quote && raw[index - 1] !== "\\") quote = "";
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === "#" && (index === 0 || /\s/.test(raw[index - 1]))) return raw.slice(0, index);
  }
  return raw;
}

function scalar(value) {
  const trimmed = value.trim();
  const quoted = trimmed.match(/^(["'])([\s\S]*)\1$/);
  return (quoted ? quoted[2] : trimmed).trim();
}

function normalizeAbsolutePath(value) {
  const candidate = scalar(String(value ?? ""));
  if (!candidate.startsWith("/") || candidate.includes("${") || candidate.includes("{{")) return "";
  const normalized = path.posix.normalize(candidate);
  if (!normalized.startsWith("/") || normalized === "/") return "";
  return normalized.replace(/\/+$/, "");
}

function isSameOrDescendant(candidate, parent) {
  return candidate === parent || candidate.startsWith(`${parent}/`);
}

function failure(message) {
  return { ok: false, issues: [message], serviceName: "", storageKey: "", storagePath: "", mountPath: "" };
}
