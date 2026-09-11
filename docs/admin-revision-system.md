# Reggie Client Admin

This website is a client of the standalone Reggie Hub at
`https://connect.scooper.site`. It does not store OpenAI, GitHub, Cloudflare,
or deployment credentials.

## What the client stores

`reggie connect` writes three private Hub connection secrets:

- `REGGIE_CONNECT_URL`
- `REGGIE_CONNECT_SITE_ID`
- `REGGIE_CONNECT_SITE_TOKEN`

They identify this site to Reggie. They cannot be used to deploy another site
or retrieve central credentials.

The command also creates and binds `INTEGRATIONS_DB` for structured admin data
and `REGGIE_MEDIA` for uploaded files. `ADMIN_ENCRYPTION_KEY` is a fourth,
site-specific secret used only to encrypt integration credentials before D1
storage. It is never exposed through an admin response.

New installs do not ship with built-in credentials. `reggie connect` provisions
a private `REGGIE_ADMIN_PASSWORD`. Install first stages the generated owner
credential in gitignored `.reggie/admin-password.pending`; successful connect
promotes the confirmed bootstrap copy to `.reggie/admin-password`.
`REGGIE_ADMIN_SUPER_PASSWORD`,
`ADMIN_SUPER_PASSWORD`, `REGGIE_DEV_PASSWORD`, `ADMIN_DEV_PASSWORD`, or
`DEV_PASSWORD` can provide separate web-team access. Successful sign-in creates
a signed, HttpOnly browser session; the password is not retained in browser
storage or resent during navigation. The owner password can then be
changed from the Reggie connection page when the site has an `INTEGRATIONS_DB`
binding.

Owners can instead choose **First login or forgot password?**. The client sends
the email only to the Hub, which checks the exact repository-linked company and
owner contacts in the central PoopSites Airtable base. A single-use 15-minute
link lets the owner set a password and starts a 30-day HttpOnly session. Normal
sign-ins continue to use the chosen password; email is not required each time.

## Admin actions

- **Overview** reports D1, R2, encryption, content, SEO, ranking, media, and
  first-party analytics health.
- **Quote Tool** stores normalized pricing, coverage, expiration, and lead
  handoff settings.
- Sweep & Go connections use one cross-platform field set and one public
  contract for live options, pricing, onboarding, authenticated payment-link
  webhooks, and payment-status polling. When Sweep & Go is selected, its quote
  settings remain locked until the API token is verified and the organization
  returned by Sweep & Go matches the configured account slug.
- **Analytics, SEO, and Rankings** manage first-party events, page metadata,
  structured data, keyword targets, and observed positions.
- **Landing Pages and Blog Posts** retain status, content, and search metadata
  as durable records.
- **Media** uploads safe public asset types to R2 and retains folders, tags,
  alt text, and captions in D1. Cloudinary is optional legacy fallback.
- **Integrations** stores supported provider tokens and auth material with
  AES-GCM encryption; saved secret values are masked in all browser responses.

- **AI Changes / Ask Reggie** creates a mission through
  `POST /api/admin/reggie-mission` with an idempotency key.
- **Refresh Missions** reads durable mission state from the Hub, so a browser
  refresh never clears the queue.
- **Reggie Lens** sends visual notes through the same mission endpoint.
  Its canvas previews movement, resizing, exact replacement copy, uploaded
  fonts, responsive section presets, and replacement images live, while
  reviewed source changes still flow through the normal mission gate.
  Interactive rewrites are authenticated and rate limited per site. Hub
  failure telemetry records operational metadata only, never selected copy or
  editor feedback.
  A build-generated source index plus React/DOM hints gives each selected
  element up to four file-and-line candidates for the central runner to verify.
- **New Landing Page** requires an approved local-service, seasonal-offer, or
  commercial-service section recipe in addition to its route and CTA brief.
- **Request Edits** creates a follow-up mission on the existing draft branch.
- **Publish Mission** is enabled only after the Hub has recorded a pull request
  number. It asks the central runner to merge, deploy, and verify the site.

Desktop and mobile before/after/diff images are captured by the central runner
after checks, stored in private Hub R2, and shown through the authenticated
mission review when available. Capture is best-effort and does not block the
pull request or publishing. Runner attempts use a lease and heartbeat, retry up
to three times, and publishing is locked to one mission per site.

## Connection status

`GET /api/admin/reggie-connect` reports only whether this client can reach the
Hub. The admin connection page must never ask for deployment tokens or API keys.

## Safe checks

Run these in the client repository:

```bash
npm run reggie:doctor
npm run reggie:workflow-qa
npm run reggie:api-qa -- --base-url http://127.0.0.1:3000
npm run reggie:lens-qa -- --base-url http://127.0.0.1:3000
npm run reggie:source-map
```

The API check submits only a deliberately invalid short request, so it does not
create a mission or call the central runner.

Lens browser QA requires a locally installed Playwright Chromium browser. It
never sends a mission or publishes; it uses isolated browser contexts and
mocked session authentication, media,
font-library, and copy-rewrite responses for deterministic visual editing
coverage. Live API QA separately verifies real authentication and input
validation without spending inference tokens.
