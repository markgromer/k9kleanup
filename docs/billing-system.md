# Sweep & Go billing and accounts receivable

## Purpose and financial authority

The Billing workspace gives an owner one operational view of open Sweep & Go invoices, recent payments, collection requests, and exceptions. Sweep & Go remains the only financial system of record. REGGIE stores only request lifecycle, delivery metadata, an opaque-token-to-invoice relationship, rate limits, and sanitized events. Every displayed or charged balance is refreshed from `check_invoice`; browser-supplied amounts are never accepted.

## Supported runtime and ownership

The canonical implementation is the managed Next App Router runtime and its Cloudflare Worker/Vinext deployment, backed by `INTEGRATIONS_DB`. The normal installer and full fleet upgrade own the page, components, API routes, libraries, docs, dependencies, and managed hashes. Render and legacy Pages Functions adapters do not have the D1 transaction interface required by this feature and therefore must not expose Billing; the installer filters these files on those targets. This is an explicit fail-closed compatibility boundary, not an emulated accounting store. Migrate a site to the managed Worker runtime before enabling Billing.

## Setup

1. In **Admin → Integrations → Sweep & Go**, supply the account slug and API token, enable the integration, and verify it. The client permits only the official HTTPS API host (localhost is accepted only outside production).
2. Configure the `INTEGRATIONS_DB` D1 binding and run the site once; the billing tables and indexes are created idempotently.
3. For SMS delivery, configure and enable OpenPhone with its API key and phone-number ID. The same shared OpenPhone transport serves nurture and Billing.
4. Set `REGGIE_PUBLIC_ORIGIN` to the exact public HTTPS origin used in payment links.
5. For Stripe-backed one-time payments, set the Sweep & Go integration's publishable key and set **Stripe account relationship confirmed** to `confirmed` only after the operator has verified with Sweep & Go/Stripe that the publishable key tokenizes for the same connected merchant account. Until then both **Take payment** and public card entry stay disabled. Never configure a Stripe secret key in REGGIE.
6. Optionally configure the Sweep & Go webhook secret and point Sweep & Go at `/api/billing/sweep-and-go-webhook`. Webhooks are reconciliation signals only; handlers re-read Sweep & Go before changing local lifecycle state.

Stripe.js is loaded by the official `@stripe/stripe-js` package from `https://js.stripe.com`; a site Content Security Policy must allow Stripe's documented script, frame, and network origins. The public payment page declares `noindex`, `nofollow`, and `no-referrer`.

## Owner workflow

Open **Admin → Billing**. The summary shows current open balance, invoices needing attention, recently paid value, and unreconciled requests. Search by customer, commercial account/location, or invoice; switch between open, attention, and recent-payment views.

**Send request** resolves contacts from Sweep & Go. Residential matching is exact and stops on ambiguity. Commercial contacts prefer the explicit billing contact and priority, while preserving invoice-email/channel/marketing metadata. The owner may choose a contact, enter a one-off recipient, send by OpenPhone SMS, or copy the secure URL. Email is visibly unavailable until a transactional email provider is implemented.

**Take payment** creates a short-lived owner payment request and opens the same secure page. The page rechecks the invoice and gateway before showing card entry. Stripe Elements owns card fields, Stripe returns a token, and REGGIE sends only the token and name on card to Sweep & Go.

Support users have read-only Billing access. Creating, sending, revoking, reconciling, or charging requires an owner session and a same-origin browser mutation.

## Data model and lifecycle

`reggie_billing_payment_requests` stores provider, invoice number, SHA-256 token hash, request type, selected recipient/delivery channel, lifecycle timestamps, and a non-authoritative last-known balance. Raw link tokens are returned once and never stored. `reggie_billing_events` stores allowlisted, sanitized lifecycle metadata. `reggie_billing_rate_limits` provides durable per-window throttles.

Lifecycle: `ready → sent/opened → processing → paid`. Terminal/exception states are `expired`, `revoked`, `failed`, and `reconciliation_required`. Atomic conditional updates prevent duplicate charge submission. A transport error after PUT is uncertain; the service immediately rechecks Sweep & Go and otherwise records `reconciliation_required` instead of retrying a charge.

## Recovery and reconciliation

- A paid or zero-balance invoice is reconciled to paid whenever the workspace, payment page, manual reconciliation, or webhook observes it.
- A request left in `processing` or `reconciliation_required` can be manually reconciled after the cooling period. If Sweep & Go still reports a balance, it moves to failed and a new deliberate attempt may be created.
- Never retry an uncertain charge automatically. Verify the Sweep & Go invoice/payment ledger first.
- Revocation invalidates an unused request. Expired requests cannot be reopened.
- If Sweep & Go, D1, Stripe readiness, or contact resolution is unavailable or ambiguous, the UI fails closed and explains the unavailable action.

## API and security boundaries

The server adapter covers invoice pagination, payments, invoice balance/gateway checks, Stripe payment PUT, residential active-client/details, and commercial search/details. Credentials are resolved server-side from the existing encrypted integration store. Provider errors are normalized and secrets/provider payloads are not returned to browsers.

Public endpoints are rate-limited by hashed token and IP signals, use no-store/no-referrer headers, reject recursive raw-card-shaped fields, and accept only `stripeToken` plus `nameOnCard`. Payment links contain at least 256 bits of cryptographic entropy. Logs and D1 rows must never contain PAN, CVC/CVV, expiry, Stripe secret keys, or raw request tokens.

## Validation

Run `npm run check:billing` for transport/money/token/card-boundary behavioral tests and repository wiring checks. Run `npm run check`, `npm run check:release-candidate`, `npm run check:lint-integration`, and `npm run check:nurture` before release. Validate a staging merchant with a real small invoice, then confirm the final balance and ledger directly in Sweep & Go.
