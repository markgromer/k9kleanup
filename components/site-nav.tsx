'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Menu, ArrowUpRight } from 'lucide-react';
import { Sheet, SheetTrigger, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button, buttonVariants } from '@/components/ui/button';

const links = [['Services', '/services'], ['Our story', '/about'], ['Service area', '/service-areas'], ['FAQs', '/faq']] as const;
export function Brand() {
  return <Link href="/" aria-label="K9 Kleanup home" className="flex shrink-0 items-center gap-3"><Image src="/images/k9-kleanup-logo.png" alt="K9 Kleanup detective dog logo" width={836} height={862} priority className="h-16 w-auto object-contain sm:h-24"/><span className="font-heading text-base font-black leading-tight tracking-tight sm:text-2xl">K9 KLEANUP<span className="mt-1 block font-sans text-xs font-semibold tracking-wide text-[#FFB600]">PET WASTE REMOVAL</span></span></Link>;
}
export function SiteNav() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  return <header className="border-b border-white/15 bg-[#121110] text-white"><div className="site-container flex min-h-28 items-center justify-between gap-5"><Brand/><nav aria-label="Main navigation" className="hidden items-center gap-6 lg:flex">{links.map(([label, href]) => <Link key={href} href={href} aria-current={path.startsWith(href) ? 'page' : undefined} className="text-sm font-semibold underline-offset-8 hover:underline aria-[current=page]:underline">{label}</Link>)}</nav><Link href="/contact" className={`${buttonVariants()} brand-button hidden h-12 px-6 sm:inline-flex`}>Get a free quote <ArrowUpRight size={17}/></Link><div className="lg:hidden"><Sheet open={open} onOpenChange={setOpen}><SheetTrigger render={<Button variant="outline" size="icon" aria-label="Open menu" className="text-foreground"/>}><Menu/></SheetTrigger><SheetContent className="p-7 pt-16"><SheetTitle className="font-heading text-3xl">Explore K9 Kleanup</SheetTitle><SheetDescription>Local people. A cleaner yard.</SheetDescription><nav aria-label="Mobile navigation" className="mt-6 grid gap-6">{[...links, ['Get a free quote', '/contact']].map(([label, href]) => <Link key={href} href={href} onClick={() => setOpen(false)} className="text-xl">{label}</Link>)}</nav></SheetContent></Sheet></div></div></header>;
}
