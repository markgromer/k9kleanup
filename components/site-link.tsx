import type { ComponentProps } from 'react';

// Marketing pages use native document navigation. This also works before
// hydration, with JavaScript disabled, and across deployment revisions.
export default function SiteLink({ children, ...props }: ComponentProps<'a'>) {
  return <a {...props}>{children}</a>;
}
