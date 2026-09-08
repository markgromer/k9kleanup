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

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
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

  if (!data.name || !/^\d{5}(-\d{4})?$/.test(data.zip) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email) || data.phone.replace(/\D/g, '').length < 10 || !['1', '2', '3', '4+', 'shared'].includes(data.dogs) || !['weekly', 'biweekly', 'monthly', 'onetime', 'commercial', 'unsure'].includes(data.frequency)) {
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
