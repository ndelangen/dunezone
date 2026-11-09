import { Stack, Text, VisuallyHidden } from '@mantine/core';
/* oxlint-disable-next-line no-restricted-imports -- The tutorial landing pages stay as they are (Norbert, 2026-11-05). */
import { Button } from '@mantine/core';
import { Link } from '@tanstack/react-router';
import type { LinkProps } from '@tanstack/react-router';
import { PageTitle } from '@ui/block/PageTitle';
import { Section } from '@ui/block/Section';
import { StatusBadge } from '@ui/content/StatusBadge';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import { Toolbar } from '@ui/surface/Toolbar';
import clsx from 'clsx';
import { Clock } from 'lucide-react';
import { useId } from 'react';
import type { ReactNode } from 'react';

import styles from './TutorialCatalogue.module.css';

/*
 * The tutorial catalogues: every tutorial as a tile, in rows by part (layout A, Norbert 2026-10-23).
 * Read left to right and top to bottom, the tiles are a path; any tile will start its tutorial on its own.
 * Tutorials ship one at a time (Norbert, 2026-10-23), so a tutorial not yet built shows as coming soon and opens nothing.
 * The tools catalogue wears the same tiles (Norbert, 2026-11-09): a tool not yet built also shows as coming soon, but opens its placeholder page.
 * Playing Dune and Creating content are two catalogues on their own routes, and the page toolbar moves between them (Norbert, 2026-11-01).
 */

/** One tile, whichever catalogue it belongs to. The tools catalogue at /tools wears the same tiles (Norbert, 2026-11-09), without numbers or minutes. */
type CatalogueTile = Readonly<{
  slug: string;
  /** The tutorial's place on the path; tools have none, since they are not read in order. */
  number?: number;
  title: string;
  /** What a reader can do once the tutorial is done, in one line. */
  goal: string;
  minutes?: number;
  /** The tile's picture; a tile without one shows its `placeholder` in the same frame. */
  art?: string;
  /** What fills the picture frame while there is no picture yet, such as a tool's mark. */
  placeholder?: ReactNode;
  /** Where the tile opens. */
  link?: LinkProps;
  /** Whether the link opens in a tab of its own, as a built tool does from the tools catalogue. */
  newTab?: boolean;
  /** Whether it is ready; by default a tile with a link is, and one without is coming soon. A tool not yet built still opens its placeholder page. */
  built?: boolean;
}>;

export type CatalogueRow = Readonly<{ part: string; tiles: readonly CatalogueTile[] }>;

export type CatalogueTrack = 'play' | 'create';

const TRACKS: readonly { id: CatalogueTrack; label: string; to: LinkProps['to'] }[] = [
  { id: 'play', label: 'Playing Dune', to: '/tutorial' },
  { id: 'create', label: 'Creating content', to: '/create' },
];

/*
 * A tile: its picture first, then its number beside its title and goal (the prototype Norbert picked, layout A).
 * A tile not yet built keeps its picture in colour and says so in a chip where its minutes are; a tutorial's opens nothing, a tool's opens its placeholder.
 * A tile with a link has a title that covers the whole tile, so the tile opens and reads as one link.
 */
