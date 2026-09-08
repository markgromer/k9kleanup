import type { Metadata } from 'next';
import { SITE_INDEXABLE, SITE_ORIGIN } from '@/lib/seo';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  robots: { index: SITE_INDEXABLE, follow: true },
  title: {
    default: 'K9 Kleanup | Pet Waste Removal in Central Minnesota',
    template: '%s | K9 Kleanup',
  },
  icons: { icon: '/brand-icon.png', apple: '/brand-icon.png' },
  description:
    'Veteran-owned dog waste removal serving St. Cloud, Sartell, Sauk Rapids, St. Joseph, and nearby Central Minnesota communities.',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
