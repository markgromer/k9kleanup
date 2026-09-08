import Link from '@/components/site-link';
import { metadataFor } from '@/lib/seo';
import { MapPin } from 'lucide-react';
import { PageIntro, ClosingCTA, QuoteLink } from '@/components/site-sections';
export const metadata = metadataFor('/service-areas');
export default function Areas() {
  return (
    <>
      <PageIntro
        eyebrow="Where we scoop"
        title="Dog waste removal in St. Cloud, Sartell & nearby."
        description="K9 Kleanup serves homes and shared spaces across these Central Minnesota communities. Send us your ZIP code and we’ll confirm service for your address."
      />
      <section className="site-container pb-24">
        <div className="grid gap-5 sm:grid-cols-2">
          {[
            [
              'St. Cloud',
              'Our local service area includes residential yards and shared properties in St. Cloud.',
            ],
            [
              'Sartell',
              'Routine pickup and one-time cleanup options for dog owners in Sartell.',
            ],
            [
              'Sauk Rapids',
              'A helping hand with pet waste cleanup for homes and community spaces.',
            ],
            [
              'St. Joseph',
              'Local cleanup service for St. Joseph households and properties.',
            ],
          ].map(([city, text]) => (
            <article
              key={city}
              className="rounded-xl border bg-white p-8 md:p-10"
            >
              <MapPin className="mb-7 text-primary" />
              <h2 className="font-heading text-4xl">{city}</h2>
              <p className="body-copy mt-4">{text}</p>
            </article>
          ))}
        </div>
        <div className="content-grid mt-16 rounded-2xl bg-primary p-8 text-white md:p-12">
          <div>
            <p className="eyebrow !text-[#FFB600]">Just beyond the list?</p>
            <h2 className="section-title !text-white">
              Let’s check your address.
            </h2>
          </div>
          <div>
            <p className="text-lg leading-relaxed text-white/80">
              We also serve surrounding areas. Routes and availability can vary,
              so we don’t want to promise coverage based on a city name alone.
            </p>
            <p className="mt-5 text-lg leading-relaxed text-white/80">
              Include your ZIP code and neighborhood in your request. We’ll let
              you know whether we can help and which service options are
              available.
            </p>
            <div className="mt-7 [&_a]:bg-[#fff0c7] [&_a]:text-primary">
              <QuoteLink>Ask about my area</QuoteLink>
            </div>
          </div>
        </div>
      </section>
      <section className="bg-white section-space">
        <div className="site-container content-grid">
          <div>
            <p className="eyebrow">Coverage is about your address</p>
            <h2 className="section-title">
              A city name is the starting point.
            </h2>
          </div>
          <div className="space-y-5 body-copy">
            <p>
              Our service area includes St. Cloud, Sartell, Sauk Rapids, and St.
              Joseph, along with surrounding communities. Before scheduling, we
              confirm your specific address and the service you need. That
              matters for both homes and larger properties, where layout and
              access can affect the work.
            </p>
            <p>
              If you are outside the listed communities, send your ZIP code and
              neighborhood. You do not need to guess whether your property is
              too far away; we can confirm current coverage with you directly.
            </p>
            <p>
              Please avoid sharing access codes in the initial quote form. Once
              coverage and service are agreed, we can coordinate the practical
              details privately.
            </p>
          </div>
        </div>
      </section>
      <section className="site-container section-space">
        <p className="eyebrow">One local crew. Several ways to help.</p>
        <h2 className="section-title">Choose the cleanup for your space.</h2>
        <div className="mt-10 grid gap-8 md:grid-cols-3">
          {[
            [
              'Recurring residential pickup',
              'Keep regular dog waste cleanup on a schedule with weekly, every-other-week, or monthly options. Tell us about your dogs and yard use so we can discuss the interval.',
              '/services/recurring-cleanup',
            ],
            [
              'One-time and spring cleanup',
              'Get caught up after winter, before guests arrive, or after a busy stretch. Describe how long waste has accumulated and whether the cleanup areas are accessible.',
              '/services/one-time-cleanup',
            ],
            [
              'Commercial and shared spaces',
              'Ask about cleanup for apartment grounds, HOAs, rentals, or pet-friendly common areas. Include the property name, areas to be serviced, and your preferred frequency.',
              '/services/commercial',
            ],
          ].map(([title, body, href]) => (
            <article key={href} className="border-t-4 border-accent pt-6">
              <h3 className="font-heading text-2xl">{title}</h3>
              <p className="body-copy mt-4">{body}</p>
              <Link href={href} className="text-link mt-6">
                Explore this service ↗
              </Link>
            </article>
          ))}
        </div>
        <div className="mt-14 rounded-xl border p-8">
          <h2 className="font-heading text-2xl">
            What should I send for a coverage check?
          </h2>
          <p className="body-copy mt-4">
            Start with your ZIP code, neighborhood or community, and service
            type. For a home, include the number of dogs and approximate yard
            size. For a managed property, describe the common areas and a
            contact person. We’ll follow up to confirm the address and next
            steps.
          </p>
          <Link href="/contact" className="text-link mt-6">
            Check my address ↗
          </Link>
        </div>
      </section>
      <ClosingCTA />
    </>
  );
}
