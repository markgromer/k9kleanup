import type { Metadata } from 'next';

// Production domain and indexing are enabled together for the live release.
export const SITE_ORIGIN = 'https://k9kleanup.co';
export const SITE_INDEXABLE = true;
export const pageSEO: Record<string, { title: string; description: string }> = {
  '/': {
    title: 'Dog Poop Removal in St. Cloud, MN',
    description:
      'Veteran-owned pet waste removal in St. Cloud, Sartell, Sauk Rapids and St. Joseph. Recurring, one-time and commercial cleanup. Request a free quote.',
  },
  '/services': {
    title: 'Pet Waste Removal Services in Central Minnesota',
    description:
      'Compare weekly dog poop pickup, one-time spring yard cleanups and commercial pet waste services from K9 Kleanup in the St. Cloud area.',
  },
  '/services/recurring-cleanup': {
    title: 'Recurring Dog Poop Removal in St. Cloud, MN',
    description:
      'Weekly, biweekly and monthly dog waste pickup in St. Cloud and nearby communities. Learn what is included, how to choose a schedule and how pricing works.',
  },
  '/services/one-time-cleanup': {
    title: 'One-Time & Spring Dog Poop Cleanup | St. Cloud',
    description:
      'Get your yard caught up after winter or before your next gathering. One-time dog waste cleanup in St. Cloud, Sartell, Sauk Rapids and St. Joseph.',
  },
  '/services/commercial': {
    title: 'Commercial Pet Waste Removal | St. Cloud Area',
    description:
      'Pet waste cleanup for apartments, HOAs, rental properties and shared outdoor spaces in Central Minnesota. Request a property-specific cleanup plan.',
  },
  '/about': {
    title: 'About K9 Kleanup | Veteran-Owned Local Crew',
    description:
      'The story behind K9 Kleanup: two brothers with canine handling and sanitation backgrounds, bringing thoughtful dog waste cleanup to Central Minnesota.',
  },
  '/service-areas': {
    title: 'Service Areas | St. Cloud, Sartell & Nearby',
    description:
      'Find pet waste removal in St. Cloud, Sartell, Sauk Rapids and St. Joseph. Check address coverage and explore residential and commercial cleanup options.',
  },
  '/pricing': {
    title: 'Dog Waste Removal Pricing & Free Quotes',
    description:
      'Understand what goes into a K9 Kleanup quote: dogs, yard size, cleanup condition and visit frequency. Free quotes and no long-term contracts.',
  },
  '/how-it-works': {
    title: 'How Our Pooper Scooper Service Works',
    description:
      'From your first quote to regular yard pickup: learn how K9 Kleanup schedules service, plans property access and prepares your yard for a cleanup.',
  },
  '/faq': {
    title: 'Pooper Scooper Service FAQs | K9 Kleanup',
    description:
      'Answers about dog poop removal pricing, schedules, yard access, Minnesota weather, pet arrangements and commercial cleanup in the St. Cloud area.',
  },
  '/contact': {
    title: 'Free Dog Waste Removal Quote | St. Cloud, MN',
    description:
      'Request a free quote for residential or commercial pet waste removal. Contact K9 Kleanup with your ZIP code, dogs and preferred cleanup schedule.',
  },
  '/privacy': {
    title: 'Website Privacy & Quote Requests',
    description:
      'How information submitted through the K9 Kleanup website is used for quote requests and service inquiries.',
  },
  '/photo-credits': {
    title: 'Photography Credits',
    description:
      'Credits for the real lifestyle photography used in the K9 Kleanup website draft.',
  },
};
export function metadataFor(path: string): Metadata {
  const page = pageSEO[path];
  return {
    title: { absolute: `${page.title} | K9 Kleanup` },
    description: page.description,
    alternates: { canonical: `${SITE_ORIGIN}${path === '/' ? '' : path}` },
    robots: { index: SITE_INDEXABLE, follow: true },
    openGraph: {
      title: page.title,
      description: page.description,
      url: `${SITE_ORIGIN}${path}`,
      siteName: 'K9 Kleanup',
      locale: 'en_US',
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title: page.title,
      description: page.description,
    },
  };
}
