import { NextRequest, NextResponse } from "next/server";

import { changeAdminPassword, checkAdminAuth, checkSupportAuth, resetAdminPasswordForSupport, unauthorizedResponse } from "@/lib/admin-auth";
import { getCloudinaryConfigStatus } from "@/lib/cloudinary-config";
import { getNurtureConfigStatus } from "@/lib/nurture-config";

export async function GET(req: NextRequest) {
  if (!(await checkAdminAuth(req))) return unauthorizedResponse();

  const [cloudinaryStatus, nurtureStatus] = await Promise.all([
    getCloudinaryConfigStatus(),
    getNurtureConfigStatus(),
  ]);

  return NextResponse.json({
    ok: true,
    settings: {
      hasCloudinary: cloudinaryStatus.configured,
      cloudinaryStatus,
      hasNurture: nurtureStatus.configured,
      nurtureStatus,
    },
  });
}

export async function PATCH(req: NextRequest) {
  if (!(await checkAdminAuth(req))) return unauthorizedResponse();
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const supportAuthorized = body.action === "support-reset" || await checkSupportAuth(req);
  const result = supportAuthorized
    ? await resetAdminPasswordForSupport(req, String(body.newPassword ?? ""))
    : await changeAdminPassword(String(body.currentPassword ?? ""), String(body.newPassword ?? ""));
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, message: "Admin password updated in encrypted site storage. Any local .reggie/admin-password bootstrap copy is no longer current." });
}
