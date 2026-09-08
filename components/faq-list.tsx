'use client';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';
import { faqs } from '@/lib/site-content';
export function FAQList() { return <div className="space-y-12">{['Getting started','Your service','Care & details'].map(group=><section key={group}><h2 className="mb-5 font-heading text-3xl">{group}</h2><Accordion>{faqs.filter(f=>f.group===group).map(f=><AccordionItem key={f.q} value={f.q}><AccordionTrigger className="gap-5 rounded-none py-6 text-lg font-semibold">{f.q}</AccordionTrigger><AccordionContent className="max-w-3xl pb-7 pr-8 text-base leading-relaxed text-muted-foreground">{f.a}</AccordionContent></AccordionItem>)}</Accordion></section>)}</div>; }
