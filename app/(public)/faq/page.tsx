import { metadataFor } from '@/lib/seo';
import Link from '@/components/site-link';
import { PageIntro, ClosingCTA } from '@/components/site-sections';
import { FAQList } from '@/components/faq-list';
export const metadata = metadataFor('/faq');
export default function FAQ() {
  return (
    <>
      <PageIntro
        eyebrow="Good questions. Straight answers."
        title="Your pet waste removal questions, answered."
        description="Everything from choosing a schedule to getting your yard ready. If your question isn’t here, we’re happy to talk."
      />
      <div className="site-container grid gap-12 pb-24 lg:grid-cols-[1fr_2.3fr]">
        <aside>
          <div className="rounded-xl bg-[#fff0c7] p-7">
            <h2 className="font-heading text-2xl">Rather ask a person?</h2>
            <p className="mt-3 leading-relaxed">
              Tell us what’s on your mind. A local team can help you work out
              the details.
            </p>
            <Link href="/contact" className="text-link mt-5">
              Get in touch ↗
            </Link>
          </div>
        </aside>
        <FAQList />
      </div>
      <ClosingCTA />
    </>
  );
}
