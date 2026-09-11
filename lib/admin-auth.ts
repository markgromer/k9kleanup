import { NextRequest, NextResponse } from "next/server";
import { env as workerEnv } from "cloudflare:workers";
import { getReggieConnection } from "@/lib/reggie-connection";
import { hashOwnerPassword, loginAttemptAllowed, resetAttemptAllowed, sessionSigningDigest, sessionTtlSeconds, verifyOwnerPassword } from "@/lib/admin-password-kdf";

const ADMIN_AUTH_TABLE = "reggie_admin_auth";
const ADMIN_AUTH_EVENTS_TABLE = "reggie_admin_auth_events";
const ADMIN_AUTH_RATE_LIMITS_TABLE = "reggie_admin_auth_rate_limits";
const ADMIN_PASSWORD_KEY = "owner";
export const ADMIN_SESSION_COOKIE = "reggie_admin_session";

type AdminRole = "owner" | "support";

type AdminAuthDatabase = {
  prepare(query: string): {
    first<T = Record<string, unknown>>(): Promise<T | null>;
    run(): Promise<unknown>;
    bind(...values: unknown[]): {
      first<T = Record<string, unknown>>(): Promise<T | null>;
      run(): Promise<unknown>;
    };
  };
};

function constantTimeMatch(left: string, right: string) {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  const length = Math.max(leftBytes.length, rightBytes.length);
  let difference = leftBytes.length ^ rightBytes.length;

  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }

  return difference === 0;
}

function bearer(req: NextRequest) {
  const authorization = req.headers.get("authorization") ?? "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
}

function cookie(req: NextRequest, name: string) {
  const cookieHeader = req.headers.get("cookie") ?? "";
  const prefix = `${name}=`;
  for (const part of cookieHeader.split(";")) {
    const value = part.trim();
    if (value.startsWith(prefix)) return decodeURIComponent(value.slice(prefix.length));
  }
  return "";
}

async function getRuntimeEnv() {
  try {
    return workerEnv;
  } catch {
    // Local development and non-Worker tests use process.env.
    return process.env;
  }
}

function runtimeEnvValue(env: object, key: string) {
  return Reflect.get(env, key);
}

async function configuredPassword(...keys: string[]) {
  const env = await getRuntimeEnv();
  for (const key of keys) {
    const value = String(runtimeEnvValue(env, key) ?? process.env[key] ?? "").trim();
    if (value) return value;
  }
  return "";
}

async function getAdminAuthDatabase(): Promise<AdminAuthDatabase | null> {
  try {
    const database = runtimeEnvValue(await getRuntimeEnv(), "INTEGRATIONS_DB");
    return database && typeof database === "object" ? (database as AdminAuthDatabase) : null;
  } catch {
    return null;
  }
}

async function ensureAdminAuthTable(database: AdminAuthDatabase) {
  await database.prepare(
    `CREATE TABLE IF NOT EXISTS ${ADMIN_AUTH_TABLE} (
      setting_key TEXT PRIMARY KEY,
      password_hash TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );`,
  ).run();
  await database.prepare(
    `CREATE TABLE IF NOT EXISTS ${ADMIN_AUTH_EVENTS_TABLE} (
      id TEXT PRIMARY KEY,
      actor_role TEXT NOT NULL,
      action TEXT NOT NULL,
      occurred_at TEXT NOT NULL
    );`,
  ).run();
  await database.prepare(
    `CREATE TABLE IF NOT EXISTS ${ADMIN_AUTH_RATE_LIMITS_TABLE} (
      limit_key TEXT PRIMARY KEY,
      window_started_at TEXT NOT NULL,
      attempts INTEGER NOT NULL
    );`,
  ).run();
}

async function recordAdminAuthEvent(database: AdminAuthDatabase, actorRole: AdminRole, action: string) {
  await database.prepare(
    `INSERT INTO ${ADMIN_AUTH_EVENTS_TABLE} (id, actor_role, action, occurred_at) VALUES (?1, ?2, ?3, ?4)`,
  ).bind(crypto.randomUUID(), actorRole, action, new Date().toISOString()).run();
}

async function getStoredAdminPasswordHash() {
  const database = await getAdminAuthDatabase();
  if (!database) return "";
  await ensureAdminAuthTable(database);
  const row = await database.prepare(`SELECT password_hash FROM ${ADMIN_AUTH_TABLE} WHERE setting_key = ?1`)
    .bind(ADMIN_PASSWORD_KEY)
    .first<{ password_hash?: string }>();
  return typeof row?.password_hash === "string" ? row.password_hash : "";
}

