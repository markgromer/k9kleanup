import Image from 'next/image';
import Link from '@/components/site-link';
import { notFound } from 'next/navigation';
import { services } from '@/lib/site-content';
import { serviceDetails } from '@/lib/service-details';
import { metadataFor, SITE_ORIGIN } from '@/lib/seo';
import { Breadcrumbs, StructuredData } from '@/components/structured-data';
import { ClosingCTA, CheckList, QuoteLink } from '@/components/site-sections';
type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  return services.some((s) => s.slug === slug)
    ? metadataFor(`/services/${slug}`)
    : { title: 'Service not found', robots: { index: false } };
}
export default async function Service({ params }: Props) {
  const { slug } = await params;
  const s = services.find((s) => s.slug === slug);
  if (!s) notFound();
  const detail = serviceDetails[s.slug];
  return (
    <>
      <StructuredData
        data={{
          '@context': 'https://schema.org',
          '@type': 'Service',
          name: s.title,
          description: s.summary,
          url: `${SITE_ORIGIN}/services/${s.slug}`,
          provider: { '@id': `${SITE_ORIGIN}/#business` },
          areaServed: ['St. Cloud', 'Sartell', 'Sauk Rapids', 'St. Joseph'].map(
            (name) => ({ '@type': 'City', name }),
          ),
        }}
      />
      <section className="site-container pt-10 pb-16">
        <Breadcrumbs
          items={[
            { label: 'Services', path: '/services' },
            { label: s.title, path: `/services/${s.slug}` },
          ]}
        />
        <div className="content-grid items-center">
          <div>
            <p className="eyebrow">{s.tag} / Central Minnesota</p>
            <h1 className="section-title">{detail.heading}</h1>
            <p className="body-copy mt-7">{s.intro}</p>
            <div className="mt-8">
              <QuoteLink />
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              Free quote · Local, veteran-owned crew · No long-term contracts
            </p>
          </div>
          <div className="relative aspect-[4/5] max-h-[570px] overflow-hidden rounded-2xl">
            <Image
              src={s.image}
              alt={s.alt}
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="photo"
            />
          </div>
        </div>
      </section>
      <nav aria-label="On this service page" className="border-y bg-white">
        <div className="site-container flex flex-wrap gap-x-7 gap-y-4 py-5 text-sm font-bold">
          {[
            ['Overview', 'overview'],
            ['What’s included', 'included'],
            ['Visit options', 'options'],
            ['Your first visit', 'first-visit'],
            ['Pricing', 'cost'],
            ['Questions', 'questions'],
          ].map(([label, id]) => (
            <Link
              href={`#${id}`}
              key={id}
              className="underline-offset-4 hover:underline"
            >
              {label}
            </Link>
          ))}
        </div>
      </nav>
      <section
        id="overview"
        className="site-container content-grid section-space"
      >
        <div>
          <p className="eyebrow">The right help for your property</p>
          <h2 className="section-title">{detail.overviewTitle}</h2>
        </div>
        <div className="space-y-5 body-copy">
          {detail.overview.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>
      </section>
      <section id="included" className="bg-primary py-16 text-white">
        <div className="site-container content-grid">
          <div>
            <p className="eyebrow !text-accent">Care comes standard</p>
            <h2 className="section-title !text-white">
              What’s included in your cleanup.
            </h2>
            <p className="mt-6 text-lg leading-relaxed text-white/75">
              {s.fit}
            </p>
          </div>
          <div className="[&_svg]:text-accent">
            <CheckList items={[...s.details]} />
            <p className="mt-8 border-t border-white/20 pt-6 text-sm leading-relaxed text-white/70">
              The exact service areas and schedule are confirmed with your
              quote. Treatments, inaccessible areas, or additional work should
              be discussed separately.
            </p>
          </div>
        </div>
      </section>
      <section id="options" className="site-container section-space">
        <p className="eyebrow">Options that fit real life</p>
        <h2 className="section-title max-w-3xl">
          A plan for the yard you actually have.
        </h2>
        <div className="mt-12 grid gap-8 md:grid-cols-3">
          {s.sections.map(([title, body], i) => (
            <div key={title} className="border-t-4 border-accent bg-white p-7">
              <span className="text-sm font-bold text-muted-foreground">
                0{i + 1}
              </span>
              <h3 className="mt-5 font-heading text-2xl">{title}</h3>
              <p className="mt-4 leading-relaxed text-muted-foreground">
                {body}
              </p>
            </div>
          ))}
        </div>
        <aside className="mt-8 border-l-4 border-accent bg-[#fff0c7] p-6 leading-relaxed">
          <strong>Good to know:</strong> {s.note}
        </aside>
      </section>
      <section id="first-visit" className="bg-white section-space">
        <div className="site-container">
          <p className="eyebrow">From request to reset</p>
          <h2 className="section-title">What your first visit starts with.</h2>
          <div className="mt-12 grid gap-9 md:grid-cols-3">
            {detail.process.map(([title, body], i) => (
              <div key={title}>
                <span className="mb-5 grid size-11 place-items-center rounded-full bg-accent font-bold">
                  {i + 1}
                </span>
                <h3 className="text-xl font-bold">{title}</h3>
                <p className="mt-4 leading-relaxed text-muted-foreground">
                  {body}
                </p>
              </div>
            ))}
          </div>
          <div className="content-grid mt-16 border-t pt-10">
            <h3 className="font-heading text-3xl">
              A little preparation helps.
            </h3>
            <CheckList items={[...detail.prepare]} />
          </div>
        </div>
      </section>
      <section
        id="cost"
        className="site-container content-grid section-space items-start"
      >
        <div>
          <p className="eyebrow">Clear scope. Clear quote.</p>
          <h2 className="section-title">How pricing works.</h2>
          <p className="body-copy mt-6">{detail.pricing}</p>
          <Link href="/pricing" className="text-link mt-7">
            Understand your quote ↗
          </Link>
        </div>
        <aside className="rounded-2xl bg-[#fff0c7] p-8">
          <h3 className="font-heading text-2xl">Help us quote accurately.</h3>
          <p className="mt-4 leading-relaxed">
            Send your ZIP code, service choice, number of dogs or property
            details, approximate cleanup area, and how long it has been since
            the last pickup.
          </p>
          <div className="mt-6">
            <QuoteLink />
          </div>
        </aside>
      </section>
      <section id="questions" className="site-container pb-24">
        <p className="eyebrow">Before you book</p>
        <h2 className="section-title mb-10">A few good questions.</h2>
        <div className="grid gap-8 md:grid-cols-3">
          {detail.faq.map(([q, a]) => (
            <article key={q} className="border-t pt-6">
              <h3 className="text-xl font-bold">{q}</h3>
              <p className="mt-4 leading-relaxed text-muted-foreground">{a}</p>
            </article>
          ))}
        </div>
        <div className="mt-12 flex flex-wrap gap-8">
          <Link href="/faq" className="text-link">
            All FAQs ↗
          </Link>
          <Link href="/service-areas" className="text-link">
            Confirm your service area ↗
          </Link>
        </div>
        <div className="mt-16 border-t pt-8">
          <h2 className="font-heading text-2xl">
            Explore other cleanup options
          </h2>
          <div className="mt-5 flex flex-wrap gap-6">
            {services
              .filter((other) => other.slug !== s.slug)
              .map((other) => (
                <Link
                  href={`/services/${other.slug}`}
                  key={other.slug}
                  className="text-link"
                >
                  {other.title} ↗
                </Link>
              ))}
          </div>
        </div>
      </section>
      <ClosingCTA />
    </>
  );
}
