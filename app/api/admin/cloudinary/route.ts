import { NextRequest, NextResponse } from "next/server";

import { checkAdminAuth, unauthorizedResponse } from "@/lib/admin-auth";
import {
  getCloudinaryConfigStatus,
  normalizeCloudinaryFolder,
  readEnvCloudinaryConfig,
  saveStoredCloudinaryConfig,
} from "@/lib/cloudinary-config";
import { verifyCloudinaryConfig } from "@/lib/cloudinary";

export async function GET(req: NextRequest) {
  if (!(await checkAdminAuth(req))) return unauthorizedResponse();

  const status = await getCloudinaryConfigStatus();
  return NextResponse.json({ ok: true, status });
}

export async function POST(req: NextRequest) {
  if (!(await checkAdminAuth(req))) return unauthorizedResponse();

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const currentEnvConfig = readEnvCloudinaryConfig();
  const cloudName = typeof body.cloudName === "string" ? body.cloudName.trim() : "";
  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  const apiSecret = typeof body.apiSecret === "string" ? body.apiSecret.trim() : "";
  const folder = normalizeCloudinaryFolder(typeof body.folder === "string" ? body.folder : "");

  const config = {
    cloudName: cloudName || currentEnvConfig?.cloudName || "",
    apiKey: apiKey || currentEnvConfig?.apiKey || "",
    apiSecret: apiSecret || currentEnvConfig?.apiSecret || "",
    folder,
  };

  if (!config.cloudName || !config.apiKey || !config.apiSecret) {
    return NextResponse.json(
      {
        ok: false,
        error: "Cloud name, API key, and API secret are required the first time you connect Cloudinary.",
      },
      { status: 400 },
    );
  }

  try {
    await verifyCloudinaryConfig(config);
    await saveStoredCloudinaryConfig({
      cloudName: body.cloudName as string | undefined,
      apiKey: body.apiKey as string | undefined,
      apiSecret: body.apiSecret as string | undefined,
      folder,
    });

    const status = await getCloudinaryConfigStatus();
    return NextResponse.json({
      ok: true,
      status,
      message: status.usesEnvOverride
        ? "Cloudinary settings were saved, but env-based Cloudinary credentials still take priority on this deployment."
        : "Cloudinary is connected and ready for media uploads.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save Cloudinary settings.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
