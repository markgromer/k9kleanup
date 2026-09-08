# K9 Kleanup

Multi-page draft for a veteran-owned Central Minnesota pet waste removal business. Built with React, Vinext, and Tailwind; deployed through Sites at https://k9kleanup.scooper.site.

## Local development

Run `npm install`, then `npm run dev`. Validate with `npm run lint` and `npm run build`. Do not alter previously applied migrations.

## Pages and capabilities

Home, services, recurring cleanup, one-time cleanup, commercial service, about, service areas, FAQ, contact, and photography credits. The existing protected `/admin` manages the homepage image, contact details, and received quote requests. Quotes persist in D1; uploaded images persist in R2. Business email authentication rules are in `lib/admin-auth.ts`; never broaden the admin allowlist without explicit owner approval.

## Draft content

Service facts and company background were checked against https://k9kleanup.co and the supplied client call. No invented prices, reviews, owner portraits, or specific weather/response promises. Real owner/team photos and the client's booking embed have not been supplied. The quote form stores requests in the admin; it does not send email notifications or book appointments.

## Brand continuity

The original detective-dog logo and browser icon are reused unchanged from the client's existing site. The palette restores the original Elementor brand tokens: gold `#FFB600`, near-black `#121110`, white, and warm supporting neutrals. Nunito headings are locally hosted from the original site's font asset. The original tagline, "Your yard, crime scene clean," is retained. Real lifestyle photographs remain; no generated scene photos are restored.

- Logo: https://k9kleanup.co/wp-content/uploads/2025/06/K9_Kleanup_Logo-e1751521391422.png
- Icon: https://k9kleanup.co/wp-content/uploads/2025/06/cropped-K9_Kleanup_Logo-192x192.png
- Brand tokens: https://k9kleanup.co/wp-content/uploads/elementor/css/post-2887.css
- Font: https://k9kleanup.co/wp-content/uploads/elementor/google-fonts/fonts/nunito-xrxv3i6li01bkofineab.woff2

### Lifestyle photo credits

Original real stock photos, downloaded from Pexels under https://www.pexels.com/license/ on September 8, 2026. Not representations of K9 Kleanup staff, customers, or properties. Attribution also appears on `/photo-credits`.

- `public/images/yard-dog.jpg`: Barnabas Davoti, https://www.pexels.com/photo/a-golden-retriever-dog-on-green-grass-field-11702791/
- `public/images/dog-walk.jpg`: Helena Lopes, https://www.pexels.com/photo/photo-of-dog-and-person-walking-on-grass-3705254/
- `public/images/puppy-grass.jpg`: Caleb Oquendo, https://www.pexels.com/photo/golden-retriever-puppy-running-on-green-grass-field-7643260/

Replace lifestyle photography with suitable genuine client photography when supplied. Do not use AI-generated photos to imply real people or work.

## Navigation, content, and SEO

Public navigation uses ordinary HTML anchors (`SiteLink`) instead of client-router interception. The mobile navigation remains visible without a JavaScript overlay. FAQ answers render expanded. The quote form has an ordinary URL-encoded POST fallback, readable HTML errors, and a `/thank-you` redirect, with fetch enhancement when React is available.

The three service detail pages include scope, schedules, first-visit preparation, pricing factors, service-specific questions, and related links. Pricing and how-it-works pages provide substantive decision support. Service-area coverage remains a single useful page instead of near-duplicate city doorway pages. No unverified owner biographies, prices, review scores, street addresses, hours, or precise weather promises are added.

Page titles, descriptions, canonicals, text social metadata, Organization/Service/Breadcrumb structured data, robots.txt, and sitemap.xml are configured. `lib/seo.ts` is the launch switch: the review domain stays `noindex`; at an authorized main-domain launch set `SITE_ORIGIN` to the final business domain and `SITE_INDEXABLE` to true together, then verify and submit the sitemap in the owner's Search Console. Do not claim rankings or rich-result eligibility; the business's public street address and verified business profile have not been supplied.

Checks: `node --test tests/quotes.test.mjs`, `node scripts/verify-site.mjs http://localhost:3000 --submit-local-test`, `npm run lint`, `npx tsc --noEmit`, and `npm run build`. The verification script checks every public page, internal destinations and anchors, one H1, unique metadata, canonicals, valid JSON-LD, images, sitemap/robots, 404 status, and native form action. Its synthetic submit option refuses non-local hosts. Browser interaction testing remains a separate check and is not implied by HTTP verification.

SEO implementation references: https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls ; https://developers.google.com/search/docs/crawling-indexing/block-indexing ; https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap ; https://developers.google.com/search/docs/appearance/structured-data/sd-policies
