import { createLink } from '@tanstack/react-router';
import clsx from 'clsx';
import { ChevronLeft } from 'lucide-react';
import { forwardRef } from 'react';
import type { ComponentPropsWithoutRef } from 'react';

import styles from './Breadcrumb.module.css';
import eyebrow from './Eyebrow.module.css';

type BreadcrumbAnchorProps = Omit<ComponentPropsWithoutRef<'a'>, 'children'> & {
  /** The page one level up, by its name: "Assets", "Rulesets", a ruleset's own name. */
  children: string;
};

const BreadcrumbAnchor = forwardRef<HTMLAnchorElement, BreadcrumbAnchorProps>(function BreadcrumbAnchor(
  { className, children, ...props },
  ref
) {
  return (
    <a ref={ref} className={clsx(eyebrow.eyebrow, eyebrow.inverse, styles.breadcrumb, className)} {...props}>
      <ChevronLeft size={13} strokeWidth={2.5} aria-hidden />
      {children}
    </a>
  );
});

/**
 * The way up one level, worn above a page's title in the header band, taking the same route props as the router's own `Link`.
 *
 * It wears the `Eyebrow`'s inverse treatment with a leading chevron, so it reads as the page's label and as the way back at once;
 * a page that has one carries no separate Back action (Norbert, 2026-11-07).
 * Hand it to `PageTitle` or `PageIdentity` as their `breadcrumb`, which place it where the eyebrow would sit.
 */
export const Breadcrumb = createLink(BreadcrumbAnchor);
