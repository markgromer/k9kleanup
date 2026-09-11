import { NextRequest, NextResponse } from "next/server";

import { checkAdminAuth, unauthorizedResponse } from "@/lib/admin-auth";
import { getDashboardData } from "@/lib/admin-platform";

export async function GET(req: NextRequest) {
  if (!(await checkAdminAuth(req))) return unauthorizedResponse();
  try { return NextResponse.json({ ok: true, dashboard: await getDashboardData() }); }
  catch (error) { return NextResponse.json({ ok: false, error: message(error) }, { status: 503 }); }
}

function message(error: unknown) { return error instanceof Error ? error.message : "Could not load the admin dashboard."; }
