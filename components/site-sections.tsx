import Link from 'next/link';
import { ArrowUpRight, Check } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';

export function QuoteLink({ children = 'Get my free quote' }: { children?: React.ReactNode }) {
  return <Link href="/contact" className={`${buttonVariants()} h-14 rounded-full px-7 text-base`}>{children}<ArrowUpRight size={18}/></Link>;
}
export function PageIntro({ eyebrow, title, description }: { eyebrow:string; title:string; description:string }) {
  return <section className="site-container pt-16 pb-14 md:pt-24 md:pb-20"><p className="eyebrow">{eyebrow}</p><h1 className="section-title max-w-4xl">{title}</h1><p className="body-copy mt-7 max-w-2xl">{description}</p></section>;
}
export function ClosingCTA() {
  return <section className="bg-[#e6eccf] py-16 md:py-20"><div className="site-container flex flex-col items-start justify-between gap-8 md:flex-row md:items-center"><div><p className="eyebrow">Less scooping. More living.</p><h2 className="section-title max-w-2xl">Your yard is calling.<br/>Let’s make it a good place to be.</h2></div><QuoteLink/></div></section>;
}
export function CheckList({ items }: { items: string[] }) {
  return <ul className="space-y-4">{items.map(item => <li key={item} className="flex gap-3 leading-relaxed"><Check size={20} className="mt-1 shrink-0 text-primary"/>{item}</li>)}</ul>;
}
