import Image from 'next/image';
import Link from '@/components/site-link';
import { ArrowUpRight } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';

export function Brand() {
  return (
    <Link
      href="/"
      aria-label="K9 Kleanup home"
      className="flex shrink-0 items-center gap-3"
    >
      <Image
        src="/images/k9-kleanup-logo.png"
        alt="K9 Kleanup detective dog logo"
        width={836}
        height={862}
        priority
        className="h-16 w-auto object-contain sm:h-24"
      />
      <span className="font-heading text-base font-black leading-tight tracking-tight sm:text-2xl">
        K9 KLEANUP
        <span className="mt-1 block font-sans text-xs font-semibold tracking-wide text-[#FFB600]">
          PET WASTE REMOVAL
        </span>
      </span>
    </Link>
  );
}

export function SiteNav() {
  const links = [
    ['Services', '/services'],
    ['How it works', '/how-it-works'],
    ['Pricing', '/pricing'],
    ['Our story', '/about'],
    ['Service area', '/service-areas'],
    ['FAQs', '/faq'],
  ];
  return (
    <header className="border-b border-white/15 bg-black text-white">
      <div className="site-container flex min-h-28 flex-wrap items-center justify-between gap-4">
        <Brand />
        <Link
          href="/contact"
          className={`${buttonVariants()} brand-button hidden h-12 px-6 sm:inline-flex`}
        >
          Get a free quote <ArrowUpRight size={17} />
        </Link>
        <Link
          href="/contact"
          className="brand-button px-3 py-3 text-sm sm:hidden"
        >
          Free quote
        </Link>
      </div>
      <nav aria-label="Main navigation" className="border-t border-white/15">
        <div className="site-container flex flex-wrap gap-x-6 gap-y-1 py-2 sm:gap-x-9">
          {links.map(([label, href]) => (
            <Link
              key={href}
              href={href}
              className="py-3 text-sm font-bold underline-offset-8 hover:text-accent hover:underline"
            >
              {label}
            </Link>
          ))}
        </div>
      </nav>
    </header>
  );
}
