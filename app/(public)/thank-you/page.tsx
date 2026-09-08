import type { Metadata } from 'next';
import Link from '@/components/site-link';
import { PageIntro } from '@/components/site-sections';
export const metadata: Metadata = {
  title: 'Quote Request Received',
  robots: { index: false, follow: false },
};
export default function Thanks() {
  return (
    <>
      <PageIntro
        eyebrow="Request received"
        title="Thanks for reaching out."
        description="Your quote request has been sent to K9 Kleanup. Our team will review the details and follow up to discuss coverage, pricing, and scheduling."
      />
      <div className="site-container pb-24">
        <p className="body-copy mb-8">
          You haven’t booked a visit or committed to service. We’ll confirm the
          next steps together.
        </p>
        <Link href="/" className="brand-button inline-block px-6 py-4">
          Back to home
        </Link>
      </div>
    </>
  );
}
