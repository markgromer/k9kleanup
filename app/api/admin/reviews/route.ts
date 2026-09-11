import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth, unauthorizedResponse } from "@/lib/admin-auth";
import { getIntegrationConnection, saveIntegration } from "@/lib/admin-platform";
import { getReviewSliderData, listGoogleLocations, saveReviewSliderSettings, syncGoogleReviews } from "@/lib/google-reviews";

export async function GET(req: NextRequest) {
  if (!(await checkAdminAuth(req))) return unauthorizedResponse();
  try { const connection = await getIntegrationConnection("google-business-profile"); return NextResponse.json({ ok: true, ...(await getReviewSliderData()), connected: connection.enabled && Boolean(connection.values.refreshToken) }); }
  catch (error) { return failure(error); }
}
export async function PATCH(req: NextRequest) {
  if (!(await checkAdminAuth(req))) return unauthorizedResponse();
  try {
    const body = await req.json() as Record<string, unknown>;
    const settings = await saveReviewSliderSettings(body);
    if (settings.locationName && typeof body.accountName === "string") {
      const connection = await getIntegrationConnection("google-business-profile");
      await saveIntegration("google-business-profile", { enabled: true, values: { ...connection.values, accountId: body.accountName, locationId: settings.locationName.replace(/^locations\//, "") } });
    }
    return NextResponse.json({ ok: true, settings });
  } catch (error) { return failure(error); }
}
export async function POST(req: NextRequest) {
  if (!(await checkAdminAuth(req))) return unauthorizedResponse();
  try { const body = await req.json() as { action?: string }; if (body.action === "locations") return NextResponse.json({ ok: true, locations: await listGoogleLocations() }); if (body.action === "sync") return NextResponse.json({ ok: true, ...(await syncGoogleReviews()) }); return NextResponse.json({ ok: false, error: "Unknown review action." }, { status: 400 }); }
  catch (error) { return failure(error); }
}
function failure(error: unknown) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Review request failed." }, { status: 400 }); }
