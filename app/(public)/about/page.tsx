import { metadataFor } from '@/lib/seo';
import Image from 'next/image';
import { PageIntro, ClosingCTA } from '@/components/site-sections';
export const metadata = metadataFor('/about');
export default function About() {
  return (
    <>
      <PageIntro
        eyebrow="The people behind the pickup"
        title="A local, veteran-owned crew. A cleaner kind of service."
        description="We’re a local, veteran-owned business founded by two brothers who believe the little things—showing care, respecting a property, and doing the work well—add up."
      />
      <section className="site-container pb-24">
        <div className="content-grid border-t pt-14">
          <h2 className="section-title">
            A background in care.
            <br />A business built on it.
          </h2>
          <div className="space-y-5 body-copy">
            <p>
              Our roots are in canine handling and sanitation. Those backgrounds
              gave us a practical appreciation for dogs, clean spaces, and the
              kind of attention to detail that good service requires.
            </p>
            <p>
              We brought those strengths together in K9 Kleanup: a
              straightforward way for local dog owners to get reliable help with
              an unavoidable chore.
            </p>
            <p>
              We know that hiring someone to come into your yard is personal.
              That’s why we keep our approach simple: discuss what you need,
              agree on the plan, and treat your space with care.
            </p>
          </div>
        </div>
      </section>
      <section className="bg-white section-space">
        <div className="site-container">
          <p className="eyebrow">What matters to us</p>
          <div className="grid gap-12 md:grid-cols-3">
            {[
              [
                'Care for the details',
                'Clean equipment between stops. Careful waste handling. Attention to the space you’ve trusted us to work in.',
              ],
              [
                'Room for real life',
                'Flexible cleanup options and no long-term contracts, because your needs can change with the season or your schedule.',
              ],
              [
                'A local connection',
                'Homes, dogs, and neighbors right here in Central Minnesota. You’re working with a local business, not just a name on a screen.',
              ],
            ].map(([title, body]) => (
              <div key={title}>
                <h2 className="font-heading text-3xl">{title}</h2>
                <p className="body-copy mt-5">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="site-container content-grid section-space items-center">
        <div className="relative aspect-square overflow-hidden rounded-2xl">
          <Image
            src="/api/media/48e84b33-ea85-4add-b7bd-b93dd4da0058"
            alt="Image1"
            unoptimized
            fill
            sizes="(max-width:1024px) 100vw, 50vw"
            className="photo object-center"
          />
        </div>
        <div>
          <p className="eyebrow">Why we do what we do</p>
          <h2 className="section-title">
            Dogs make life better.
            <br />
            We help with the messy part.
          </h2>
          <p className="body-copy mt-7">
            There’s a lot to love about sharing life with a dog. Picking up
            after one usually isn’t at the top of the list.
          </p>
          <p className="body-copy mt-5">
            Our part is small but useful: taking a chore off your hands so your
            outdoor space feels like yours again. More playing, more relaxing,
            and less checking where you step.
          </p>
        </div>
      </section>
      <ClosingCTA />
    </>
  );
}