function CatalogueTileView({ tile, eager }: Readonly<{ tile: CatalogueTile; eager: boolean }>) {
  const titleId = useId();
  const built = tile.built ?? tile.link !== undefined;
  const title = (
    <>
      {tile.number === undefined ? null : (
        <VisuallyHidden component="span">{`Chapter ${tile.number}: `}</VisuallyHidden>
      )}
      {tile.title}
    </>
  );
  return (
    <li className={styles.cell}>
      <Surface
        as="article"
        padding="none"
        className={clsx(styles.tile, tile.link && styles.linked)}
        aria-labelledby={titleId}
      >
        <div className={styles.art}>
          {tile.art === undefined ? (
            <div className={styles.placeholder} aria-hidden>
              {tile.placeholder}
            </div>
          ) : (
            <img src={tile.art} alt="" loading={eager ? undefined : 'lazy'} />
          )}
          <span className={styles.chips}>
            {built ? null : <StatusBadge tone="pending">Coming soon</StatusBadge>}
            {tile.minutes === undefined ? null : (
              <StatusBadge icon={<Clock size={12} aria-hidden />}>{`${tile.minutes} min`}</StatusBadge>
            )}
          </span>
        </div>
        <div className={clsx(styles.words, tile.number === undefined && styles.unnumbered)}>
          {tile.number === undefined ? null : (
            <span className={styles.number} aria-hidden>
              {tile.number}
            </span>
          )}
          <Text id={titleId} fw={700} lh={1.3}>
            {tile.link ? (
              <Link
                {...tile.link}
                className={styles.open}
                {...(tile.newTab ? { target: '_blank', rel: 'noopener' } : {})}
              >
                {title}
                {tile.newTab ? <VisuallyHidden component="span"> (opens in a new tab)</VisuallyHidden> : null}
              </Link>
            ) : (
              title
            )}
          </Text>
          <Text size="sm" c="dimmed" lh={1.35}>
            {tile.goal}
          </Text>
        </div>
      </Surface>
    </li>
  );
}

/* The page toolbar's two buttons, each the route of its catalogue (Norbert, 2026-11-01). */
function TutorialTracks({ track }: Readonly<{ track: CatalogueTrack }>) {
  return (
    <Toolbar>
      <Toolbar.Left label="Tutorials">
        {TRACKS.map((option) => (
          <Button
            key={option.id}
            variant={option.id === track ? 'filled' : 'default'}
            renderRoot={(props) => <Link {...props} to={option.to} />}
          >
            {option.label}
          </Button>
        ))}
      </Toolbar.Left>
    </Toolbar>
  );
}

/* The tiles, one row per part; the first row's pictures load at once. */
function TutorialRows({ rows, blur }: Readonly<{ rows: readonly CatalogueRow[]; blur: boolean }>) {
  return (
    <Stack gap="xl">
      {rows.map((row, index) => {
        /* Tutorials are a path, so numbered; tools are not. */
        const List = row.tiles[0]?.number === undefined ? 'ul' : 'ol';
        return (
          <Section key={row.part} title={row.part}>
            <List
              className={clsx(styles.row, !blur && styles.unblurred)}
              aria-label={row.part}
              start={row.tiles[0]?.number}
            >
              {row.tiles.map((tile) => (
                <CatalogueTileView key={tile.slug} tile={tile} eager={index === 0} />
              ))}
            </List>
          </Section>
        );
      })}
    </Stack>
  );
}

/**
 * A tutorial catalogue page, whole: its title band, the toolbar that moves between the two tracks, and the tiles in rows by part.
 * The two tracks are one page with different words and tiles, so the route hands over its words, its track and its rows.
 */
export function TutorialCatalogue({
  track,
  title,
  subtitle,
  lede,
  rows,
  footer,
  blur = false,
}: Readonly<{
  /** The tutorial track, whose toolbar moves between the two; the tools catalogue has none. */
  track?: CatalogueTrack;
  /** The page's name, its framed subtitle and its one-sentence purpose, as `PageTitle` takes them. */
  title: string;
  subtitle: string;
  lede: string;
  rows: readonly CatalogueRow[];
  /** Anything after the rows, such as the tools catalogue's request for the next tool. */
  footer?: ReactNode;
  /** Keep the panes' live blur; only for a short catalogue, since many blurred panes make scrolling stutter (#2652). */
  blur?: boolean;
}>) {
  return (
    <PageLayout>
      <PageLayout.Header size="hero">
        <Stack gap="md" miw={0} align="center" ta="center">
          <PageTitle title={title} subtitle={subtitle} lede={lede} />
        </Stack>
      </PageLayout.Header>
      {track === undefined ? null : (
        <PageLayout.Toolbar>
          <TutorialTracks track={track} />
        </PageLayout.Toolbar>
      )}
      <PageLayout.Content>
        <Stack gap="xl">
          <TutorialRows rows={rows} blur={blur} />
          {footer}
        </Stack>
      </PageLayout.Content>
    </PageLayout>
  );
}
