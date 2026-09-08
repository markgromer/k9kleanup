import { env } from 'cloudflare:workers';

const clean = (value: unknown, max: number) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

export async function POST(request: Request) {
  if (!env.DB) return Response.json({ error: 'Service unavailable' }, { status: 503 });

  let input: Record<string, unknown>;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: 'Invalid request' }, { status: 400 });
  }

  const data = {
    name: clean(input.name, 120),
    zip: clean(input.zip, 12),
    email: clean(input.email, 160),
    phone: clean(input.phone, 40),
    dogs: clean(input.dogs, 12),
    frequency: clean(input.frequency, 30),
    notes: clean(input.notes, 1200),
  };

  if (!data.name || !data.zip || !data.email.includes('@') || !data.phone || !data.dogs || !data.frequency) {
    return Response.json({ error: 'Please complete all required fields.' }, { status: 400 });
  }

  await env.DB.prepare(
    'INSERT INTO quote_requests (id, name, zip, email, phone, dogs, frequency, notes, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    crypto.randomUUID(),
    data.name,
    data.zip,
    data.email,
    data.phone,
    data.dogs,
    data.frequency,
    data.notes,
    'new',
    Date.now(),
  ).run();

  return Response.json({ ok: true });
}
