import { metadataFor } from '@/lib/seo';
import { PageIntro } from '@/components/site-sections';
export const metadata = metadataFor('/photo-credits');
export default function Credits() {
  return (
    <>
      <PageIntro
        eyebrow="Real photography"
        title="A little credit where it’s due."
        description="The draft uses licensed stock photography of real dogs and people. These images illustrate life with dogs; they do not depict K9 Kleanup’s team, customers, or completed work."
      />
      <div className="site-container pb-24">
        <ul className="space-y-5 text-lg">
          <li>
            Golden retriever in a yard —{' '}
            <a
              className="underline"
              href="https://www.pexels.com/photo/a-golden-retriever-dog-on-green-grass-field-11702791/"
            >
              Barnabas Davoti / Pexels
            </a>
          </li>
          <li>
            Dog and person outdoors —{' '}
            <a
              className="underline"
              href="https://www.pexels.com/photo/photo-of-dog-and-person-walking-on-grass-3705254/"
            >
              Helena Lopes / Pexels
            </a>
          </li>
          <li>
            Puppy in the grass —{' '}
            <a
              className="underline"
              href="https://www.pexels.com/photo/golden-retriever-puppy-running-on-green-grass-field-7643260/"
            >
              Caleb Oquendo / Pexels
            </a>
          </li>
        </ul>
        <p className="mt-8">
          Used under the{' '}
          <a className="underline" href="https://www.pexels.com/license/">
            Pexels license
          </a>
          .
        </p>
      </div>
    </>
  );
}
