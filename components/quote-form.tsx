'use client';

import { useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';

type FieldProps = React.ComponentProps<typeof Input> & { label: string; name: string };

function Field({ label, name, ...props }: FieldProps) {
  return <div className="space-y-2"><Label htmlFor={name}>{label}</Label><Input id={name} name={name} required className="h-12 bg-background" {...props} /></div>;
}

export function QuoteForm() {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  async function submit(formData: FormData) {
    setState('sending');
    const payload = Object.fromEntries(formData.entries());
    const response = await fetch('/api/quotes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    setState(response.ok ? 'sent' : 'error');
  }

  if (state === 'sent') {
    return (
      <div className="grid min-h-[460px] place-items-center rounded-[2rem] bg-card p-8 text-center shadow-[0_24px_70px_rgba(64,49,20,.12)]">
        <div>
          <CheckCircle2 className="mx-auto size-14 text-primary" />
          <h3 className="mt-5 font-heading text-3xl font-black">You&apos;re on our radar.</h3>
          <p className="mx-auto mt-3 max-w-sm leading-relaxed text-muted-foreground">Thanks! The K9 Kleanup crew will review your yard details and follow up with pricing.</p>
          <Button className="mt-7 rounded-full" variant="outline" onClick={() => setState('idle')}>Send another request</Button>
        </div>
      </div>
    );
  }

  return (
    <form action={submit} className="rounded-[2rem] bg-card p-6 shadow-[0_24px_70px_rgba(64,49,20,.12)] sm:p-9">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Your name" name="name" placeholder="First and last name" />
        <Field label="ZIP code" name="zip" placeholder="56301" inputMode="numeric" maxLength={10} />
        <Field label="Email" name="email" placeholder="you@example.com" type="email" />
        <Field label="Phone" name="phone" placeholder="(320) 555-0123" type="tel" />
        <div className="space-y-2">
          <Label htmlFor="dogs">Number of dogs</Label>
          <NativeSelect id="dogs" name="dogs" required className="w-full [&_select]:h-12 [&_select]:bg-background">
            <option value="">Choose one</option><option value="1">1 dog</option><option value="2">2 dogs</option><option value="3">3 dogs</option><option value="4+">4 or more</option>
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label htmlFor="frequency">Preferred service</Label>
          <NativeSelect id="frequency" name="frequency" required className="w-full [&_select]:h-12 [&_select]:bg-background">
            <option value="">Choose one</option><option value="weekly">Weekly</option><option value="biweekly">Every other week</option><option value="onetime">One-time cleanup</option><option value="unsure">Not sure yet</option>
          </NativeSelect>
        </div>
      </div>
      <div className="mt-5 space-y-2"><Label htmlFor="notes">Anything else we should know? <span className="font-normal text-muted-foreground">(optional)</span></Label><Textarea id="notes" name="notes" rows={4} className="bg-background" placeholder="Gate instructions, yard size, timing, or questions…" /></div>
      {state === 'error' && <p className="mt-4 text-sm font-semibold text-destructive">Something went wrong. Please try again or call us directly.</p>}
      <Button type="submit" disabled={state === 'sending'} className="mt-6 h-13 w-full rounded-full bg-primary text-base font-extrabold text-white hover:bg-primary/90">
        {state === 'sending' ? <><Loader2 className="size-5 animate-spin" /> Sending…</> : <>Request my free quote</>}
      </Button>
      <p className="mt-4 text-center text-xs leading-relaxed text-muted-foreground">No spam, no obligation. Just straightforward local service.</p>
    </form>
  );
}
