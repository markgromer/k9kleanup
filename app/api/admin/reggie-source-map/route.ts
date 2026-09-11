import { NextRequest, NextResponse } from "next/server";

import { reggieSourceMap } from "@/generated/reggie-source-map";
import { checkAdminAuth, unauthorizedResponse } from "@/lib/admin-auth";

export async function GET(req: NextRequest) {
  if (!(await checkAdminAuth(req))) return unauthorizedResponse();
  return NextResponse.json({ ok: true, generated: reggieSourceMap.length > 0, entries: reggieSourceMap }, {
    headers: { "Cache-Control": "private, max-age=60" },
  });
}
