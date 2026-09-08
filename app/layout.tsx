import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'K9 Kleanup | Pet Waste Removal in Central Minnesota',
    template: '%s | K9 Kleanup',
  },
  description: 'Veteran-owned dog waste removal serving St. Cloud, Sartell, Sauk Rapids, St. Joseph, and nearby Central Minnesota communities.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
