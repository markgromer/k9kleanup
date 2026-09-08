import Link from '@/components/site-link';
import {
  PageIntro,
  ClosingCTA,
  CheckList,
  QuoteLink,
} from '@/components/site-sections';
import { Breadcrumbs } from '@/components/structured-data';
import { metadataFor } from '@/lib/seo';
export const metadata = metadataFor('/pricing');
export default function Pricing() {
  return (
    <>
      <div className="site-container pt-8">
        <Breadcrumbs items={[{ label: 'Pricing', path: '/pricing' }]} />
      </div>
      <PageIntro
        eyebrow="Straightforward, property-specific quotes"
        title="Dog waste removal pricing, without the guesswork."
        description="A small, regularly maintained yard and a season’s worth of buildup are different jobs. We quote the work your property needs and discuss the scope before you start."
      />
      <section className="site-container pb-24">
        <div className="content-grid">
          <div>
            <h2 className="section-title">What goes into your quote?</h2>
            <p className="body-copy mt-6">
              Your quote should make sense for your dogs, your space, and the
              amount of help you want. These are the details that help us
              understand the job.
            </p>
            <div className="mt-8">
              <QuoteLink />
            </div>
          </div>
          <div className="space-y-7">
            {[
              [
                'The number of dogs',
                'How many dogs regularly use the yard helps us understand the amount of waste between visits. For a shared property, describe the pet areas and how heavily they are used.',
              ],
              [
                'The size and layout of the cleanup area',
                'Tell us about the space you want serviced, including separate fenced sections, common lawns, or other agreed areas. Approximate dimensions are helpful; you don’t need a perfect measurement to ask for a quote.',
              ],
              [
                'The starting condition',
                'A first visit after months of accumulation may need a different scope from a regular maintenance visit. Mention the time since the last cleanup and any snow, leaves, or tall grass.',
              ],
              [
                'Your preferred frequency',
                'Weekly, every-other-week, monthly, and one-time service involve different patterns of work. We can discuss the options before you decide.',
              ],
            ].map(([title, body], i) => (
              <div key={title} className="flex gap-5 border-b pb-7">
                <span className="font-heading text-2xl text-muted-foreground">
                  0{i + 1}
                </span>
                <div>
                  <h3 className="text-xl font-bold">{title}</h3>
                  <p className="mt-3 leading-relaxed text-muted-foreground">
                    {body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="bg-white section-space">
        <div className="site-container">
          <p className="eyebrow">Compare the service, not just the price</p>
          <h2 className="section-title">Find the kind of help you need.</h2>
          <div className="mt-10 overflow-x-auto">
            <table className="w-full min-w-[620px] text-left">
              <caption className="sr-only">
                Comparison of dog waste cleanup options
              </caption>
              <thead>
                <tr className="bg-primary text-white">
                  <th scope="col" className="p-5">
                    Service
                  </th>
                  <th scope="col" className="p-5">
                    Useful for
                  </th>
                  <th scope="col" className="p-5">
                    What to discuss
                  </th>
                </tr>
              </thead>
              <tbody>
                {[
                  [
                    'Recurring pickup',
                    'Ongoing help with a dog-used yard',
                    'Visit frequency, number of dogs, first-visit condition',
                    '/services/recurring-cleanup',
                  ],
                  [
                    'One-time cleanup',
                    'Spring catch-up, events, or an overdue reset',
                    'Accumulation, accessible areas, preferred timing',
                    '/services/one-time-cleanup',
                  ],
                  [
                    'Commercial care',
                    'Apartments, HOAs, rentals, and common spaces',
                    'Property layout, agreed areas, visit frequency',
                    '/services/commercial',
                  ],
                ].map(([name, fit, detail, href]) => (
                  <tr key={href} className="border-b">
                    <th scope="row" className="p-5">
                      <Link
                        href={href}
                        className="underline underline-offset-4"
                      >
                        {name}
                      </Link>
                    </th>
                    <td className="p-5 leading-relaxed">{fit}</td>
                    <td className="p-5 leading-relaxed text-muted-foreground">
                      {detail}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
      <section className="site-container content-grid section-space">
        <div>
          <p className="eyebrow">Before you say yes</p>
          <h2 className="section-title">A few things worth confirming.</h2>
          <p className="body-copy mt-6">
            We don’t require long-term contracts. A quote request is a
            conversation starter, not a booked appointment or a commitment to
            service.
          </p>
        </div>
        <CheckList
          items={[
            'Which parts of your property are included in the cleanup',
            'Whether the first visit differs from regular maintenance',
            'The agreed visit frequency and access arrangements',
            'Any separate treatment or additional work you requested',
            'How to contact the team if your schedule or needs change',
          ]}
        />
      </section>
      <section className="bg-[#fff0c7] py-16">
        <div className="site-container content-grid">
          <h2 className="section-title">
            No price list that pretends every yard is the same.
          </h2>
          <div>
            <p className="body-copy">
              We haven’t published flat rates because your quote should reflect
              your property. Send a few details and we’ll discuss the work and
              pricing directly.
            </p>
            <p className="body-copy mt-5">
              If you’re comparing providers, ask what each quote includes and
              whether it assumes an already-maintained yard. That makes the
              comparison more useful than a starting price alone.
            </p>
            <Link href="/contact" className="text-link mt-7">
              Tell us about your property ↗
            </Link>
          </div>
        </div>
      </section>
      <ClosingCTA />
    </>
  );
}
