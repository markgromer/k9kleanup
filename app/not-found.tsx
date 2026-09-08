import Link from '@/components/site-link';
export default function NotFound() {
  return (
    <main className="site-container py-24">
      <p className="eyebrow">404 / Page not found</p>
      <h1 className="section-title max-w-2xl">
        This trail doesn’t lead to a page.
      </h1>
      <p className="body-copy mt-6 max-w-xl">
        The address may have changed or the link may be incomplete. You can
        still explore our services or contact the crew.
      </p>
      <div className="mt-8 flex flex-wrap gap-5">
        <Link href="/" className="brand-button px-6 py-4">
          Back to home
        </Link>
        <Link href="/services" className="text-link">
          Explore services
        </Link>
        <Link href="/contact" className="text-link">
          Contact K9 Kleanup
        </Link>
      </div>
    </main>
  );
}
