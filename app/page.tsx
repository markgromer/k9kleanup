import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  BadgeCheck,
  CalendarCheck,
  Check,
  Dog,
  HeartHandshake,
  Leaf,
  MapPin,
  Phone,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { QuoteForm } from '@/components/quote-form';
import { getSiteSettings } from '@/db/site-data';

export const dynamic = 'force-dynamic';

const services = [
  {
    title: 'Weekly cleanup',
    text: 'Our most popular plan for a yard that stays ready for kids, guests, and zoomies.',
    icon: CalendarCheck,
  },
  {
    title: 'Every other week',
    text: 'A flexible option for smaller yards, fewer dogs, and lower-maintenance seasons.',
    icon: Dog,
  },
  {
    title: 'One-time reset',
    text: 'A thorough cleanup before a gathering, move, spring thaw, or whenever you need it.',
    icon: Sparkles,
  },
];

const cities = ['St. Cloud', 'Sartell', 'Sauk Rapids', 'St. Joseph', 'Waite Park'];

export default async function Home() {
  const settings = await getSiteSettings();
  const heroImage = settings.heroImageKey
    ? `/media/${encodeURIComponent(settings.heroImageKey)}`
    : '/images/dog-banner.jpg';

  return (
    <main className="min-h-screen overflow-hidden bg-background text-foreground">
      <div className="bg-primary px-4 py-2 text-center text-sm font-semibold text-primary-foreground">
        Veteran-owned and proudly serving Central Minnesota
      </div>

      <header className="absolute left-0 right-0 z-20 border-b border-white/15 bg-[#10261f]/80 backdrop-blur-md">
        <div className="site-container flex h-20 items-center justify-between gap-5">
          <Link href="#top" className="flex items-center gap-3 text-white" aria-label="K9 Kleanup home">
            <span className="grid size-11 place-items-center rounded-full bg-accent text-accent-foreground shadow-lg shadow-black/15">
              <Dog className="size-6" strokeWidth={2.3} />
            </span>
            <span className="hidden leading-none min-[420px]:block">
              <span className="block font-heading text-[1.3rem] font-black tracking-tight">K9 KLEANUP</span>
              <span className="mt-1 block text-[0.66rem] font-bold uppercase tracking-[0.24em] text-white/65">Pet waste removal</span>
            </span>
          </Link>
          <nav className="hidden items-center gap-7 text-sm font-semibold text-white/80 md:flex" aria-label="Main navigation">
            <a href="#services" className="transition hover:text-white">Services</a>
            <a href="#why-us" className="transition hover:text-white">Why K9</a>
            <a href="#service-area" className="transition hover:text-white">Service area</a>
          </nav>
          <a href="#quote" className="inline-flex h-11 items-center rounded-full bg-accent px-5 text-sm font-extrabold text-accent-foreground transition hover:-translate-y-0.5 hover:shadow-lg">
            Get my free quote
          </a>
        </div>
      </header>

      <section id="top" className="relative min-h-[760px] bg-[#10261f] pt-20 text-white lg:min-h-[790px]">
        <Image
          src={heroImage}
          alt="A happy dog enjoying a freshly cleaned green yard"
          fill
          priority
          sizes="100vw"
          className="object-cover object-[62%_center] opacity-65"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(10,31,25,.98)_0%,rgba(10,31,25,.9)_42%,rgba(10,31,25,.18)_78%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(0deg,rgba(10,31,25,.75)_0%,transparent_42%)]" />
        <div className="site-container relative flex min-h-[680px] items-center py-24 lg:min-h-[710px]">
          <div className="max-w-[690px]">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-bold backdrop-blur-sm">
              <MapPin className="size-4 text-accent" />
              St. Cloud area&apos;s local cleanup crew
            </div>
            <h1 className="font-heading text-[clamp(3.4rem,8vw,7.4rem)] font-black leading-[0.84] tracking-[-0.055em]">
              More yard.
              <span className="mt-2 block text-accent">Less yuck.</span>
            </h1>
            <p className="mt-8 max-w-xl text-lg font-medium leading-relaxed text-white/78 sm:text-xl">
              Reliable dog waste removal for busy Central Minnesota families. We handle the dirty work so your yard stays clean, healthy, and ready for play.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <a href="#quote" className="inline-flex h-14 items-center justify-center gap-2 rounded-full bg-accent px-7 font-extrabold text-accent-foreground transition hover:-translate-y-0.5 hover:shadow-xl">
                Get my free quote <ArrowRight className="size-5" />
              </a>
              <a href={`tel:${settings.phone.replace(/[^+\d]/g, '')}`} className="inline-flex h-14 items-center justify-center gap-2 rounded-full border border-white/25 bg-white/10 px-7 font-bold text-white backdrop-blur-sm transition hover:bg-white/15">
                <Phone className="size-5" /> {settings.phone}
              </a>
            </div>
            <div className="mt-9 flex flex-wrap gap-x-7 gap-y-3 text-sm font-semibold text-white/72">
              <span className="flex items-center gap-2"><Check className="size-4 text-accent" /> No contracts</span>
              <span className="flex items-center gap-2"><Check className="size-4 text-accent" /> Fully insured</span>
              <span className="flex items-center gap-2"><Check className="size-4 text-accent" /> Pet-safe process</span>
            </div>
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-20 bg-background [clip-path:polygon(0_72%,100%_0,100%_100%,0_100%)]" />
      </section>

      <section className="site-container py-16 sm:py-20">
        <div className="grid gap-6 rounded-[2rem] border border-border bg-card p-7 shadow-[0_20px_70px_rgba(18,48,39,.08)] sm:grid-cols-3 sm:p-9">
          {[
            ['Veteran-owned', 'Service rooted in discipline, respect, and showing up when we say we will.', ShieldCheck],
            ['Locally operated', 'Your neighborhood crew—not a call center or national franchise.', MapPin],
            ['Satisfaction guaranteed', 'If something was missed, we come back and make it right.', BadgeCheck],
          ].map(([title, itemText, Icon]) => (
            <div key={String(title)} className="flex gap-4 border-border sm:border-r sm:pr-6 last:border-0 last:pr-0">
              <Icon className="mt-1 size-7 shrink-0 text-primary" />
              <div><h2 className="font-heading text-xl font-black">{String(title)}</h2><p className="mt-2 text-[0.95rem] leading-relaxed text-muted-foreground">{String(itemText)}</p></div>
            </div>
          ))}
        </div>
      </section>

      <section id="services" className="site-container py-16 sm:py-24">
        <div className="grid items-end gap-8 lg:grid-cols-[1.1fr_.9fr]">
          <div>
            <p className="eyebrow">Simple, flexible service</p>
            <h2 className="section-title max-w-3xl">A cleaner yard, on your schedule.</h2>
          </div>
          <p className="max-w-xl text-lg leading-relaxed text-muted-foreground lg:justify-self-end">
            Every visit includes a careful grid search, double-bagged removal, a secured gate, and sanitized tools between homes.
          </p>
        </div>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {services.map(({ title, text: serviceText, icon: Icon }, index) => (
            <article key={title} className="group rounded-[1.8rem] border border-border bg-card p-7 transition duration-300 hover:-translate-y-1 hover:shadow-[0_20px_50px_rgba(18,48,39,.1)]">
              <div className="flex items-center justify-between">
                <span className="grid size-13 place-items-center rounded-2xl bg-secondary text-primary"><Icon className="size-6" /></span>
                <span className="font-heading text-5xl font-black text-primary/10">0{index + 1}</span>
              </div>
              <h3 className="mt-8 font-heading text-2xl font-black">{title}</h3>
              <p className="mt-3 leading-relaxed text-muted-foreground">{serviceText}</p>
              <a href="#quote" className="mt-7 inline-flex items-center gap-2 font-extrabold text-primary">Request pricing <ArrowRight className="size-4 transition group-hover:translate-x-1" /></a>
            </article>
          ))}
        </div>
      </section>

      <section id="why-us" className="relative bg-primary py-20 text-primary-foreground sm:py-28">
        <div className="site-container grid items-center gap-12 lg:grid-cols-[.9fr_1.1fr]">
          <div className="relative min-h-[460px] overflow-hidden rounded-[2.2rem] border border-white/15 shadow-2xl">
            <Image src="/images/no-crossing.jpg" alt="A playful golden retriever in a clean lawn" fill sizes="(max-width: 1024px) 100vw, 45vw" className="object-cover" />
            <div className="absolute bottom-5 left-5 right-5 rounded-2xl bg-[#f9f3e8]/95 p-5 text-foreground backdrop-blur">
              <div className="flex items-center gap-3"><HeartHandshake className="size-6 text-primary" /><p className="font-heading text-xl font-black">Good neighbors. Great service.</p></div>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">We treat every gate, pet, and property with the same care we&apos;d want at home.</p>
            </div>
          </div>
          <div>
            <p className="eyebrow text-accent">The K9 standard</p>
            <h2 className="section-title text-white">Professional down to the last detail.</h2>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/70">
              K9 Kleanup was built by two brothers with backgrounds in canine handling and sanitation. That means a sharper eye, a safer process, and service you never have to chase down.
            </p>
            <div className="mt-9 grid gap-6 sm:grid-cols-2">
              {[
                ['A careful grid search', 'We walk the entire service area methodically, not just the obvious spots.', ShieldCheck],
                ['Clean tools every stop', 'Equipment is disinfected between properties to protect every pet.', Sparkles],
                ['A gate check before we go', 'We photograph and confirm your gate is secure after each visit.', Check],
                ['Earth-conscious care', 'Pet-safe deodorizing options and responsible waste handling.', Leaf],
              ].map(([title, itemText, Icon]) => (
                <div key={String(title)} className="flex gap-3">
                  <Icon className="mt-1 size-5 shrink-0 text-accent" />
                  <div><h3 className="font-bold text-white">{String(title)}</h3><p className="mt-1 text-sm leading-relaxed text-white/62">{String(itemText)}</p></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="service-area" className="site-container py-20 sm:py-28">
        <div className="overflow-hidden rounded-[2.4rem] bg-secondary">
          <div className="grid lg:grid-cols-[1.05fr_.95fr]">
            <div className="p-8 sm:p-12 lg:p-16">
              <p className="eyebrow">Proudly local</p>
              <h2 className="section-title">Serving the neighborhoods we call home.</h2>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">Based in the St. Cloud area, we keep routes tight so service stays personal, reliable, and on time.</p>
              <div className="mt-8 flex flex-wrap gap-3">
                {cities.map((city) => <span key={city} className="rounded-full border border-primary/15 bg-background px-4 py-2 font-bold text-primary">{city}</span>)}
                <span className="rounded-full border border-dashed border-primary/30 px-4 py-2 font-bold text-primary/70">&amp; nearby areas</span>
              </div>
            </div>
            <div className="relative min-h-[360px] bg-primary p-8 text-white sm:p-12 lg:min-h-full lg:p-14">
              <div className="absolute -right-16 -top-16 size-56 rounded-full border-[38px] border-accent/12" />
              <MapPin className="size-12 text-accent" strokeWidth={1.8} />
              <p className="mt-10 font-heading text-4xl font-black leading-tight">Not sure if we reach your street?</p>
              <p className="mt-5 max-w-md text-lg leading-relaxed text-white/68">Send your ZIP code. We&apos;ll confirm availability and give you straightforward pricing—no pressure.</p>
              <a href="#quote" className="mt-8 inline-flex h-12 items-center gap-2 rounded-full bg-accent px-6 font-extrabold text-accent-foreground">Check my address <ArrowRight className="size-4" /></a>
            </div>
          </div>
        </div>
      </section>

      <section id="quote" className="bg-[#f5ead6] py-20 sm:py-28">
        <div className="site-container grid gap-12 lg:grid-cols-[.8fr_1.2fr]">
          <div>
            <p className="eyebrow">Free, no-pressure quote</p>
            <h2 className="section-title">Tell us about your yard.</h2>
            <p className="mt-6 max-w-md text-lg leading-relaxed text-muted-foreground">Share a few details and your local K9 Kleanup crew will follow up with the right service plan.</p>
            <div className="mt-9 space-y-4 text-sm font-semibold text-foreground/75">
              <p className="flex items-center gap-3"><span className="grid size-8 place-items-center rounded-full bg-primary text-white">1</span> Tell us your ZIP and number of dogs</p>
              <p className="flex items-center gap-3"><span className="grid size-8 place-items-center rounded-full bg-primary text-white">2</span> Get simple, transparent pricing</p>
              <p className="flex items-center gap-3"><span className="grid size-8 place-items-center rounded-full bg-primary text-white">3</span> Pick the schedule that fits</p>
            </div>
          </div>
          <QuoteForm />
        </div>
      </section>

      <footer className="bg-[#0b1d18] py-12 text-white">
        <div className="site-container flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-full bg-accent text-accent-foreground"><Dog className="size-5" /></span><span className="font-heading text-xl font-black">K9 KLEANUP</span></div>
            <p className="mt-5 max-w-md text-sm leading-relaxed text-white/55">Veteran-owned dog waste removal serving St. Cloud, Sartell, Sauk Rapids, St. Joseph, Waite Park, and nearby Central Minnesota communities.</p>
          </div>
          <div className="flex flex-col gap-2 text-sm md:text-right">
            <a className="font-bold text-white" href={`tel:${settings.phone.replace(/[^+\d]/g, '')}`}>{settings.phone}</a>
            <a className="text-white/60 hover:text-white" href={`mailto:${settings.email}`}>{settings.email}</a>
            <Link className="mt-2 text-xs text-white/35 hover:text-white/60" href="/admin">Owner login</Link>
          </div>
        </div>
        <div className="site-container mt-10 border-t border-white/10 pt-6 text-xs text-white/35">© {new Date().getFullYear()} K9 Kleanup. Clean yards. Happy dogs.</div>
      </footer>
    </main>
  );
}
