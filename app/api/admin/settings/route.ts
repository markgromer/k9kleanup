import { env } from 'cloudflare:workers';
import { getAuthorizedAdmin } from '@/lib/admin-auth';

const allowedKeys = new Set(['phone', 'email']);

export async function POST(request: Request) {
  const user = await getAuthorizedAdmin();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!env.DB) return Response.json({ error: 'Database unavailable' }, { status: 503 });

  const input = await request.json() as Record<string, unknown>;
  const statements = Object.entries(input)
    .filter(([key, value]) => allowedKeys.has(key) && typeof value === 'string' && value.trim())
    .map(([key, value]) =>
      env.DB.prepare(
        'INSERT INTO site_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
      ).bind(key, (value as string).trim().slice(0, 200), Date.now()),
    );

  if (!statements.length) return Response.json({ error: 'No valid settings' }, { status: 400 });
  await env.DB.batch(statements);
  return Response.json({ ok: true });
}
