import { defaultQuoteSettings, getIntegrationConnection, readAdminSetting, saveIntegration, writeAdminSetting } from "@/lib/admin-platform";
import { sweepAndGoRequest } from "@/lib/sweep-and-go-client";

const VERIFICATION_KEY = "integration-verification:sweep-and-go";
type VerificationRecord = {
  fingerprint: string;
  accountSlug: string;
  accountName: string;
  verifiedAt: string;
};

export type SweepAndGoAccess = {
  required: true;
  verified: boolean;
  configured: boolean;
  enabled: boolean;
  hasApiToken: boolean;
  accountSlug: string;
  accountName: string;
  verifiedAt: string;
  reason: string;
};

export async function getSweepAndGoAccess(): Promise<SweepAndGoAccess> {
  const connection = await getIntegrationConnection("sweep-and-go").catch(() => null);
  const accountSlug = clean(connection?.values.orgSlug);
  const apiToken = clean(connection?.values.apiToken);
  const base = {
    required: true as const,
    configured: Boolean(connection?.configured),
    enabled: Boolean(connection?.enabled),
    hasApiToken: Boolean(apiToken),
    accountSlug,
  };
  if (!connection?.configured || !connection.enabled) return { ...base, verified: false, accountName: "", verifiedAt: "", reason: "Connect and enable Sweep & Go to unlock its quote settings." };
  if (!accountSlug || !apiToken) return { ...base, verified: false, accountName: "", verifiedAt: "", reason: "An account slug and API token are required." };

  const verification = await readAdminSetting<VerificationRecord | null>(VERIFICATION_KEY, null).catch(() => null);
  const fingerprint = await credentialFingerprint(accountSlug, apiToken);
  if (!verification?.verifiedAt || verification.fingerprint !== fingerprint) {
    return { ...base, verified: false, accountName: "", verifiedAt: "", reason: "Verify the current account slug and API token with Sweep & Go." };
  }
  return { ...base, verified: true, accountName: verification.accountName, verifiedAt: verification.verifiedAt, reason: "" };
}

export async function updateAndVerifySweepAndGoCredentials(input: Record<string, unknown>) {
  const existing = await getIntegrationConnection("sweep-and-go").catch(() => null);
  const accountSlug = clean(input.orgSlug) || clean(existing?.values.orgSlug);
  const apiToken = clean(input.apiToken) || clean(existing?.values.apiToken);
  if (!accountSlug || !apiToken) throw new Error("Enter both the Sweep & Go account slug and API token.");
  await saveIntegration("sweep-and-go", {
    enabled: true,
    values: { ...(existing?.values ?? {}), orgSlug: accountSlug, apiToken },
  });
  await clearSweepAndGoVerification();
  return verifySweepAndGoConnection();
}

export async function verifySweepAndGoConnection() {
  const connection = await getIntegrationConnection("sweep-and-go");
  const accountSlug = clean(connection.values.orgSlug);
  const apiToken = clean(connection.values.apiToken);
  if (!connection.enabled || !accountSlug || !apiToken) throw new Error("Enable Sweep & Go and enter both the account slug and API token.");

  const payload = await sweepAndGoRequest<Record<string, unknown>>(connection, "/api/v2/client_on_boarding/organization_data");
  const organization = record(payload?.organization);
  const verifiedSlug = clean(organization.organization ?? organization.slug ?? payload?.organization_slug ?? payload?.slug);
  if (!verifiedSlug) throw new Error("Sweep & Go verified the token but did not return an account slug.");
  if (verifiedSlug.toLowerCase() !== accountSlug.toLowerCase()) throw new Error("The API token belongs to a different Sweep & Go account slug.");

  const verifiedAt = new Date().toISOString();
  const accountName = clean(organization.organization_name ?? organization.business_name ?? payload?.organization_name);
  await writeAdminSetting(VERIFICATION_KEY, {
    fingerprint: await credentialFingerprint(accountSlug, apiToken),
    accountSlug: verifiedSlug,
    accountName,
    verifiedAt,
  } satisfies VerificationRecord);
  await ensureSweepAndGoQuoteRouting();
  return { ...(await getSweepAndGoAccess()), verified: true, accountSlug: verifiedSlug, accountName, verifiedAt, reason: "" };
}

export async function clearSweepAndGoVerification() {
  await writeAdminSetting(VERIFICATION_KEY, null);
}

async function credentialFingerprint(accountSlug: string, apiToken: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${accountSlug.toLowerCase()}\u0000${apiToken}`));
  return Array.from(new Uint8Array(bytes), (value) => value.toString(16).padStart(2, "0")).join("");
}

async function ensureSweepAndGoQuoteRouting() {
  const settings = await readAdminSetting("quote-tool", defaultQuoteSettings);
  if (
    settings.crm.provider === "sweep-and-go"
    && settings.crm.pricingSource === "crm"
    && settings.crm.serviceDataSource === "crm"
  ) return;
  await writeAdminSetting("quote-tool", {
    ...settings,
    crm: {
      ...settings.crm,
      provider: "sweep-and-go",
      fallbackProvider: settings.crm.fallbackProvider || "gohighlevel",
      pricingSource: "crm",
      serviceDataSource: "crm",
    },
  });
}

function clean(value: unknown) { return typeof value === "string" ? value.trim() : value === null || value === undefined ? "" : String(value).trim(); }
function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
