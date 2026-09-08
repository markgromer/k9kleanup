'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Menu, ArrowUpRight, PawPrint } from 'lucide-react';
import { Sheet, SheetTrigger, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button, buttonVariants } from '@/components/ui/button';

const links = [['Services', '/services'], ['Our story', '/about'], ['Service area', '/service-areas'], ['FAQs', '/faq']] as const;
export function Brand() {
  return <Link href="/" aria-label="K9 Kleanup home" className="flex items-center gap-2.5"><span className="grid size-11 place-items-center rounded-full bg-primary text-white"><PawPrint size={23}/></span><span className="text-xl font-black tracking-[-.06em] sm:text-2xl">K9 KLEANUP<span className="block text-[10px] font-semibold tracking-[.22em]">GOOD DOGS. CLEAN YARDS.</span></span></Link>;
}
export function SiteNav() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  return <header className="border-b bg-background"><div className="site-container flex min-h-24 items-center justify-between gap-5"><Brand/><nav aria-label="Main navigation" className="hidden items-center gap-8 lg:flex">{links.map(([label, href]) => <Link key={href} href={href} aria-current={path.startsWith(href) ? 'page' : undefined} className="text-sm font-semibold underline-offset-8 hover:underline aria-[current=page]:underline">{label}</Link>)}</nav><Link href="/contact" className={`${buttonVariants()} hidden h-12 rounded-full px-6 sm:inline-flex`}>Get a free quote <ArrowUpRight size={17}/></Link><div className="lg:hidden"><Sheet open={open} onOpenChange={setOpen}><SheetTrigger render={<Button variant="outline" size="icon" aria-label="Open menu"/>}><Menu/></SheetTrigger><SheetContent className="p-7 pt-16"><SheetTitle className="font-heading text-3xl">Explore K9 Kleanup</SheetTitle><SheetDescription>Local people. A cleaner yard.</SheetDescription><nav aria-label="Mobile navigation" className="mt-6 grid gap-6">{[...links, ['Get a free quote', '/contact']].map(([label, href]) => <Link key={href} href={href} onClick={() => setOpen(false)} className="text-xl">{label}</Link>)}</nav></SheetContent></Sheet></div></div></header>;
}
