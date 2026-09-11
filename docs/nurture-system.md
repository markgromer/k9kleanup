# REGGIE nurture system

REGGIE nurture follows up by SMS after a visitor sees a website quote or a consented lead arrives through an external webhook. One active journey is allowed per normalized phone number.

## Owner setup

Open **Dashboard → Leads → Nurture** and complete the four workspaces:

1. **Overview** shows launch readiness, processor health, current totals, and recent recipients.
2. **Journey** enables website-quote and/or external-webhook entry, sets quiet hours, and defines up to six messages. Every delay is an absolute offset from entry.
3. **Eligibility & stops** configures exclusions, restart cooldown, and conversion stop events. Required quote fields and SMS consent remain owned by Quote Tool settings.
4. **Connections** stores the OpenPhone sender, webhook signing secret, and shows the integration endpoints.

Do not enable nurture until the launch-readiness panel is complete.

## Runtime configuration

Set these private values on the deployed site:

- `OPENPHONE_API_KEY`
- `OPENPHONE_PHONE_NUMBER_ID`
- `OPENPHONE_WEBHOOK_SECRET` when credentials are managed through environment variables rather than the dashboard
- `NURTURE_EVENT_TOKEN`, a long random token used by external lead, stop, and processor calls

Set the following in the client GitHub repository so `.github/workflows/reggie-nurture.yml` can process due messages every ten minutes:

- Repository variable `REGGIE_LIVE_URL`, for example `https://example.com`
- Repository variable `NURTURE_SCHEDULER_ENABLED` set to `true` after the live URL and token are ready
- Repository secret `NURTURE_EVENT_TOKEN`, matching the value on the deployed site

Until `NURTURE_SCHEDULER_ENABLED` is `true`, scheduled runs are skipped. Owners can still use **Process now** from the Nurture screen.

## Website entry

The REGGIE quote tool records the website entry after the quote is displayed and the configured Quote Tool gates have passed. Enrollment still requires `smsConsent: true`.

## Make, Zapier, Facebook, and form entry

Send consented lead JSON to `POST /api/nurture/webhook` with `Authorization: Bearer NURTURE_EVENT_TOKEN`.

```json
{
  "phone": "+15205550123",
  "smsConsent": true,
  "consentText": "I agree to receive quote follow-up texts.",
  "first_name": "Jamie",
  "last_name": "Rivera",
  "email": "jamie@example.com",
  "quote_total": 89,
  "zip_code": "85001",
  "frequency": "weekly",
  "source": "facebook-lead-ads"
}
```

The webhook also accepts common snake-case/camel-case phone and name fields, arrays of leads, and Facebook `field_data` payloads. A lead without explicit SMS consent is acknowledged but not enrolled.

## Exclusions and duplicate control

Before enrollment, REGGIE checks:

- global phone suppression;
- an active or manual-handling journey for the same phone;
- existing-customer metadata when enabled;
- excluded source, ZIP code, or frequency;
- minimum and maximum quote value;
- the completed-journey restart cooldown.

An excluded event is recorded in the nurture event history without starting a message sequence.

## Stop and reply handling

Post conversion events to `POST /api/nurture/stop` with the event token:

```json
{
  "phone": "+15205550123",
  "reason": "booking",
  "referenceId": "booking-123",
  "source": "crm"
}
```

Supported reasons are `signup`, `booking`, `payment`, and `customer_created`. Enabled reasons clear all future messages.

Create an OpenPhone message webhook for both `message.received` and `message.delivered`, pointing to `POST /api/nurture/reply`. Store its base64 signing secret in the Nurture Connections screen. REGGIE verifies the `openphone-signature` HMAC and rejects events older than five minutes.

- Any normal reply moves the lead to **Needs a person** and stops automation.
- STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, or QUIT creates permanent global suppression.
- The human conversation continues in OpenPhone; REGGIE sends no automated reply.
- Delivery events update each outbound message from **Sent** to **Delivered** without restarting or advancing the journey.

## Delivery behavior

- Quiet hours use the configured business timezone.
- Due steps are atomically claimed before sending on D1-backed installations.
- Failed messages retry after one hour.
- After three failed attempts for one step, the journey moves to manual review.
- The Recent Recipients table shows the latest state per phone number.
- Worker installations use D1 event, suppression, recipient, message, and runtime records. Render installations use the persistent REGGIE admin store.

Cloudflare Pages installations do not include the nurture runtime.
