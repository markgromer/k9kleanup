import { env } from 'cloudflare:workers';

export type SiteSettings = {
  phone: string;
  email: string;
  heroImageKey: string;
};

export type QuoteRequest = {
  id: string;
  name: string;
  zip: string;
  email: string;
  phone: string;
  dogs: string;
  frequency: string;
  notes: string;
  status: string;
  createdAt: number;
};

export const defaultSettings: SiteSettings = {
  phone: '(320) 493-9076',
  email: 'tylerb@k9kleanup.co',
  heroImageKey: '',
};

export async function getSiteSettings(): Promise<SiteSettings> {
  if (!env.DB) return defaultSettings;
  try {
    const result = await env.DB.prepare('SELECT key, value FROM site_settings').all<{ key: string; value: string }>();
    const values = Object.fromEntries(result.results.map((row) => [row.key, row.value]));
    return {
      phone: values.phone || defaultSettings.phone,
      email: values.email || defaultSettings.email,
      heroImageKey: values.hero_image_key || '',
    };
  } catch {
    return defaultSettings;
  }
}

export async function getRecentQuotes(): Promise<QuoteRequest[]> {
  if (!env.DB) return [];
  try {
    const result = await env.DB.prepare(
      'SELECT id, name, zip, email, phone, dogs, frequency, notes, status, created_at AS createdAt FROM quote_requests ORDER BY created_at DESC LIMIT 50',
    ).all<QuoteRequest>();
    return result.results;
  } catch {
    return [];
  }
}
