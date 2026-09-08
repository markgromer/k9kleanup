import type { MetadataRoute } from 'next';
import { pageSEO, SITE_ORIGIN } from '@/lib/seo';
export default function sitemap(): MetadataRoute.Sitemap {
  return Object.keys(pageSEO)
    .filter((path) => !['/photo-credits', '/privacy'].includes(path))
    .map((path) => ({ url: `${SITE_ORIGIN}${path === '/' ? '' : path}` }));
}
