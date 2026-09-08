import Link from '@/components/site-link';
import { SITE_ORIGIN } from '@/lib/seo';
export function StructuredData({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, '\\u003c'),
      }}
    />
  );
}
export function Breadcrumbs({
  items,
}: {
  items: { label: string; path: string }[];
}) {
  const trail = [{ label: 'Home', path: '/' }, ...items];
  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-8">
        <ol className="flex flex-wrap gap-2 text-sm text-muted-foreground">
          {trail.map((item, i) => (
            <li key={item.path} className="flex gap-2">
              {i > 0 && <span aria-hidden="true">/</span>}
              {i === trail.length - 1 ? (
                <span aria-current="page">{item.label}</span>
              ) : (
                <Link href={item.path} className="underline underline-offset-4">
                  {item.label}
                </Link>
              )}
            </li>
          ))}
        </ol>
      </nav>
      <StructuredData
        data={{
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: trail.map((item, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            name: item.label,
            item: `${SITE_ORIGIN}${item.path}`,
          })),
        }}
      />
    </>
  );
}
