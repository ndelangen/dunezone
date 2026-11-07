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

import styles from './TutorialCatalogue.module.css';

/*
 * The tutorial catalogues: every tutorial as a tile, in rows by part (layout A, Norbert 2026-10-23).
 * Read left to right and top to bottom, the tiles are a path; any tile will start its tutorial on its own.
 * Tutorials ship one at a time (Norbert, 2026-10-23), so a tutorial not yet built shows as coming soon and opens nothing.
 * Playing Dune and Creating content are two catalogues on their own routes, and the page toolbar moves between them (Norbert, 2026-11-01).
 */

/** One tile, whichever catalogue it belongs to. */
type CatalogueTile = Readonly<{
  slug: string;
  number: number;
  title: string;
  /** What a reader can do once the tutorial is done, in one line. */
  goal: string;
  minutes: number;
  art: string;
  /** Where the tile opens; a tile without one is coming soon. */
  link?: LinkProps;
}>;

export type CatalogueRow = Readonly<{ part: string; tiles: readonly CatalogueTile[] }>;

export type CatalogueTrack = 'play' | 'create';

const TRACKS: readonly { id: CatalogueTrack; label: string; to: LinkProps['to'] }[] = [
  { id: 'play', label: 'Playing Dune', to: '/tutorial' },
  { id: 'create', label: 'Creating content', to: '/create' },
];

/*
 * A tile: its picture first, then its number beside its title and goal (the prototype Norbert picked, layout A).
 * A tile not yet built keeps its picture in colour and says so in a chip where its minutes are, and opens nothing.
 * A built tile's title is a link that covers the whole tile, so the tile opens the tutorial and reads as one link.
 */
function CatalogueTileView({ tile, eager }: Readonly<{ tile: CatalogueTile; eager: boolean }>) {
  const titleId = useId();
  const title = (
    <>
      <VisuallyHidden component="span">{`Chapter ${tile.number}: `}</VisuallyHidden>
      {tile.title}
    </>
  );
  return (
    <li className={styles.cell}>
      <Surface
        as="article"
        padding="none"
        className={clsx(styles.tile, tile.link && styles.built)}
        aria-labelledby={titleId}
      >
        <div className={styles.art}>
          <img src={tile.art} alt="" loading={eager ? undefined : 'lazy'} />
          <span className={styles.chips}>
            {tile.link ? null : <StatusBadge tone="pending">Coming soon</StatusBadge>}
            <StatusBadge icon={<Clock size={12} aria-hidden />}>{`${tile.minutes} min`}</StatusBadge>
          </span>
        </div>
        <div className={styles.words}>
          <span className={styles.number} aria-hidden>
            {tile.number}
          </span>
          <Text id={titleId} fw={700} lh={1.3}>
            {tile.link ? (
              <Link {...tile.link} className={styles.open}>
                {title}
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

/**
 * The tiles alone, one row per part, each row named by its part.
 * The catalogue page mounts them under its title band, and a blog post shows the same rows in its column.
 * The rows step from one tile across to five by the width of the `page-frame` container they sit in, so a page that gives them less room than the frame names its own.
 * `eager` loads the first row's pictures at once, for a page whose rows open above the fold;
 * a list further down a page leaves them lazy.
 */
export function TutorialTiles({ rows, eager = true }: Readonly<{ rows: readonly CatalogueRow[]; eager?: boolean }>) {
  return (
    <Stack gap="xl">
      {rows.map((row, index) => (
        <Section key={row.part} title={row.part}>
          <ol className={styles.row} aria-label={row.part} start={row.tiles[0]!.number}>
            {row.tiles.map((tile) => (
              <CatalogueTileView key={tile.slug} tile={tile} eager={eager && index === 0} />
            ))}
          </ol>
        </Section>
      ))}
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
}: Readonly<{
  track: CatalogueTrack;
  /** The page's name, its framed subtitle and its one-sentence purpose, as `PageTitle` takes them. */
  title: string;
  subtitle: string;
  lede: string;
  rows: readonly CatalogueRow[];
}>) {
  return (
    <PageLayout>
      <PageLayout.Header size="hero">
        <Stack gap="md" miw={0} align="center" ta="center">
          <PageTitle title={title} subtitle={subtitle} lede={lede} />
        </Stack>
      </PageLayout.Header>
      <PageLayout.Toolbar>
        <TutorialTracks track={track} />
      </PageLayout.Toolbar>
      <PageLayout.Content>
        <TutorialTiles rows={rows} />
      </PageLayout.Content>
    </PageLayout>
  );
}
