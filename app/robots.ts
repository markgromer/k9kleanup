import type { MetadataRoute } from 'next';
import { SITE_INDEXABLE, SITE_ORIGIN } from '@/lib/seo';
export default function robots(): MetadataRoute.Robots {
  // Permit crawlers to read the draft's noindex meta tags; robots disallow
  // alone would not reliably keep the draft out of search results.
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/admin', '/media/'],
    },
    ...(SITE_INDEXABLE ? { sitemap: `${SITE_ORIGIN}/sitemap.xml` } : {}),
  };
}
