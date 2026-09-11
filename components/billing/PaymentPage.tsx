"use client";

import { CardElement, Elements, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { CheckCircle2, CreditCard, LoaderCircle, LockKeyhole, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";

import { dashboardSiteProfile } from "@/lib/dashboard-site-profile";
import styles from "./PaymentPage.module.css";

type PaymentData = {
  ok: boolean; paid: boolean; status: string; invoiceNumber?: string; customerName?: string; commercialLocation?: string;
  currentBalanceCents?: number; gateway?: "stripe" | "fts" | "none"; paymentAvailable: boolean; unavailableReason?: string;
  stripePublishableKey?: string;
};

export function PaymentPage({ token }: { token: string }) {
  const [data, setData] = useState<PaymentData | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void fetch(`/api/billing/payment/${encodeURIComponent(token)}`, { cache: "no-store", credentials: "omit" })
      .then(async (response) => ({ response, payload: await response.json().catch(() => ({})) as PaymentData & { error?: string } }))
      .then(({ response, payload }) => {
        if (!active) return;
        if (!response.ok) setError(payload.error || "This payment link is unavailable.");
        else setData(payload);
      })
      .catch(() => { if (active) setError("Payment information is temporarily unavailable."); });
    return () => { active = false; };
  }, [token]);

  return <main className={styles.page}>
    <section className={styles.card}>
      <header className={styles.brand}><span>{dashboardSiteProfile.name.slice(0, 1).toUpperCase()}</span><div><strong>{dashboardSiteProfile.name}</strong><small>Secure invoice payment</small></div></header>
      {!data && !error ? <State icon={<LoaderCircle className={styles.spin} />} title="Checking your invoice" detail="Getting the current balance from Sweep & Go." /> : null}
      {error ? <State icon={<LockKeyhole />} title="Payment link unavailable" detail={error} /> : null}
      {data?.paid ? <State success icon={<CheckCircle2 />} title="Payment already completed" detail="This invoice has no remaining balance. Thank you." /> : null}
      {data && !data.paid ? <>
        <div className={styles.invoiceHeading}><p>Payment due</p><h1>{data.customerName || "Invoice payment"}</h1>{data.commercialLocation ? <span>{data.commercialLocation}</span> : null}</div>
        <div className={styles.amount}><span>Current balance</span><strong>{formatMoney(data.currentBalanceCents ?? 0)}</strong><small>Invoice #{data.invoiceNumber}</small></div>
        {data.paymentAvailable && data.stripePublishableKey ? <StripePaymentForm token={token} data={data} /> : <State icon={<CreditCard />} title="Card payment unavailable" detail={data.unavailableReason || "Please contact the business for payment help."} />}
      </> : null}
      <footer><ShieldCheck size={16} /><span>Card details go directly to Stripe&apos;s hosted fields and are not sent to or stored by REGGIE.</span></footer>
    </section>
  </main>;
}

function StripePaymentForm({ token, data }: { token: string; data: PaymentData }) {
  const stripePromise = useMemo(() => loadStripe(data.stripePublishableKey ?? ""), [data.stripePublishableKey]);
  return <Elements stripe={stripePromise}><PaymentForm token={token} amountCents={data.currentBalanceCents ?? 0} /></Elements>;
}

function PaymentForm({ token, amountCents }: { token: string; amountCents: number }) {
  const stripe = useStripe();
  const elements = useElements();
  const [nameOnCard, setNameOnCard] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [complete, setComplete] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!stripe || !elements || !nameOnCard.trim()) return;
    const card = elements.getElement(CardElement);
    if (!card) return;
    setSubmitting(true);
    setMessage("");
    try {
      const tokenized = await stripe.createToken(card, { name: nameOnCard.trim() });
      if (tokenized.error || !tokenized.token) { setMessage(tokenized.error?.message || "Stripe could not tokenize this card."); return; }
      const response = await fetch(`/api/billing/payment/${encodeURIComponent(token)}`, {
        method: "POST", cache: "no-store", credentials: "omit", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stripeToken: tokenized.token.id, nameOnCard: nameOnCard.trim() }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string; paid?: boolean; confirming?: boolean };
      if (!response.ok) { setMessage(payload.error || "The payment could not be completed."); return; }
      if (payload.paid) setComplete(true);
      else setMessage("Your payment is being confirmed. Please do not submit it again.");
    } catch {
      setMessage("Payment is temporarily unavailable. Please do not retry until the invoice is checked.");
    } finally {
      setSubmitting(false);
    }
  }

  if (complete) return <State success icon={<CheckCircle2 />} title="Payment complete" detail="Thank you. Sweep & Go confirmed that the invoice is paid." />;
  return <form className={styles.form} onSubmit={submit}>
    <div className={styles.field} role="group" aria-labelledby="billing-card-label"><span id="billing-card-label">Card details</span><div className={styles.stripeField}><CardElement options={{ hidePostalCode: false, style: { base: { fontSize: "17px", color: "#15211b", "::placeholder": { color: "#77837c" } } } }} /></div></div>
    <div className={styles.field}><label htmlFor="billing-card-name">Name on card</label><input id="billing-card-name" value={nameOnCard} onChange={(event) => setNameOnCard(event.target.value.slice(0, 120))} autoComplete="cc-name" maxLength={120} /></div>
    {message ? <p className={styles.error} role="alert">{message}</p> : null}
    <button type="submit" disabled={!stripe || submitting || !nameOnCard.trim()}>{submitting ? <><LoaderCircle className={styles.spin} />Confirming payment</> : <><LockKeyhole />Pay {formatMoney(amountCents)}</>}</button>
    <p className={styles.recheck}>The balance is checked with Sweep & Go again immediately before payment.</p>
  </form>;
}

function State({ icon, title, detail, success = false }: { icon: ReactNode; title: string; detail: string; success?: boolean }) { return <div className={`${styles.state} ${success ? styles.success : ""}`}>{icon}<h1>{title}</h1><p>{detail}</p></div>; }
function formatMoney(cents: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100); }
