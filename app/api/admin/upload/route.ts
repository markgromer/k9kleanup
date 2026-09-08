import { env } from 'cloudflare:workers';
import { getAuthorizedAdmin } from '@/lib/admin-auth';

const imageTypes: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export async function POST(request: Request) {
  const user = await getAuthorizedAdmin();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!env.DB || !env.FILES) return Response.json({ error: 'Storage unavailable' }, { status: 503 });

  const formData = await request.formData();
  const file = formData.get('file');
  if (!(file instanceof File)) return Response.json({ error: 'Choose an image.' }, { status: 400 });
  if (!imageTypes[file.type]) return Response.json({ error: 'Use a JPG, PNG, or WebP image.' }, { status: 400 });
  if (file.size > 8 * 1024 * 1024) return Response.json({ error: 'Image must be smaller than 8 MB.' }, { status: 400 });

  const key = `hero-${crypto.randomUUID()}.${imageTypes[file.type]}`;
  await env.FILES.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
    customMetadata: { uploadedBy: user.email },
  });
  await env.DB.prepare(
    'INSERT INTO site_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
  ).bind('hero_image_key', key, Date.now()).run();

  return Response.json({ ok: true, key });
}
