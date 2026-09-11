import { NextRequest, NextResponse } from "next/server";

import { checkAdminAuth, unauthorizedResponse } from "@/lib/admin-auth";
import { checkPagePath, listPageInventory } from "@/lib/admin-platform";

export async function GET(req: NextRequest) {
  if (!(await checkAdminAuth(req))) return unauthorizedResponse();
  return NextResponse.json({ ok: true, pages: listPageInventory() });
}

export async function POST(req: NextRequest) {
  if (!(await checkAdminAuth(req))) return unauthorizedResponse();
  try {
    const body = await req.json() as Record<string, unknown>;
    const result = checkPagePath(body.path);
    return NextResponse.json({ ok: result.ok, validation: result }, { status: result.ok ? 200 : 409 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Page-path validation failed." }, { status: 400 });
  }
}
