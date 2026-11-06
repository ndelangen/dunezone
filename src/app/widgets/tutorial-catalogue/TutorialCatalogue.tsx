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

const TRACKS: readonly {
  id: CatalogueTrack;
  label: string;
  to: LinkProps['to'];
  title: string;
  subtitle: string;
  lede: string;
}[] = [
  {
    id: 'play',
    label: 'Playing Dune',
    to: '/tutorial',
    title: 'Learn to play',
    subtitle: 'How Dune Zone Play works',
    lede: 'Pick what you want to learn, or follow the chapters in order. Every chapter is a table you can play with.',
  },
  {
    id: 'create',
    label: 'Creating content',
    to: '/create',
    title: 'Learn to create',
    subtitle: 'How to make your own Dune content',
    lede: 'Make your own factions, cards, boards and Rulebooks. Start with a faction, or pick what you want to make.',
  },
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

/* The tiles, one row per part; the first row's pictures load at once. */
function TutorialRows({ rows }: Readonly<{ rows: readonly CatalogueRow[] }>) {
  return (
    <Stack gap="xl">
      {rows.map((row, index) => (
        <Section key={row.part} title={row.part}>
          <ol className={styles.row} aria-label={row.part} start={row.tiles[0]!.number}>
            {row.tiles.map((tile) => (
              <CatalogueTileView key={tile.slug} tile={tile} eager={index === 0} />
            ))}
          </ol>
        </Section>
      ))}
    </Stack>
  );
}

/**
 * A tutorial catalogue page, whole: its title band, the toolbar that moves between the two tracks, and the tiles in rows by part.
 * The two tracks are one page with different words and tiles, so the route names its track and hands over its rows.
 */
export function TutorialCatalogue({ track, rows }: Readonly<{ track: CatalogueTrack; rows: readonly CatalogueRow[] }>) {
  const words = TRACKS.find((option) => option.id === track)!;
  return (
    <PageLayout>
      <PageLayout.Header size="hero">
        <Stack gap="md" miw={0} align="center" ta="center">
          <PageTitle title={words.title} subtitle={words.subtitle} lede={words.lede} />
        </Stack>
      </PageLayout.Header>
      <PageLayout.Toolbar>
        <TutorialTracks track={track} />
      </PageLayout.Toolbar>
      <PageLayout.Content>
        <TutorialRows rows={rows} />
      </PageLayout.Content>
    </PageLayout>
  );
}
