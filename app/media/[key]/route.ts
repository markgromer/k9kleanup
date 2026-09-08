import { env } from 'cloudflare:workers';

export async function GET(_request: Request, { params }: { params: Promise<{ key: string }> }) {
  if (!env.FILES) return new Response('Not found', { status: 404 });
  const { key } = await params;
  const object = await env.FILES.get(key);
  if (!object) return new Response('Not found', { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('cache-control', 'public, max-age=3600');
  return new Response(object.body, { headers });
}
