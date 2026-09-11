import { NextRequest, NextResponse } from "next/server";

import { checkAdminAuth, unauthorizedResponse } from "@/lib/admin-auth";
import { deleteContent, listContent, listPageInventory, saveContent } from "@/lib/admin-platform";
import { getLandingJourneySummary } from "@/lib/landing-journeys";

export async function GET(req: NextRequest) {
  if (!(await checkAdminAuth(req))) return unauthorizedResponse();
  const contentType = req.nextUrl.searchParams.get("type") ?? "";
  try { return NextResponse.json({ ok: true, items: await listContent(contentType), pages: contentType === "landing-page" ? listPageInventory() : [], journeys: contentType === "landing-page" ? await getLandingJourneySummary(Number(req.nextUrl.searchParams.get("days") || 30)) : undefined }); }
  catch (error) {
    if (contentType === "landing-page") return NextResponse.json({ ok: true, items: [], pages: listPageInventory(), storageReady: false, warning: error instanceof Error ? error.message : "Content brief storage is unavailable." });
    return failure(error, 503);
  }
}

export async function POST(req: NextRequest) {
  if (!(await checkAdminAuth(req))) return unauthorizedResponse();
  try { const body = await req.json() as Record<string, unknown>; return NextResponse.json({ ok: true, item: await saveContent(body) }); }
  catch (error) { return failure(error, 400); }
}

export async function DELETE(req: NextRequest) {
  if (!(await checkAdminAuth(req))) return unauthorizedResponse();
  try { const body = await req.json() as Record<string, unknown>; await deleteContent(String(body.id ?? "")); return NextResponse.json({ ok: true }); }
  catch (error) { return failure(error, 400); }
}

function failure(error: unknown, status: number) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Content request failed." }, { status }); }
