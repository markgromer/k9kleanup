"use client";

import { ArrowRight, CircleAlert, Receipt } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { adminApiUrl } from "@/lib/admin-api-client";
import styles from "./BillingHomeCard.module.css";

type Summary = { outstandingCents: number; openCount: number; needsAttentionCount: number };

export function BillingHomeCard() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "setup" | "unavailable">("loading");
  useEffect(() => {
    let active = true;
    void fetch(adminApiUrl("/api/admin/billing"), { cache: "no-store", credentials: "include" })
      .then(async (response) => ({ response, payload: await response.json().catch(() => ({})) as { summary?: Summary } }))
      .then(({ response, payload }) => { if (!active) return; if (response.ok && payload.summary) { setSummary(payload.summary); setState("ready"); } else setState(response.status === 503 ? "setup" : "unavailable"); })
      .catch(() => { if (active) setState("unavailable"); });
    return () => { active = false; };
  }, []);
  if (state === "loading") return null;
  return <section className={styles.card}>
    <div className={styles.icon}>{state === "ready" ? <Receipt /> : <CircleAlert />}</div>
    <div className={styles.copy}><span>PAYMENTS</span>{state === "ready" && summary ? <><h2>{formatMoney(summary.outstandingCents)} outstanding</h2><p>{summary.needsAttentionCount} {summary.needsAttentionCount === 1 ? "invoice needs" : "invoices need"} attention · {summary.openCount} open</p></> : <><h2>{state === "setup" ? "Connect Sweep & Go billing" : "Billing is temporarily unavailable"}</h2><p>{state === "setup" ? "Verify the Sweep & Go integration to see live balances." : "The rest of your dashboard is still available."}</p></>}</div>
    <Link href={state === "setup" ? "/admin/integrations#sweep-and-go" : "/admin/billing"}>{state === "ready" ? "Review & collect" : state === "setup" ? "Set up" : "Open billing"}<ArrowRight /></Link>
  </section>;
}
function formatMoney(cents: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100); }
