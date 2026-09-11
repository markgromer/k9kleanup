import { NextResponse } from "next/server";
import { getReviewSliderData } from "@/lib/google-reviews";
export async function GET() { try { const data = await getReviewSliderData(); return NextResponse.json(data.settings.enabled ? { ok: true, ...data } : { ok: true, settings: data.settings, reviews: [] }, { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=3600" } }); } catch { return NextResponse.json({ ok: true, reviews: [] }); } }
