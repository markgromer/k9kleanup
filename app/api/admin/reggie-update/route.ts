import { NextRequest, NextResponse } from "next/server";

import { checkAdminAuth, unauthorizedResponse } from "@/lib/admin-auth";
import { getReggieConnection } from "@/lib/reggie-connection";

const installedVersion = "0.5.49";

type ReleasePayload = {
  ok?: boolean;
  latest?: {
    version?: string;
    releasedAt?: string;
    title?: string;
    changes?: string[];
  };
};

export async function GET(req: NextRequest) {
  if (!(await checkAdminAuth(req))) return unauthorizedResponse();
  const settings = await getReggieConnection();
  if (!settings.siteId || !settings.token) {
    return NextResponse.json({ ok: true, configured: false, installedVersion, updateAvailable: false });
  }

  try {
    const response = await fetch(`${settings.url}/v1/sites/${encodeURIComponent(settings.siteId)}/release`, {
      headers: { Authorization: `Bearer ${settings.token}`, "X-Reggie-Version": installedVersion },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    const data = await response.json().catch(() => ({})) as ReleasePayload;
    const latestVersion = String(data.latest?.version ?? "").trim();
    return NextResponse.json({
      ok: response.ok && data.ok === true,
      configured: true,
      installedVersion,
      latest: data.latest ?? null,
      updateAvailable: isNewerVersion(latestVersion, installedVersion),
    }, { status: response.ok ? 200 : response.status });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Reggie could not check for updates." }, { status: 502 });
  }
}

function isNewerVersion(latest: string, installed: string) {
  const latestParts = versionParts(latest);
  const installedParts = versionParts(installed);
  for (let index = 0; index < 3; index += 1) {
    if (latestParts[index] > installedParts[index]) return true;
    if (latestParts[index] < installedParts[index]) return false;
  }
  return false;
}

function versionParts(value: string) {
  const match = value.match(/^(\d+)\.(\d+)\.(\d+)/);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : [0, 0, 0];
}
