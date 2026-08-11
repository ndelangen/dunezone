import clsx from 'clsx';
import { useId } from 'react';
import type { ReactNode } from 'react';

import { HeadingSlot } from '../content/headingSlot';
import styles from './Region.module.css';

export interface RegionProps {
  /**
   * Required. A `Section`, or a `SectionIntro` when a description or a link onward shares the
   * heading line. Without a heading this is a `Stack`.
   */
  heading: ReactNode;
  children: ReactNode;
  /** Stable anchor for in-page navigation. The accessible name is wired up regardless. */
  id?: string;
  /** Placement only — grid area, width. The region owns its own internal spacing. */
  className?: string;
}

/**
 * A named part of a page, whose content brings its own panes.
 *
 * Callers own the heading and the content. This component owns what makes the two one region: the
 * gap below the heading, the `section` element, and the `aria-labelledby` that gives the landmark
 * its name — wiring the heading's id through so no caller has to invent matching id strings.
 *
 * It is the counterpart to `Card`, and the brand rule picks between them: a `Card` puts the content
 * on its pane, so content that already has panes — a list of cards, a grid of spotlights — must use
 * a `Region` or the surfaces would nest. Written out by hand this was a `section` in one page and a
 * `div` in another, half of them unnamed to a screen reader.
 */
export function Region({ heading, children, id, className }: RegionProps) {
  const headingId = useId();

  return (
    <section id={id} aria-labelledby={headingId} className={clsx(styles.region, className)}>
      <HeadingSlot headingId={headingId}>{heading}</HeadingSlot>
      {children}
    </section>
  );
}
