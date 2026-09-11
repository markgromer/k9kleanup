import { NextRequest, NextResponse } from "next/server";

import { checkAdminAuth } from "@/lib/admin-auth";
import { processDueNurtureMessages } from "@/lib/nurture";

async function isAuthorized(req: NextRequest) {
  const token = process.env.NURTURE_EVENT_TOKEN ?? process.env.CRON_SECRET ?? "";
  const header = req.headers.get("authorization") ?? req.headers.get("x-nurture-token") ?? "";
  if (token && header.replace(/^Bearer\s+/i, "").trim() === token) return true;
  return checkAdminAuth(req);
}

export async function GET(req: NextRequest) {
  return POST(req);
}

export async function POST(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const limit = Number(req.nextUrl.searchParams.get("limit") ?? 10);
  try {
    const result = await processDueNurtureMessages(Number.isFinite(limit) ? limit : 10);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Could not process nurture messages.",
    }, { status: 500 });
  }
}
