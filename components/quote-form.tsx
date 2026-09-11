'use client';

import { useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';

type Options = { ok: boolean; inServiceArea: boolean; error?: string; dogs: number[]; frequencies: Array<{ value: string; label: string }>; lastTimes: Array<{ value: string; label: string }> };
type Price = { ok?: boolean; error?: string; perCleanup?: number | null; monthlyPrice?: number | null };
const usd = (value: number | null | undefined) => typeof value === 'number' ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value) : '';

export function QuoteForm() {
  const [step, setStep] = useState<'zip' | 'details' | 'price' | 'done'>('zip');
  const [zip, setZip] = useState('');
  const [options, setOptions] = useState<Options | null>(null);
  const [price, setPrice] = useState<Price | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ firstName: '', email: '', phone: '', address: '', numberOfDogs: '1', frequency: '', lastCleaned: 'one_week', smsConsent: false });
  const update = (key: keyof typeof form, value: string | boolean) => setForm((current) => ({ ...current, [key]: value }));

  async function loadOptions(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const response = await fetch(`/api/quote/options?zip=${encodeURIComponent(zip.trim())}`, { cache: 'no-store' });
      const next = await response.json() as Options;
      if (!response.ok || !next.ok || !next.inServiceArea) throw new Error(next.error || 'We do not currently serve that ZIP code.');
      setOptions(next);
      setForm((current) => ({ ...current, numberOfDogs: String(next.dogs[0] ?? 1), frequency: next.frequencies[0]?.value ?? '', lastCleaned: next.lastTimes[0]?.value ?? 'one_week' }));
      setStep('details');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'We could not check that ZIP code.'); } finally { setBusy(false); }
  }

  async function buildQuote(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.smsConsent) { setError('Please confirm K9 Kleanup may contact you about this quote.'); return; }
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/quote/price', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ zipCode: zip, ...form }) });
      const next = await response.json() as Price;
      if (!response.ok || next.ok === false) throw new Error(next.error || 'We could not build your quote.');
      setPrice(next); setStep('price');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'We could not build your quote.'); } finally { setBusy(false); }
  }

  async function acceptQuote() {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/quote/lead', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ zipCode: zip, ...form }) });
      const result = await response.json() as { ok?: boolean; error?: string; redirectUrl?: string };
      if (!response.ok || result.ok === false) throw new Error(result.error || 'We could not send your request.');
      if (result.redirectUrl) window.location.assign(result.redirectUrl); else setStep('done');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'We could not send your request.'); } finally { setBusy(false); }
  }

  if (step === 'done') return <output className="grid min-h-[460px] place-items-center rounded-2xl border bg-card p-8 text-center"><div><CheckCircle2 className="mx-auto size-14 text-primary" /><h3 className="mt-5 font-heading text-3xl font-black">Your quote is on its way.</h3><p className="mx-auto mt-3 max-w-sm leading-relaxed text-muted-foreground">K9 Kleanup received your details through Sweep &amp; Go and will help get your service started.</p></div></output>;
  if (step === 'price') return <section className="rounded-2xl border bg-card p-6 sm:p-9"><p className="text-sm font-bold uppercase tracking-wider text-primary">Your Sweep &amp; Go quote</p><h3 className="mt-2 font-heading text-3xl font-black">Your yard is covered.</h3><div className="mt-6 rounded-xl bg-secondary p-5"><p className="text-sm text-muted-foreground">Per cleanup</p><strong className="mt-1 block text-4xl text-primary">{usd(price?.perCleanup) || 'Custom quote'}</strong>{price?.monthlyPrice !== null && price?.monthlyPrice !== undefined ? <p className="mt-2 text-sm text-muted-foreground">{usd(price.monthlyPrice)} estimated monthly</p> : null}</div><p className="mt-5 text-sm text-muted-foreground">Final pricing may change if yard conditions are different from the quote details.</p>{error ? <p role="alert" className="mt-4 text-sm font-semibold text-destructive">{error}</p> : null}<Button type="button" onClick={() => void acceptQuote()} disabled={busy} className="mt-6 h-13 w-full rounded-full bg-primary text-base font-extrabold text-white hover:bg-primary/90">{busy ? <><Loader2 className="size-5 animate-spin" /> Sending…</> : 'Start service with this quote'}</Button><button type="button" onClick={() => { setError(''); setStep('details'); }} className="mt-4 w-full text-sm font-bold underline">Change my details</button></section>;
  if (step === 'zip') return <form onSubmit={loadOptions} className="rounded-2xl border bg-card p-6 sm:p-9"><p className="text-sm font-bold uppercase tracking-wider text-primary">Instant Sweep &amp; Go quote</p><h3 className="mt-2 font-heading text-3xl font-black">Let’s check your yard.</h3><p className="mt-3 leading-relaxed text-muted-foreground">Enter your ZIP code to see live K9 Kleanup service options and pricing.</p><div className="mt-6 space-y-2"><Label htmlFor="quote-zip">ZIP code</Label><Input id="quote-zip" value={zip} onChange={(event) => setZip(event.target.value)} inputMode="numeric" pattern="[0-9]{5}" maxLength={5} placeholder="56301" required className="h-12 bg-background" /></div>{error ? <p role="alert" className="mt-4 text-sm font-semibold text-destructive">{error}</p> : null}<Button type="submit" disabled={busy} className="mt-6 h-13 w-full rounded-full bg-primary text-base font-extrabold text-white hover:bg-primary/90">{busy ? <><Loader2 className="size-5 animate-spin" /> Checking…</> : 'See my quote'}</Button></form>;
  return <form onSubmit={buildQuote} className="rounded-2xl border bg-card p-6 sm:p-9"><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-bold uppercase tracking-wider text-primary">Step 2 of 2</p><h3 className="mt-2 font-heading text-3xl font-black">Tell us about your yard.</h3></div><button type="button" className="text-sm font-bold underline" onClick={() => setStep('zip')}>Change ZIP</button></div><div className="mt-6 grid gap-5 sm:grid-cols-2"><Select label="Number of dogs" id="quote-dogs" value={form.numberOfDogs} onChange={(value) => update('numberOfDogs', value)} items={options?.dogs.map((dog) => ({ value: String(dog), label: `${dog} ${dog === 1 ? 'dog' : 'dogs'}` })) ?? []} /><Select label="Cleanup schedule" id="quote-frequency" value={form.frequency} onChange={(value) => update('frequency', value)} items={options?.frequencies ?? []} /><Select label="Last thorough cleanup" id="quote-cleaned" value={form.lastCleaned} onChange={(value) => update('lastCleaned', value)} items={options?.lastTimes ?? []} /><Text label="First name" id="quote-name" value={form.firstName} onChange={(value) => update('firstName', value)} /><Text label="Email" id="quote-email" type="email" value={form.email} onChange={(value) => update('email', value)} /><Text label="Mobile phone" id="quote-phone" type="tel" value={form.phone} onChange={(value) => update('phone', value)} /></div><div className="mt-5"><Text label="Service address" id="quote-address" value={form.address} onChange={(value) => update('address', value)} /></div><label className="mt-5 flex gap-3 text-sm leading-relaxed"><input type="checkbox" checked={form.smsConsent} onChange={(event) => update('smsConsent', event.target.checked)} className="mt-1 size-4" />I agree that K9 Kleanup may contact me by text or phone about this quote.</label>{error ? <p role="alert" className="mt-4 text-sm font-semibold text-destructive">{error}</p> : null}<Button type="submit" disabled={busy} className="mt-6 h-13 w-full rounded-full bg-primary text-base font-extrabold text-white hover:bg-primary/90">{busy ? <><Loader2 className="size-5 animate-spin" /> Building quote…</> : 'Show my price'}</Button></form>;
}

function Text({ label, id, value, onChange, type = 'text' }: { label: string; id: string; value: string; onChange: (value: string) => void; type?: string }) { return <div className="space-y-2"><Label htmlFor={id}>{label}</Label><Input id={id} type={type} value={value} onChange={(event) => onChange(event.target.value)} required className="h-12 bg-background" /></div>; }
function Select({ label, id, value, onChange, items }: { label: string; id: string; value: string; onChange: (value: string) => void; items: Array<{ value: string; label: string }> }) { return <div className="space-y-2"><Label htmlFor={id}>{label}</Label><NativeSelect id={id} value={value} onChange={(event) => onChange(event.target.value)} className="w-full [&_select]:h-12 [&_select]:bg-background">{items.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</NativeSelect></div>; }
