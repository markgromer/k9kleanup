import { env as workerEnv } from "cloudflare:workers";

export const DEFAULT_CLOUDINARY_UPLOAD_FOLDER = "reggie/uploads";

const CLOUDINARY_STORAGE_KEY = "cloudinary";
// Retained for sites that still have legacy admin routes during a Hub migration.
export const GITHUB_ACTIONS_TOKEN_STORAGE_KEY = "github-actions-token";
const CLOUDINARY_SECRETS_TABLE = "admin_integration_secrets";
const CLOUDINARY_ENCRYPTION_ENV_KEY = "ADMIN_ENCRYPTION_KEY";
const CLOUDINARY_D1_BINDING = "INTEGRATIONS_DB";

type IntegrationSecretsDatabase = {
  exec(query: string): Promise<unknown>;
  prepare(query: string): {
    all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
    first<T = Record<string, unknown>>(): Promise<T | null>;
    run(): Promise<unknown>;
    bind(...values: unknown[]): {
      all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
      first<T = Record<string, unknown>>(): Promise<T | null>;
      run(): Promise<unknown>;
    };
  };
};

export type CloudinaryConfig = {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  folder: string;
};

export type CloudinaryConfigStatus = {
  configured: boolean;
  source: "env" | "stored" | "none";
  cloudName: string;
  apiKeyMasked: string;
  folder: string;
  bindingReady: boolean;
  encryptionReady: boolean;
  storageReady: boolean;
  usesEnvOverride: boolean;
  lastUpdatedAt?: string;
};

type StoredCloudinaryConfig = {
  config: CloudinaryConfig;
  updatedAt: string;
};

function normalizeText(value: string | undefined | null) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeCloudinaryFolder(value: string | undefined | null) {
  const sanitized = normalizeText(value)
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "")
    .replace(/\/+/g, "/");

  return sanitized || DEFAULT_CLOUDINARY_UPLOAD_FOLDER;
}

export function readEnvCloudinaryConfig(): CloudinaryConfig | null {
  const cloudName = normalizeText(process.env.CLOUDINARY_CLOUD_NAME);
  const apiKey = normalizeText(process.env.CLOUDINARY_API_KEY);
  const apiSecret = normalizeText(process.env.CLOUDINARY_API_SECRET);
  const folder = normalizeCloudinaryFolder(process.env.CLOUDINARY_UPLOAD_FOLDER);

  if (!cloudName || !apiKey || !apiSecret) {
    return null;
  }

  return {
    cloudName,
    apiKey,
    apiSecret,
    folder,
  };
}

function getCloudinaryEncryptionSecret() {
  return normalizeText(process.env[CLOUDINARY_ENCRYPTION_ENV_KEY]);
}

export async function getAdminIntegrationsDatabase(): Promise<IntegrationSecretsDatabase | null> {
  try {
    const database = Reflect.get(workerEnv, CLOUDINARY_D1_BINDING);
    return database && typeof database === "object"
      ? (database as IntegrationSecretsDatabase)
      : null;
  } catch {
    return null;
  }
}

async function ensureSecretsTable(database: IntegrationSecretsDatabase) {
  await database.prepare(
    `CREATE TABLE IF NOT EXISTS ${CLOUDINARY_SECRETS_TABLE} (
      secret_key TEXT PRIMARY KEY,
      encrypted_value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );`,
  ).run();
}

function encodeBase64(value: ArrayBuffer | Uint8Array) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  return Buffer.from(bytes).toString("base64");
}

function decodeBase64(value: string) {
  return new Uint8Array(Buffer.from(value, "base64"));
}

async function importEncryptionKey() {
  const secret = getCloudinaryEncryptionSecret();
  if (!secret) {
    throw new Error("Cloudinary admin storage is not ready. Set ADMIN_ENCRYPTION_KEY first.");
  }

  const rawKey = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", rawKey, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function encryptValue(value: string) {
  const key = await importEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(value);
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  return `${encodeBase64(iv)}.${encodeBase64(cipher)}`;
}

async function decryptValue(value: string) {
  const [encodedIv, encodedCipher] = value.split(".");
  if (!encodedIv || !encodedCipher) {
    throw new Error("Stored Cloudinary config is unreadable.");
  }

  const key = await importEncryptionKey();
  const iv = decodeBase64(encodedIv);
  const cipher = decodeBase64(encodedCipher);
  const plainBuffer = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
  return new TextDecoder().decode(plainBuffer);
}

function maskValue(value: string) {
  if (!value) {
    return "";
  }

  if (value.length <= 8) {
    return `${value.slice(0, 2)}${"*".repeat(Math.max(2, value.length - 2))}`;
  }

  return `${value.slice(0, 4)}${"*".repeat(Math.max(4, value.length - 8))}${value.slice(-4)}`;
}

async function readStoredCloudinaryConfig(): Promise<StoredCloudinaryConfig | null> {
  const row = await readStoredAdminIntegrationSecretRow(CLOUDINARY_STORAGE_KEY);
  if (!row?.encrypted_value) {
    return null;
  }

  const decrypted = await decryptValue(row.encrypted_value);
  const parsed = JSON.parse(decrypted) as Partial<CloudinaryConfig>;
  const cloudName = normalizeText(parsed.cloudName);
  const apiKey = normalizeText(parsed.apiKey);
  const apiSecret = normalizeText(parsed.apiSecret);

  if (!cloudName || !apiKey || !apiSecret) {
    return null;
  }

  return {
    config: {
      cloudName,
      apiKey,
      apiSecret,
      folder: normalizeCloudinaryFolder(parsed.folder),
    },
    updatedAt: row.updated_at,
  };
}

