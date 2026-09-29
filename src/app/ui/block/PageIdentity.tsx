import { Anchor, Group, Stack, Text } from '@mantine/core';
import { createLink } from '@tanstack/react-router';
import clsx from 'clsx';
import { forwardRef } from 'react';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';

import { GroupLink } from '../content/GroupLink';
import { ProfileLink } from '../content/ProfileLink';
import type { ProfileLinkProps } from '../content/ProfileLink';
import { StatusBadge } from '../content/StatusBadge';
import type { StatusBadgeTone } from '../content/StatusBadge';
import { Stats } from '../list/Stats';
import type { StatsItem } from '../list/Stats';
import styles from './PageIdentity.module.css';
import { PageTitle } from './PageTitle';

const BreadcrumbAnchor = forwardRef<HTMLAnchorElement, ComponentPropsWithoutRef<'a'>>(function BreadcrumbAnchor(
  { className, ...props },
  ref
) {
  return <Anchor ref={ref} size="sm" fw={600} className={clsx(styles.breadcrumb, className)} {...props} />;
});

/** A person the band cites, in `ProfileLink`'s own fields. */
export interface PageIdentityPerson {
  slug: ProfileLinkProps['slug'];
  name: ProfileLinkProps['name'];
  image?: ProfileLinkProps['image'];
}

/** A group the band cites. A group whose slug did not resolve is named without a link. */
export interface PageIdentityGroup {
  slug?: string | null;
  name: string;
}

export interface PageIdentityMaintainers {
  /** The phrase before the names. Defaults to "Maintained by". */
  label?: string;
  /** The person who holds the thing; `null` reads as "Unknown". */
  owner: PageIdentityPerson | null;
  /**
   * The maintaining group.
   * `null` says there is none, for pages where a group is expected;
   * leave it out on pages where groups do not apply at all.
   */
  group?: PageIdentityGroup | null;
}

export interface PageIdentityStanding {
  tone: StatusBadgeTone;
  label: string;
  icon?: ReactNode;
}

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
  /** Who holds this: the owner, and the maintaining group where the kind has one. */
  maintainers?: PageIdentityMaintainers;
  /** The viewer's own standing towards this, when there is one worth naming ("Member", "You"). The default state of every reader is not. */
  standing?: PageIdentityStanding | null;
  /** The counted facts about this, packed into a row with their phrases on hover. */
  stats?: StatsItem[];
  /** Anything else the meta line carries, after the maintainers and before the stats: a date, an edition. */
  children?: ReactNode;
}

function Maintainers({ label = 'Maintained by', owner, group }: PageIdentityMaintainers) {
  return (
    <>
      <Text size="sm" c="dimmed">
        {label}
      </Text>
      {owner ? <ProfileLink slug={owner.slug} name={owner.name} image={owner.image} /> : <Text size="sm">Unknown</Text>}
      {group === undefined ? null : group === null ? (
        <Text size="sm" c="dimmed">
          No maintaining group
        </Text>
      ) : group.slug ? (
        <GroupLink slug={group.slug} name={group.name} />
      ) : (
        <Text size="sm" fw={600}>
          {group.name}
        </Text>
      )}
    </>
  );
}

/**
 * The identity band: who or what this page is about, worn in the header.
 *
 * Media beside name, breadcrumb above, one meta line below, one row geometry and one media scale.
 * The meta line always reads in the same order (maintainers, the viewer's standing, the page's own extras, then the counts), so every detail page answers "whose is this, where do I stand, how big is it" in the same place, and the content below never has to say it again.
 * The ink is deliberately not set here: the header content is scheme-pinned paper, and that pinning dictates every colour in the band (Norbert, 2026-08-27), so the band's parts wear the pinned treatment instead of opting out of it.
 *
 * It exists because five detail and editor pages composed this band by hand with three media scales, four row widths, and five private copies of the ink override, and the drift between them is what this Block erases.
 */
export function PageIdentity({ title, media, breadcrumb, maintainers, standing, stats, children }: PageIdentityProps) {
  const hasMeta = maintainers !== undefined || standing != null || (stats?.length ?? 0) > 0 || children != null;
  return (
    <Group wrap="nowrap" align="center" gap="lg" className={styles.band}>
      {media === undefined ? null : <div className={styles.media}>{media}</div>}
      <Stack gap={6} className={styles.text}>
        {breadcrumb}
        <PageTitle title={title} />
        {/*
          The sizes are level on purpose: this row centres its children, and a 12px label among 14-16px text reads as
          misaligned even when every box is perfectly centred.
        */}
        {hasMeta ? (
          <Group gap="sm" wrap="wrap" align="center">
            {maintainers ? <Maintainers {...maintainers} /> : null}
            {standing ? (
              <StatusBadge tone={standing.tone} icon={standing.icon}>
                {standing.label}
              </StatusBadge>
            ) : null}
            {children}
            {stats && stats.length > 0 ? <Stats items={stats} orientation="row" /> : null}
          </Group>
        ) : null}
      </Stack>
    </Group>
  );
}

/** The way up one level, taking the same route props as the router's own `Link`, the `PageMessage.Back` idiom. */
PageIdentity.Breadcrumb = createLink(BreadcrumbAnchor);
