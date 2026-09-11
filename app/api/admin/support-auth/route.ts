import { NextRequest, NextResponse } from "next/server";

import { checkSupportAuth, unauthorizedResponse } from "@/lib/admin-auth";

export async function GET(req: NextRequest) {
  if (!(await checkSupportAuth(req))) return unauthorizedResponse();
  return NextResponse.json({ ok: true });
}
