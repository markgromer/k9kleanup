// Cloudflare Workers Web Crypto rejects PBKDF2 iteration counts above 100,000.
const OWNER_KDF_ITERATIONS = 100_000;
const OWNER_KDF_MIN_ITERATIONS = 100_000;
const OWNER_KDF_MAX_ITERATIONS = 100_000;
const OWNER_SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const SUPPORT_SESSION_TTL_SECONDS = 60 * 30;

function constantTimeText(left: string, right: string) {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  const length = Math.max(leftBytes.length, rightBytes.length);
  let difference = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < length; index += 1) difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  return difference === 0;
}

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function fromBase64Url(value: string) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(normalized), (character) => character.charCodeAt(0));
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hashOwnerPassword(password: string, options: { salt?: Uint8Array; iterations?: number } = {}) {
  const salt = Uint8Array.from(options.salt ?? crypto.getRandomValues(new Uint8Array(16)));
  const iterations = options.iterations ?? OWNER_KDF_ITERATIONS;
  if (!Number.isSafeInteger(iterations) || iterations < OWNER_KDF_MIN_ITERATIONS || iterations > OWNER_KDF_MAX_ITERATIONS) throw new RangeError("Owner password PBKDF2 iterations are outside the supported Cloudflare range.");
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, material, 256);
  return `pbkdf2-sha256:${iterations}:${base64Url(salt)}:${base64Url(new Uint8Array(bits))}`;
}

export async function verifyOwnerPassword(password: string, stored: string) {
  if (/^[a-f0-9]{64}$/i.test(stored)) return { matched: constantTimeText(await sha256Hex(password), stored), needsUpgrade: true };
  const [algorithm, iterationsValue, saltValue, hashValue] = stored.split(":");
  const iterations = Number(iterationsValue);
  if (algorithm !== "pbkdf2-sha256" || !Number.isSafeInteger(iterations) || iterations < OWNER_KDF_MIN_ITERATIONS || iterations > OWNER_KDF_MAX_ITERATIONS || !saltValue || !hashValue) return { matched: false, needsUpgrade: false };
  try {
    const salt = fromBase64Url(saltValue);
    const expected = fromBase64Url(hashValue);
    if (salt.length !== 16 || expected.length !== 32) return { matched: false, needsUpgrade: false };
    const candidate = await hashOwnerPassword(password, { salt, iterations });
    return { matched: constantTimeText(candidate, stored), needsUpgrade: false };
  } catch {
    return { matched: false, needsUpgrade: false };
  }
}

export async function sessionSigningDigest(input: { baseSecret: string; ownerSecret: string; ownerRecord: string; supportSecret: string }) {
  return sha256Hex(`reggie-admin-session:${input.baseSecret}:${input.ownerSecret}:${input.ownerRecord}:${input.supportSecret}`);
}

export function sessionTtlSeconds(role: "owner" | "support") {
  return role === "support" ? SUPPORT_SESSION_TTL_SECONDS : OWNER_SESSION_TTL_SECONDS;
}

export function resetAttemptAllowed(attempts: number) {
  return Number.isSafeInteger(attempts) && attempts >= 0 && attempts <= 5;
}

export function loginAttemptAllowed(attempts: number) {
  return Number.isSafeInteger(attempts) && attempts >= 0 && attempts <= 10;
}