async function readStoredAdminIntegrationSecretRow(
  secretKey: string,
): Promise<{ encrypted_value: string; updated_at: string } | null> {
  const database = await getAdminIntegrationsDatabase();
  const encryptionSecret = getCloudinaryEncryptionSecret();
  if (!database || !encryptionSecret) {
    return null;
  }

  await ensureSecretsTable(database);

  const row = await database
    .prepare(
      `SELECT encrypted_value, updated_at
       FROM ${CLOUDINARY_SECRETS_TABLE}
       WHERE secret_key = ?1`,
    )
    .bind(secretKey)
    .first<{ encrypted_value: string; updated_at: string }>();

  return row;
}

export async function readStoredAdminIntegrationSecret(secretKey: string) {
  const row = await readStoredAdminIntegrationSecretRow(secretKey);
  if (!row?.encrypted_value) {
    return null;
  }

  return {
    value: await decryptValue(row.encrypted_value),
    updatedAt: row.updated_at,
  };
}

export async function getAdminIntegrationSecretStorageStatus() {
  const database = await getAdminIntegrationsDatabase();
  const bindingReady = Boolean(database);
  const encryptionReady = Boolean(getCloudinaryEncryptionSecret());

  return {
    bindingReady,
    encryptionReady,
    storageReady: bindingReady && encryptionReady,
  };
}

export async function saveStoredAdminIntegrationSecret(secretKey: string, value: string) {
  const database = await getAdminIntegrationsDatabase();
  if (!database) {
    throw new Error("Reggie admin storage is not ready. Bind a D1 database named INTEGRATIONS_DB.");
  }

  const encryptionSecret = getCloudinaryEncryptionSecret();
  if (!encryptionSecret) {
    throw new Error("Reggie admin storage is not ready. Set ADMIN_ENCRYPTION_KEY first.");
  }

  await ensureSecretsTable(database);

  const updatedAt = new Date().toISOString();
  const encryptedValue = await encryptValue(value);

  await database
    .prepare(
      `INSERT INTO ${CLOUDINARY_SECRETS_TABLE} (secret_key, encrypted_value, updated_at)
       VALUES (?1, ?2, ?3)
       ON CONFLICT(secret_key) DO UPDATE SET
         encrypted_value = excluded.encrypted_value,
         updated_at = excluded.updated_at`,
    )
    .bind(secretKey, encryptedValue, updatedAt)
    .run();

  return updatedAt;
}

export async function resolveCloudinaryConfig() {
  const envConfig = readEnvCloudinaryConfig();
  if (envConfig) {
    return envConfig;
  }

  try {
    return (await readStoredCloudinaryConfig())?.config ?? null;
  } catch {
    return null;
  }
}

export async function getCloudinaryConfigStatus(): Promise<CloudinaryConfigStatus> {
  const envConfig = readEnvCloudinaryConfig();
  const database = await getAdminIntegrationsDatabase();
  const bindingReady = Boolean(database);
  const encryptionReady = Boolean(getCloudinaryEncryptionSecret());
  const storageReady = bindingReady && encryptionReady;
  const storedConfig = await readStoredCloudinaryConfig().catch(() => null);
  const activeConfig = envConfig ?? storedConfig?.config ?? null;

  return {
    configured: Boolean(activeConfig),
    source: envConfig ? "env" : storedConfig ? "stored" : "none",
    cloudName: activeConfig?.cloudName ?? storedConfig?.config.cloudName ?? "",
    apiKeyMasked: activeConfig?.apiKey
      ? maskValue(activeConfig.apiKey)
      : storedConfig?.config.apiKey
        ? maskValue(storedConfig.config.apiKey)
        : "",
    folder: activeConfig?.folder ?? storedConfig?.config.folder ?? DEFAULT_CLOUDINARY_UPLOAD_FOLDER,
    bindingReady,
    encryptionReady,
    storageReady,
    usesEnvOverride: Boolean(envConfig && storedConfig),
    lastUpdatedAt: storedConfig?.updatedAt,
  };
}

export async function saveStoredCloudinaryConfig(input: Partial<CloudinaryConfig>) {
  const database = await getAdminIntegrationsDatabase();
  if (!database) {
    throw new Error("Cloudinary admin storage is not ready. Bind a D1 database named INTEGRATIONS_DB.");
  }

  const encryptionSecret = getCloudinaryEncryptionSecret();
  if (!encryptionSecret) {
    throw new Error("Cloudinary admin storage is not ready. Set ADMIN_ENCRYPTION_KEY first.");
  }

  const existingConfig = await readStoredCloudinaryConfig();

  const config: CloudinaryConfig = {
    cloudName: normalizeText(input.cloudName) || existingConfig?.config.cloudName || "",
    apiKey: normalizeText(input.apiKey) || existingConfig?.config.apiKey || "",
    apiSecret: normalizeText(input.apiSecret) || existingConfig?.config.apiSecret || "",
    folder: normalizeCloudinaryFolder(input.folder),
  };

  if (!config.cloudName || !config.apiKey || !config.apiSecret) {
    throw new Error("Cloud name, API key, and API secret are required.");
  }

  await ensureSecretsTable(database);

  const updatedAt = new Date().toISOString();
  const encryptedValue = await encryptValue(JSON.stringify(config));

  await database
    .prepare(
      `INSERT INTO ${CLOUDINARY_SECRETS_TABLE} (secret_key, encrypted_value, updated_at)
       VALUES (?1, ?2, ?3)
       ON CONFLICT(secret_key) DO UPDATE SET
         encrypted_value = excluded.encrypted_value,
         updated_at = excluded.updated_at`,
    )
    .bind(CLOUDINARY_STORAGE_KEY, encryptedValue, updatedAt)
    .run();

  return updatedAt;
}
