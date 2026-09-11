import { NextRequest, NextResponse } from "next/server";

import { checkAdminAuth, unauthorizedResponse } from "@/lib/admin-auth";
import { deleteRanking, listRankings, saveRanking } from "@/lib/admin-platform";
import { getIntegrationSyncRecord, type SearchConsoleSnapshot } from "@/lib/google-reporting";

export async function GET(req: NextRequest) {
  if (!(await checkAdminAuth(req))) return unauthorizedResponse();
  try {
    const [keywords, searchConsole] = await Promise.all([
      listRankings(),
      getIntegrationSyncRecord<SearchConsoleSnapshot>("google-search-console"),
    ]);
    const queries = searchConsole.data?.provider === "google-search-console" ? searchConsole.data.topQueries : [];
    const queryMap = new Map(queries.map((item) => [normalizeKeyword(item.query), item]));
    const merged = keywords.map((item) => {
      if (item.device !== "all" || item.location !== "Google Search Console") return item;
      const current = queryMap.get(normalizeKeyword(item.keyword));
      return current ? { ...item, latestPosition: current.position, previousPosition: current.previousPosition, checkedAt: searchConsole.lastSuccessAt, source: "google-search-console", clicks: current.clicks, impressions: current.impressions } : item;
    });
    const tracked = new Set(keywords.map((item) => normalizeKeyword(item.keyword)));
    const discovered = queries.filter((item) => item.impressions >= 10 && !tracked.has(normalizeKeyword(item.query))).slice(0, 20);
    return NextResponse.json({ ok: true, keywords: merged, discovered, searchConsole: { state: searchConsole.state, lastSyncedAt: searchConsole.lastSuccessAt, error: searchConsole.error } });
  } catch (error) { return failure(error, 503); }
}

export async function POST(req: NextRequest) {
  if (!(await checkAdminAuth(req))) return unauthorizedResponse();
  try {
    const body = await req.json() as Record<string, unknown>;
    if (body.action === "import-search-console") {
      const [existing, searchConsole] = await Promise.all([
        listRankings(),
        getIntegrationSyncRecord<SearchConsoleSnapshot>("google-search-console"),
      ]);
      const queries = searchConsole.data?.provider === "google-search-console" ? searchConsole.data.topQueries : [];
      if (!queries.length) throw new Error("Synchronize Google Search Console before importing tracked searches.");
      const tracked = new Set(existing.map((item) => normalizeKeyword(item.keyword)));
      const candidates = queries.filter((item) => item.impressions >= 10 && !tracked.has(normalizeKeyword(item.query))).slice(0, 20);
      for (const item of candidates) {
        await saveRanking({ keyword: item.query, location: "Google Search Console", device: "all", latestPosition: item.position, previousPosition: item.previousPosition, checkedAt: searchConsole.lastSuccessAt });
      }
      return NextResponse.json({ ok: true, imported: candidates.length });
    }
    return NextResponse.json({ ok: true, keyword: await saveRanking(body) });
  } catch (error) { return failure(error, 400); }
}

export async function DELETE(req: NextRequest) {
  if (!(await checkAdminAuth(req))) return unauthorizedResponse();
  try { const body = await req.json() as Record<string, unknown>; await deleteRanking(String(body.id ?? "")); return NextResponse.json({ ok: true }); }
  catch (error) { return failure(error, 400); }
}

function normalizeKeyword(value: string) { return value.trim().toLowerCase(); }
function failure(error: unknown, status: number) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Ranking request failed." }, { status }); }
