import { NextRequest, NextResponse } from "next/server";

import { checkAdminAuth, unauthorizedResponse } from "@/lib/admin-auth";
import { defaultQuoteSettings, normalizeQuoteSettings, readAdminSetting, writeAdminSetting } from "@/lib/admin-platform";
import { getSweepAndGoAccess } from "@/lib/sweep-and-go-integration";

export async function GET(req: NextRequest) {
  if (!(await checkAdminAuth(req))) return unauthorizedResponse();
  try {
    const settings = normalizeQuoteSettings({ ...defaultQuoteSettings, ...(await readAdminSetting("quote-tool", defaultQuoteSettings)) });
    const access = await getSweepAndGoAccess();
    const locked = settings.crm.provider === "sweep-and-go" && !access.verified;
    return NextResponse.json({ ok: true, locked, access, settings: locked ? undefined : settings });
  }
  catch (error) { return NextResponse.json({ ok: false, error: message(error) }, { status: 503 }); }
}

export async function PATCH(req: NextRequest) {
  if (!(await checkAdminAuth(req))) return unauthorizedResponse();
  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const settings = normalizeQuoteSettings(body);
    if (settings.crm.provider === "sweep-and-go" && !(await getSweepAndGoAccess()).verified) {
      return NextResponse.json({ ok: false, error: "Verify the Sweep & Go account slug and API token before saving these quote settings." }, { status: 403 });
    }
    await writeAdminSetting("quote-tool", settings);
    return NextResponse.json({ ok: true, settings });
  } catch (error) { return NextResponse.json({ ok: false, error: message(error) }, { status: 400 }); }
}

function message(error: unknown) { return error instanceof Error ? error.message : "Could not save quote settings."; }