async function storeOwnerPassword(database: AdminAuthDatabase, password: string) {
  await database.prepare(
    `INSERT INTO ${ADMIN_AUTH_TABLE} (setting_key, password_hash, updated_at)
     VALUES (?1, ?2, ?3)
     ON CONFLICT(setting_key) DO UPDATE SET password_hash = excluded.password_hash, updated_at = excluded.updated_at`,
  ).bind(ADMIN_PASSWORD_KEY, await hashOwnerPassword(password), new Date().toISOString()).run();
}

async function currentOwnerPasswordMatches(password: string) {
  const storedHash = await getStoredAdminPasswordHash();
  if (storedHash) {
    const result = await verifyOwnerPassword(password, storedHash);
    if (result.matched && result.needsUpgrade) {
      const database = await getAdminAuthDatabase();
      if (database) {
        await storeOwnerPassword(database, password);
        await recordAdminAuthEvent(database, "owner", "owner_password_hash_upgraded");
      }
    }
    return result.matched;
  }
  const ownerPassword = await configuredPassword("REGGIE_ADMIN_PASSWORD", "ADMIN_PASSWORD");
  const matched = Boolean(ownerPassword && constantTimeMatch(password, ownerPassword));
  if (matched) {
    const database = await getAdminAuthDatabase();
    if (database) {
      await ensureAdminAuthTable(database);
      await storeOwnerPassword(database, password);
      await recordAdminAuthEvent(database, "owner", "owner_password_secret_migrated");
    }
  }
  return matched;
}

async function centralSupportPasswordMatches(password: string) {
  if (!password) return false;
  const connection = await getReggieConnection();
  if (!connection.siteId || !connection.token) return false;
  try {
    const response = await fetch(`${connection.url}/v1/sites/${encodeURIComponent(connection.siteId)}/support-auth`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Reggie-Site-Key": connection.token,
      },
      body: JSON.stringify({ password }),
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({})) as { ok?: boolean };
    return response.ok && payload.ok === true;
  } catch {
    return false;
  }
}

async function matchingAdminRole(password: string): Promise<AdminRole | null> {
  if (!password) return null;
  const supportPassword = await configuredPassword("REGGIE_ADMIN_SUPER_PASSWORD", "ADMIN_SUPER_PASSWORD", "REGGIE_DEV_PASSWORD", "ADMIN_DEV_PASSWORD", "DEV_PASSWORD");
  if (supportPassword && constantTimeMatch(password, supportPassword)) return "support";
  if (await currentOwnerPasswordMatches(password)) return "owner";
  if (await centralSupportPasswordMatches(password)) return "support";
  return null;
}

async function sessionSigningSecret() {
  const baseSecret = await configuredPassword("REGGIE_ADMIN_SESSION_SECRET", "ADMIN_ENCRYPTION_KEY");
  if (!baseSecret) return "";
  const ownerPassword = await configuredPassword("REGGIE_ADMIN_PASSWORD", "ADMIN_PASSWORD");
  const ownerRecord = await getStoredAdminPasswordHash();
  const supportPassword = await configuredPassword("REGGIE_ADMIN_SUPER_PASSWORD", "ADMIN_SUPER_PASSWORD", "REGGIE_DEV_PASSWORD", "ADMIN_DEV_PASSWORD", "DEV_PASSWORD");
  return sessionSigningDigest({ baseSecret, ownerSecret: ownerPassword, ownerRecord, supportSecret: supportPassword });
}

async function consumeSupportResetAttempt(database: AdminAuthDatabase) {
  await ensureAdminAuthTable(database);
  const now = new Date();
  const cutoff = new Date(now.getTime() - 15 * 60 * 1000).toISOString();
  const row = await database.prepare(
    `INSERT INTO ${ADMIN_AUTH_RATE_LIMITS_TABLE} (limit_key, window_started_at, attempts) VALUES (?1, ?2, 1)
     ON CONFLICT(limit_key) DO UPDATE SET
       attempts = CASE WHEN window_started_at <= ?3 THEN 1 ELSE attempts + 1 END,
       window_started_at = CASE WHEN window_started_at <= ?3 THEN ?2 ELSE window_started_at END
     RETURNING attempts`,
  ).bind("support-owner-reset", now.toISOString(), cutoff).first<{ attempts?: number }>();
  return resetAttemptAllowed(Number(row?.attempts ?? 1));
}

