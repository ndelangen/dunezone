import { Anchor, Group, Stack } from '@mantine/core';
import { createLink } from '@tanstack/react-router';
import clsx from 'clsx';
import { forwardRef } from 'react';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';

import styles from './PageIdentity.module.css';
import { PageTitle } from './PageTitle';

const BreadcrumbAnchor = forwardRef<HTMLAnchorElement, ComponentPropsWithoutRef<'a'>>(function BreadcrumbAnchor(
  { className, ...props },
  ref
) {
  return <Anchor ref={ref} size="sm" fw={600} className={clsx(styles.breadcrumb, className)} {...props} />;
});

export interface PageIdentityProps {
  /** The page's name. Rendered through `PageTitle`, so the level and face rules hold here too. */
  title: string;
  /**
   * The identity media beside the name: a faction token, a cover, an avatar.
   * The caller keeps its own clip and treatment;
   * this owns only the column's size scale, matched to the text block the way the pattern always did by design.
   */
  media?: ReactNode;
  /** The way up one level, as a `PageIdentity.Breadcrumb`. Above the name, where the collection label reads as context. */
  breadcrumb?: ReactNode;
  /** The meta line under the name: maintainers, badges, stats, or a profile's hint and summary. */
  children?: ReactNode;
}

/**
 * The identity band: who or what this page is about, worn in the header.
 *
 * Media beside name, breadcrumb above, meta below, one row geometry and one media scale.
 * The ink is deliberately not set here: the header content is scheme-pinned paper, and that pinning dictates every colour in the band (Norbert, 2026-08-27), so the band's parts wear the pinned treatment instead of opting out of it.
 *
 * It exists because five detail and editor pages composed this band by hand with three media scales, four row widths, and five private copies of the ink override, and the drift between them is what this Block erases.
 */
export function PageIdentity({ title, media, breadcrumb, children }: PageIdentityProps) {
  return (
    <Group wrap="nowrap" align="center" gap="lg" className={styles.band}>
      {media === undefined ? null : <div className={styles.media}>{media}</div>}
      <Stack gap={6} className={styles.text}>
        {breadcrumb}
        <PageTitle title={title} />
        {children}
      </Stack>
    </Group>
  );
}

/** The way up one level, taking the same route props as the router's own `Link`, the `PageMessage.Back` idiom. */
PageIdentity.Breadcrumb = createLink(BreadcrumbAnchor);
