import Link from '@/components/site-link';
import { PageIntro, ClosingCTA, CheckList } from '@/components/site-sections';
import { Breadcrumbs } from '@/components/structured-data';
import { metadataFor } from '@/lib/seo';
export const metadata = metadataFor('/how-it-works');
export default function HowItWorks() {
  return (
    <>
      <div className="site-container pt-8">
        <Breadcrumbs
          items={[{ label: 'How it works', path: '/how-it-works' }]}
        />
      </div>
      <PageIntro
        eyebrow="From the first hello to a cleaner yard"
        title="How our pooper scooper service works."
        description="You shouldn’t have to guess what happens after requesting a quote. Here’s how we work out the details, prepare for a visit, and help you keep the yard under control."
      />
      <section className="site-container pb-24">
        <ol className="space-y-12">
          {[
            [
              'Tell us what you need',
              'Start with your ZIP code, number of dogs, and preferred service. A note about yard size, the last cleanup, and any current buildup helps us understand the work. For a commercial property, include the property name and the common areas you manage.',
              'Requesting a quote does not reserve an appointment or commit you to service.',
            ],
            [
              'Confirm the scope and schedule',
              'We review coverage for your address, discuss the appropriate cleanup option, and provide pricing. We also work through access arrangements and the areas to include. If you need a specific date, tell us before making plans around a visit.',
              'A first-time catch-up cleanup may be a different scope from the visits that follow.',
            ],
            [
              'Get the property ready',
              'Make the agreed areas accessible and let us know about obstacles or changes. Discuss where your dogs will be during the visit. Gate codes and sensitive access information should be coordinated privately, not submitted in the public quote form.',
              'Snow, leaf cover, and tall grass can hide waste. Let us know about those conditions in advance.',
            ],
            [
              'Leave the cleanup to the crew',
              'K9 Kleanup collects dog waste in the agreed service areas and double-bags it. Our equipment is cleaned between stops. Afterward, recurring customers can continue on the agreed schedule; one-time customers have no obligation to sign up for more.',
              'If you have a concern about a visit, contact the team so we can discuss making it right.',
            ],
          ].map(([title, body, note], i) => (
            <li
              key={title}
              className="grid gap-6 border-t pt-9 md:grid-cols-[100px_1fr_1fr]"
            >
              <span className="font-heading text-5xl text-[#946600]">
                0{i + 1}
              </span>
              <h2 className="font-heading text-3xl">{title}</h2>
              <div>
                <p className="body-copy">{body}</p>
                <p className="mt-5 border-l-4 border-accent pl-4 text-sm leading-relaxed">
                  {note}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>
      <section className="bg-primary section-space text-white">
        <div className="site-container content-grid">
          <div>
            <p className="eyebrow !text-accent">Your first-visit checklist</p>
            <h2 className="section-title !text-white">
              A little coordination.
              <br />A smoother cleanup.
            </h2>
          </div>
          <div className="[&_svg]:text-accent">
            <CheckList
              items={[
                'Confirm the cleanup areas and point out any spaces to avoid.',
                'Arrange gate access and explain locks or latches privately.',
                'Agree on pet arrangements before the crew arrives.',
                'Tell us about obstacles, snow cover, tall grass, or other visibility issues.',
                'Share a contact number for service questions.',
              ]}
            />
          </div>
        </div>
      </section>
      <section className="site-container content-grid section-space">
        <div>
          <p className="eyebrow">Plans change. That’s okay.</p>
          <h2 className="section-title">Keep us in the loop.</h2>
        </div>
        <div className="space-y-5 body-copy">
          <p>
            Travel, a new pet, yard work, or a change in access can affect your
            cleanup needs. Contact the team to discuss schedule adjustments,
            pauses, or cancellation. There’s no long-term contract tying you to
            a plan that no longer fits.
          </p>
          <p>
            Minnesota weather can also affect safe access and visibility. If
            conditions change, reach out to discuss your property and the next
            visit rather than assume a cleanup can happen in every condition.
          </p>
          <Link href="/faq" className="text-link text-foreground">
            More service questions, answered ↗
          </Link>
        </div>
      </section>
      <ClosingCTA />
    </>
  );
}