async function loginRateLimitKey(req: NextRequest) {
  const forwarded = req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const siteId = String(runtimeEnvValue(await getRuntimeEnv(), "REGGIE_CONNECT_SITE_ID") ?? req.nextUrl.hostname ?? "site");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${siteId}:${forwarded}`));
  const fingerprint = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 32);
  return `admin-login:${fingerprint}`;
}

export async function consumeAdminLoginAttempt(req: NextRequest) {
  const database = await getAdminAuthDatabase();
  if (!database) return null;
  await ensureAdminAuthTable(database);
  const now = new Date();
  const cutoff = new Date(now.getTime() - 15 * 60 * 1000).toISOString();
  const row = await database.prepare(
    `INSERT INTO ${ADMIN_AUTH_RATE_LIMITS_TABLE} (limit_key, window_started_at, attempts) VALUES (?1, ?2, 1)
     ON CONFLICT(limit_key) DO UPDATE SET
       attempts = CASE WHEN window_started_at <= ?3 THEN 1 ELSE attempts + 1 END,
       window_started_at = CASE WHEN window_started_at <= ?3 THEN ?2 ELSE window_started_at END
     RETURNING attempts`,
  ).bind(await loginRateLimitKey(req), now.toISOString(), cutoff).first<{ attempts?: number }>();
  return loginAttemptAllowed(Number(row?.attempts ?? 1));
}

export async function clearAdminLoginAttempts(req: NextRequest) {
  const database = await getAdminAuthDatabase();
  if (!database) return;
  await ensureAdminAuthTable(database);
  await database.prepare(`DELETE FROM ${ADMIN_AUTH_RATE_LIMITS_TABLE} WHERE limit_key = ?1`).bind(await loginRateLimitKey(req)).run();
}

async function hmac(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sessionRole(req: NextRequest): Promise<AdminRole | null> {
  const token = cookie(req, ADMIN_SESSION_COOKIE);
  const [version, role, expiresAt, signature] = token.split(".");
  if (version !== "v1" || (role !== "owner" && role !== "support") || !expiresAt || !signature) return null;
  const expiry = Number(expiresAt);
  if (!Number.isFinite(expiry) || expiry <= Math.floor(Date.now() / 1000)) return null;
  const secret = await sessionSigningSecret();
  if (!secret) return null;
  const expected = await hmac(`${version}.${role}.${expiresAt}`, secret);
  return constantTimeMatch(signature, expected) ? role : null;
}

export async function createAdminSession(password: string) {
  const role = await matchingAdminRole(password.trim());
  if (!role) return null;
  const secret = await sessionSigningSecret();
  if (!secret) return null;
  const maxAge = sessionTtlSeconds(role);
  const expiresAt = Math.floor(Date.now() / 1000) + maxAge;
  const payload = `v1.${role}.${expiresAt}`;
  return { token: `${payload}.${await hmac(payload, secret)}`, role, maxAge };
}

export async function checkAdminAuth(req: NextRequest): Promise<boolean> {
  return Boolean(await getAdminRole(req));
}

export async function getAdminRole(req: NextRequest): Promise<AdminRole | null> {
  return await sessionRole(req) ?? await matchingAdminRole(bearer(req));
}

export async function checkOwnerAuth(req: NextRequest) {
  return (await getAdminRole(req)) === "owner";
}

export function isSameOriginMutation(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (origin) {
    try { return new URL(origin).origin === req.nextUrl.origin; }
    catch { return false; }
  }
  // Non-browser callers may use the explicit legacy bearer credential. Browser cookie writes always include Origin.
  return Boolean(bearer(req) && bearer(req) !== "cookie-session");
}

export async function checkSupportAuth(req: NextRequest): Promise<boolean> {
  if ((await sessionRole(req)) === "support") return true;
  const supplied = bearer(req);
  if (!supplied) return false;
  const supportPassword = await configuredPassword("REGGIE_ADMIN_SUPER_PASSWORD", "ADMIN_SUPER_PASSWORD", "REGGIE_DEV_PASSWORD", "ADMIN_DEV_PASSWORD", "DEV_PASSWORD");
  return Boolean((supportPassword && constantTimeMatch(supplied, supportPassword)) || await centralSupportPasswordMatches(supplied));
}

export async function changeAdminPassword(currentPassword: string, nextPassword: string) {
  const current = currentPassword.trim();
  const next = nextPassword.trim();
  if (next.length < 10) return { ok: false, error: "Use at least 10 characters for the new admin password.", status: 400 };
  const supportPassword = await configuredPassword("REGGIE_ADMIN_SUPER_PASSWORD", "ADMIN_SUPER_PASSWORD", "REGGIE_DEV_PASSWORD", "ADMIN_DEV_PASSWORD", "DEV_PASSWORD");
  if ((supportPassword && constantTimeMatch(next, supportPassword)) || await centralSupportPasswordMatches(next)) return { ok: false, error: "Choose a different admin password.", status: 400 };
  if (!(await currentOwnerPasswordMatches(current))) return { ok: false, error: "Current admin password was not accepted.", status: 401 };
  const database = await getAdminAuthDatabase();
  if (!database) return { ok: false, error: "Admin password storage is not ready. Bind INTEGRATIONS_DB first.", status: 503 };
  await ensureAdminAuthTable(database);
  await storeOwnerPassword(database, next);
  await recordAdminAuthEvent(database, "owner", "owner_password_changed");
  return { ok: true, status: 200 };
}

export async function setOwnerPasswordFromEmail(nextPassword: string) {
  const next = nextPassword.trim();
  if (next.length < 10) return { ok: false, error: "Use at least 10 characters for the new dashboard password.", status: 400 };
  const supportPassword = await configuredPassword("REGGIE_ADMIN_SUPER_PASSWORD", "ADMIN_SUPER_PASSWORD", "REGGIE_DEV_PASSWORD", "ADMIN_DEV_PASSWORD", "DEV_PASSWORD");
  if ((supportPassword && constantTimeMatch(next, supportPassword)) || await centralSupportPasswordMatches(next)) return { ok: false, error: "Choose a password different from the support credential.", status: 400 };
  const database = await getAdminAuthDatabase();
  if (!database) return { ok: false, error: "Dashboard password storage is not ready.", status: 503 };
  await ensureAdminAuthTable(database);
  await storeOwnerPassword(database, next);
  await recordAdminAuthEvent(database, "owner", "owner_password_set_from_verified_email");
  return { ok: true, status: 200 };
}

export async function resetAdminPasswordForSupport(req: NextRequest, nextPassword: string) {
  const database = await getAdminAuthDatabase();
  if (!database) return { ok: false, error: "Admin password storage is not ready. Bind INTEGRATIONS_DB first.", status: 503 };
  if (!(await checkSupportAuth(req))) return { ok: false, error: "Support authorization is required to reset the owner password.", status: 403 };
  const next = nextPassword.trim();
  if (next.length < 10) return { ok: false, error: "Use at least 10 characters for the new admin password.", status: 400 };
  const supportPassword = await configuredPassword("REGGIE_ADMIN_SUPER_PASSWORD", "ADMIN_SUPER_PASSWORD", "REGGIE_DEV_PASSWORD", "ADMIN_DEV_PASSWORD", "DEV_PASSWORD");
  if ((supportPassword && constantTimeMatch(next, supportPassword)) || await centralSupportPasswordMatches(next)) return { ok: false, error: "Choose a password different from the support credential.", status: 400 };
  if (!(await consumeSupportResetAttempt(database))) return { ok: false, error: "Too many owner-password reset attempts. Wait 15 minutes before trying again.", status: 429 };
  await ensureAdminAuthTable(database);
  await storeOwnerPassword(database, next);
  await recordAdminAuthEvent(database, "support", "owner_password_reset");
  return { ok: true, status: 200 };
}

export async function getAdminAuthSetupStatus() {
  const [ownerRecord, ownerSecret, sessionSecret] = await Promise.all([
    getStoredAdminPasswordHash(),
    configuredPassword("REGGIE_ADMIN_PASSWORD", "ADMIN_PASSWORD"),
    configuredPassword("REGGIE_ADMIN_SESSION_SECRET", "ADMIN_ENCRYPTION_KEY"),
  ]);
  return { ownerConfigured: Boolean(ownerRecord || ownerSecret), sessionConfigured: Boolean(sessionSecret) };
}

export function unauthorizedResponse() {
  return NextResponse.json(
    { error: "Unauthorized" },
    {
      status: 401,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

export function ownerRequiredResponse() {
  return NextResponse.json({ error: "Owner authorization is required." }, { status: 403, headers: { "Cache-Control": "no-store" } });
}
