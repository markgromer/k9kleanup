import { env } from 'cloudflare:workers';

const clean = (value: unknown, max: number) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

export async function POST(request: Request) {
  const isNativeForm = (request.headers.get('content-type') || '').includes(
    'application/x-www-form-urlencoded',
  );
  const failure = (message: string, status: number) =>
    isNativeForm
      ? new Response(
          `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Quote request needs attention | K9 Kleanup</title><meta name="robots" content="noindex"></head><body style="font-family:Arial,sans-serif;max-width:640px;margin:60px auto;padding:24px;line-height:1.6;background:#faf8f3;color:#121110"><h1>Your request wasn’t sent.</h1><p>${message}</p><p>Please go back to check your details, or contact the team directly.</p><a href="/contact">Return to the quote form</a></body></html>`,
          {
            status,
            headers: {
              'content-type': 'text/html; charset=utf-8',
              'cache-control': 'no-store',
            },
          },
        )
      : Response.json({ error: message }, { status });
  if (!env.DB)
    return failure(
      'Service is temporarily unavailable. Please try again.',
      503,
    );

  let input: Record<string, unknown>;
  try {
    input = isNativeForm
      ? Object.fromEntries(await request.formData())
      : await request.json();
  } catch {
    return failure('We could not read the submitted request.', 400);
  }

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return failure('We could not read the submitted request.', 400);
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

  if (
    !data.name ||
    !/^\d{5}(-\d{4})?$/.test(data.zip) ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email) ||
    data.phone.replace(/\D/g, '').length < 10 ||
    !['1', '2', '3', '4+', 'shared'].includes(data.dogs) ||
    ![
      'weekly',
      'biweekly',
      'monthly',
      'onetime',
      'commercial',
      'unsure',
    ].includes(data.frequency)
  ) {
    return failure(
      'Please complete all required fields with a valid ZIP code, email, and phone number.',
      400,
    );
  }

  try {
    await env.DB.prepare(
      'INSERT INTO quote_requests (id, name, zip, email, phone, dogs, frequency, notes, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(
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
      )
      .run();
  } catch {
    return failure(
      'We could not save your request. Please try again or contact the team.',
      503,
    );
  }

  if (isNativeForm)
    return new Response(null, {
      status: 303,
      headers: { location: '/thank-you' },
    });
  return Response.json({ ok: true });
}
