import { faqs } from '@/lib/site-content';
export function FAQList() {
  return (
    <div className="space-y-14">
      {['Getting started', 'Your service', 'Care & details'].map((group) => (
        <section key={group} id={group.toLowerCase().replace(/[^a-z]+/g, '-')}>
          <h2 className="mb-6 border-b-4 border-accent pb-5 font-heading text-3xl">
            {group}
          </h2>
          <div className="space-y-8">
            {faqs
              .filter((f) => f.group === group)
              .map((f) => (
                <article key={f.q}>
                  <h3 className="text-xl font-bold">{f.q}</h3>
                  <p className="mt-3 max-w-3xl text-base leading-relaxed text-muted-foreground">
                    {f.a}
                  </p>
                </article>
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}
