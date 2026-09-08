import { metadataFor } from '@/lib/seo';
import { PageIntro } from '@/components/site-sections';
import { getSiteSettings } from '@/db/site-data';
export const metadata = metadataFor('/privacy');
export default async function Privacy() {
  const s = await getSiteSettings();
  return (
    <>
      <PageIntro
        eyebrow="Your information"
        title="Website privacy & quote requests."
        description="This page explains the information collected through this website draft and how it supports your inquiry."
      />
      <div className="site-container pb-24">
        <div className="max-w-3xl space-y-9">
          {[
            [
              'Information you choose to share',
              'The quote form asks for your name, ZIP code, email, phone number, number of dogs or property type, preferred service, and optional notes. Please do not submit payment details, gate codes, medical information, or other sensitive details through this form.',
            ],
            [
              'How the website uses it',
              'Quote requests are stored so the authorized K9 Kleanup team can review your inquiry and contact you about service, coverage, pricing, and scheduling. Submitting the form does not book a visit or process a payment.',
            ],
            [
              'Hosting and access',
              'The website uses hosting, database, and file-storage services to deliver pages and store requests. These services may process technical information needed to operate and protect the site, such as connection information and security cookies. Team sign-in is handled through the website’s authentication provider.',
            ],
            [
              'Analytics and advertising',
              'This draft does not include an advertising pixel or a marketing analytics integration. The lifestyle photographs and brand font are served with the website rather than loaded from third-party image or font services.',
            ],
          ].map(([title, body]) => (
            <section key={title}>
              <h2 className="font-heading text-2xl">{title}</h2>
              <p className="body-copy mt-4">{body}</p>
            </section>
          ))}
          <section>
            <h2 className="font-heading text-2xl">
              Questions about your request
            </h2>
            <p className="body-copy mt-4">
              Contact{' '}
              <a className="underline" href={`mailto:${s.email}`}>
                {s.email}
              </a>{' '}
              to ask about information you submitted, request a correction, or
              discuss removal of your inquiry. This notice describes this
              website; any separate booking provider may have its own privacy
              terms.
            </p>
          </section>
        </div>
      </div>
    </>
  );
}
