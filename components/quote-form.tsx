'use client';

import { useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';

type FieldProps = React.ComponentProps<typeof Input> & {
  label: string;
  name: string;
};

function Field({ label, name, ...props }: FieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        required
        className="h-12 bg-background"
        {...props}
      />
    </div>
  );
}

export function QuoteForm() {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>(
    'idle',
  );

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setState('sending');
    try {
      const payload = Object.fromEntries(formData.entries());
      const response = await fetch('/api/quotes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      setState(response.ok ? 'sent' : 'error');
    } catch {
      setState('error');
    }
  }

  if (state === 'sent') {
    return (
      <output className="grid min-h-[460px] place-items-center rounded-2xl border bg-card p-8 text-center">
        <div>
          <CheckCircle2 className="mx-auto size-14 text-primary" />
          <h3 className="mt-5 font-heading text-3xl font-black">
            You&apos;re on our radar.
          </h3>
          <p className="mx-auto mt-3 max-w-sm leading-relaxed text-muted-foreground">
            Thanks! The K9 Kleanup crew will review your yard details and follow
            up with pricing.
          </p>
          <Button
            className="mt-7 rounded-full"
            variant="outline"
            onClick={() => setState('idle')}
          >
            Send another request
          </Button>
        </div>
      </output>
    );
  }

  return (
    <form
      action="/api/quotes"
      method="post"
      onSubmit={submit}
      className="rounded-2xl border bg-card p-6 sm:p-9"
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label="Your name"
          name="name"
          placeholder="First and last name"
        />
        <Field
          label="ZIP code"
          name="zip"
          placeholder="56301"
          inputMode="numeric"
          pattern="[0-9]{5}(-[0-9]{4})?"
          maxLength={10}
          title="Enter a five-digit ZIP code, optionally followed by a four-digit extension."
        />
        <Field
          label="Email"
          name="email"
          placeholder="you@example.com"
          type="email"
        />
        <Field
          label="Phone"
          name="phone"
          placeholder="(320) 555-0123"
          type="tel"
        />
        <div className="space-y-2">
          <Label htmlFor="dogs">Number of dogs</Label>
          <NativeSelect
            id="dogs"
            name="dogs"
            required
            className="w-full [&_select]:h-12 [&_select]:bg-background"
          >
            <option value="">Choose one</option>
            <option value="1">1 dog</option>
            <option value="2">2 dogs</option>
            <option value="3">3 dogs</option>
            <option value="4+">4 or more</option>
            <option value="shared">Shared / commercial property</option>
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label htmlFor="frequency">Preferred service</Label>
          <NativeSelect
            id="frequency"
            name="frequency"
            required
            className="w-full [&_select]:h-12 [&_select]:bg-background"
          >
            <option value="">Choose one</option>
            <option value="weekly">Weekly</option>
            <option value="biweekly">Every other week</option>
            <option value="monthly">Monthly</option>
            <option value="onetime">One-time / spring cleanup</option>
            <option value="commercial">Commercial service</option>
            <option value="unsure">Not sure yet</option>
          </NativeSelect>
        </div>
      </div>
      <div className="mt-5 space-y-2">
        <Label htmlFor="notes">
          Anything else we should know?{' '}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Textarea
          id="notes"
          name="notes"
          rows={4}
          maxLength={1200}
          className="bg-background"
          placeholder="Yard size, neighborhood, preferred timing, or property details…"
        />
      </div>
      {state === 'error' && (
        <p role="alert" className="mt-4 text-sm font-semibold text-destructive">
          Something went wrong. Please try again or call us directly.
        </p>
      )}
      <Button
        type="submit"
        disabled={state === 'sending'}
        className="mt-6 h-13 w-full rounded-full bg-primary text-base font-extrabold text-white hover:bg-primary/90"
      >
        {state === 'sending' ? (
          <>
            <Loader2 className="size-5 animate-spin" /> Sending…
          </>
        ) : (
          <>Request my free quote</>
        )}
      </Button>
      <p className="mt-4 text-center text-sm leading-relaxed text-muted-foreground">
        Your details are sent to K9 Kleanup to respond to this request. No
        payment or commitment required.
      </p>
    </form>
  );
}
