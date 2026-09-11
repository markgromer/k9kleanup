import { NextRequest } from "next/server";

import { getMediaDelivery } from "@/lib/admin-platform";

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^[a-f0-9-]{30,40}$/i.test(id)) return new Response("Not found", { status: 404 });
  const delivery = await getMediaDelivery(id, req.headers.get("if-none-match") ?? "").catch(() => null);
  if (!delivery) return new Response("Not found", { status: 404 });
  const { object, row } = delivery;
  const headers = new Headers();
  object.writeHttpMetadata?.(headers);
  if (object.httpEtag) headers.set("ETag", object.httpEtag);
  headers.set("Content-Type", row.content_type);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  headers.set("Content-Security-Policy", "default-src 'none'; sandbox");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Content-Disposition", `inline; filename="${row.file_name.replace(/["\\\r\n]/g, "_")}"`);
  if (!object.body) return new Response(null, { status: 304, headers });
  return new Response(object.body, { headers });
}
