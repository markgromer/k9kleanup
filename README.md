# K9 Kleanup

Multi-page draft for a veteran-owned Central Minnesota pet waste removal business. Built with React, Vinext, and Tailwind; deployed through Sites at https://k9kleanup.scooper.site.

## Local development

Run `npm install`, then `npm run dev`. Validate with `npm run lint` and `npm run build`. Do not alter previously applied migrations.

## Pages and capabilities

Home, services, recurring cleanup, one-time cleanup, commercial service, about, service areas, FAQ, contact, and photography credits. The existing protected `/admin` manages the homepage image, contact details, and received quote requests. Quotes persist in D1; uploaded images persist in R2. Business email authentication rules are in `lib/admin-auth.ts`; never broaden the admin allowlist without explicit owner approval.

## Draft content

Service facts and company background were checked against https://k9kleanup.co and the supplied client call. No invented prices, reviews, owner portraits, or specific weather/response promises. Real owner/team photos and the client's booking embed have not been supplied. The quote form stores requests in the admin; it does not send email notifications or book appointments.

## Photography

Original real stock photos, downloaded from Pexels under https://www.pexels.com/license/ on September 8, 2026. Not representations of K9 Kleanup staff, customers, or properties. Attribution also appears on `/photo-credits`.

- `public/images/yard-dog.jpg`: Barnabas Davoti, https://www.pexels.com/photo/a-golden-retriever-dog-on-green-grass-field-11702791/
- `public/images/dog-walk.jpg`: Helena Lopes, https://www.pexels.com/photo/photo-of-dog-and-person-walking-on-grass-3705254/
- `public/images/puppy-grass.jpg`: Caleb Oquendo, https://www.pexels.com/photo/golden-retriever-puppy-running-on-green-grass-field-7643260/

Replace lifestyle photography with suitable genuine client photography when supplied. Do not use AI-generated photos to imply real people or work.
