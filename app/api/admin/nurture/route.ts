import { NextRequest, NextResponse } from "next/server";

import { checkAdminAuth, unauthorizedResponse } from "@/lib/admin-auth";
import { getNurtureDashboard } from "@/lib/nurture";
import {
  getNurtureConfigStatus,
  saveStoredNurtureConfig,
  type NurtureEntrySources,
  type NurtureExclusions,
  type NurtureStopRules,
} from "@/lib/nurture-config";

export async function GET(req: NextRequest) {
  if (!(await checkAdminAuth(req))) return unauthorizedResponse();

  const [status, dashboard] = await Promise.all([
    getNurtureConfigStatus(),
    getNurtureDashboard().catch(() => null),
  ]);
  return NextResponse.json({ ok: true, status, dashboard });
}

export async function POST(req: NextRequest) {
  if (!(await checkAdminAuth(req))) return unauthorizedResponse();

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const openPhoneApiKey = typeof body.openPhoneApiKey === "string" ? body.openPhoneApiKey.trim() : "";
  const openPhonePhoneNumberId = typeof body.openPhonePhoneNumberId === "string" ? body.openPhonePhoneNumberId.trim() : "";
  const enabled = body.enabled === true;

  if (openPhoneApiKey && openPhoneApiKey.length < 12) {
    return NextResponse.json({ ok: false, error: "Enter a valid OpenPhone API key." }, { status: 400 });
  }

  if (enabled && (!openPhoneApiKey || !openPhonePhoneNumberId)) {
    const currentStatus = await getNurtureConfigStatus();
    const hasApiKey = Boolean(openPhoneApiKey || currentStatus.openPhoneApiKeyMasked);
    const hasPhoneNumberId = Boolean(openPhonePhoneNumberId || currentStatus.openPhonePhoneNumberId);
    if (!hasApiKey || !hasPhoneNumberId) {
      return NextResponse.json(
        { ok: false, error: "Add both the OpenPhone API key and phone number ID before enabling nurture." },
        { status: 400 },
      );
    }
  }

  try {
    await saveStoredNurtureConfig({
      openPhoneApiKey,
      openPhonePhoneNumberId,
      openPhoneWebhookSecret: typeof body.openPhoneWebhookSecret === "string" ? body.openPhoneWebhookSecret : "",
      enabled,
      entrySources: body.entrySources && typeof body.entrySources === "object"
        ? body.entrySources as NurtureEntrySources
        : undefined,
      businessName: typeof body.businessName === "string" ? body.businessName : "",
      timezone: typeof body.timezone === "string" ? body.timezone : "",
      quietHoursStart: typeof body.quietHoursStart === "string" ? body.quietHoursStart : "",
      quietHoursEnd: typeof body.quietHoursEnd === "string" ? body.quietHoursEnd : "",
      exclusions: body.exclusions && typeof body.exclusions === "object"
        ? body.exclusions as NurtureExclusions
        : undefined,
      stopRules: body.stopRules && typeof body.stopRules === "object"
        ? body.stopRules as NurtureStopRules
        : undefined,
      steps: Array.isArray(body.steps) ? body.steps : undefined,
    });

    const [status, dashboard] = await Promise.all([
      getNurtureConfigStatus(),
      getNurtureDashboard().catch(() => null),
    ]);
    return NextResponse.json({
      ok: true,
      status,
      dashboard,
      message: status.enabled
        ? "Quote nurture is enabled. New quote recipients can be enrolled when your quote workflow calls this integration."
        : "Quote nurture settings were saved.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save nurture settings.";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
