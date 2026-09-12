import { metadataFor } from '@/lib/seo';
import Image from 'next/image';
import Link from '@/components/site-link';
import { ArrowUpRight } from 'lucide-react';
import { PageIntro, ClosingCTA, CheckList } from '@/components/site-sections';
import { services } from '@/lib/site-content';
export const metadata = metadataFor('/services');
export default function Services() {
  return (
    <>
      <PageIntro
        eyebrow="A service for every kind of yard"
        title="Pet waste removal services for Central Minnesota."
        description="From a weekly helping hand to a once-a-season reset, choose the cleanup that makes sense for your home or property."
      />
      <section className="site-container pb-24">
        <div className="space-y-12">
          {services.map((s, i) => (
            <article
              key={s.slug}
              className="grid overflow-hidden rounded-2xl bg-white md:grid-cols-[.85fr_1.15fr]"
            >
              <div className="relative min-h-80">
                <Image
                  src={
                    s.slug === 'recurring-cleanup'
                      ? '/api/media/dfcb02a6-1730-4ff1-8578-9c300b207b29'
                      : s.image
                  }
                  alt={s.slug === 'recurring-cleanup' ? 'Image0' : s.alt}
                  unoptimized={s.slug === 'recurring-cleanup'}
                  fill
                  sizes="(max-width: 768px) 100vw, 45vw"
                  className="photo object-center"
                />
              </div>
              <div className="p-8 md:p-12">
                <p className="eyebrow">
                  0{i + 1} / {s.tag}
                </p>
                <h2 className="font-heading text-4xl tracking-tight">
                  {s.title}
                </h2>
                <p className="body-copy mt-5">{s.summary}</p>
                <p className="mt-5 leading-relaxed text-muted-foreground">
                  {s.fit}
                </p>
                <Link href={`/services/${s.slug}`} className="text-link mt-8">
                  View service details <ArrowUpRight size={18} />
                </Link>
              </div>
            </article>
          ))}
        </div>
        <div className="content-grid mt-20 border-t pt-12">
          <div>
            <p className="eyebrow">The details matter</p>
            <h2 className="font-heading text-4xl">Care comes standard.</h2>
            <p className="body-copy mt-5">
              The same thoughtful approach, whether we visit once or every week.
            </p>
          </div>
          <CheckList
            items={[
              'Fully insured, veteran-owned local business',
              'Equipment cleaned between stops',
              'Collected waste double-bagged with care',
              'No long-term service contracts',
            ]}
          />
        </div>
        <div className="mt-14 rounded-xl bg-[#fff0c7] p-8">
          <h2 className="font-heading text-3xl">
            Need help with lingering odors?
          </h2>
          <p className="mt-3 max-w-3xl leading-relaxed">
            Ask about sanitation and deodorizing treatments when you request
            your quote. We’ll discuss what’s appropriate for your yard and
            explain any product-specific instructions.
          </p>
        </div>
      </section>
      <ClosingCTA />
    </>
  );
}
