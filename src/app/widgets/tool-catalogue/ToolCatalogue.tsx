import { Stack, Text, ThemeIcon } from '@mantine/core';
import { Link } from '@tanstack/react-router';
import type { LinkProps } from '@tanstack/react-router';
import { PageTitle } from '@ui/block/PageTitle';
import { Section } from '@ui/block/Section';
import { StatusBadge } from '@ui/content/StatusBadge';
import { LabeledAction } from '@ui/control/LabeledAction';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import { Lightbulb, MessageCirclePlus } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useId } from 'react';

import styles from './ToolCatalogue.module.css';

/*
 * The tools catalogue at /tools: every tool as a tile, in rows by when a table reaches for it.
 * Modelled on the tutorial catalogues, so a tool not yet built says so in a chip and still opens: its page says what it will do.
 * Mobile first like the tools themselves; the rows step from one tile across to two, three and four.
 */

export type ToolTile = Readonly<{
  slug: string;
  title: string;
  goal: string;
  icon: LucideIcon;
  /** Where the tile opens: the tool, or its placeholder while it is coming soon. */
  link: LinkProps;
  built: boolean;
}>;

export type ToolRow = Readonly<{ group: string; tiles: readonly ToolTile[] }>;

/* A tile: the tool's mark and its status, then its name and what it does. The name is a link that covers the whole tile. */
function ToolTileView({ tile }: Readonly<{ tile: ToolTile }>) {
  const titleId = useId();
  const Icon = tile.icon;
  return (
    <li className={styles.cell}>
      <Surface as="article" padding="md" className={styles.tile} aria-labelledby={titleId}>
        <Stack gap="sm">
          <div className={styles.head}>
            <ThemeIcon size={48} radius="50%" variant="light" color="dune" aria-hidden>
              <Icon size={24} />
            </ThemeIcon>
            {tile.built ? null : <StatusBadge tone="pending">Coming soon</StatusBadge>}
          </div>
          <Stack gap={4}>
            <Text id={titleId} fw={700} lh={1.3}>
              <Link {...tile.link} className={styles.open}>
                {tile.title}
              </Link>
            </Text>
            <Text size="sm" c="dimmed" lh={1.35}>
              {tile.goal}
            </Text>
          </Stack>
        </Stack>
      </Surface>
    </li>
  );
}

/**
 * The tools catalogue page, whole: its title band, the tiles in rows by group, and a way to ask for the next tool.
 * The route hands over the rows, so the page has no idea which tools exist.
 */
export function ToolCatalogue({ rows, suggestHref }: Readonly<{ rows: readonly ToolRow[]; suggestHref: string }>) {
  return (
    <PageLayout>
      <PageLayout.Header size="hero">
        <Stack gap="md" miw={0} align="center" ta="center">
          <PageTitle
            title="Tools"
            subtitle="Helpers for your Dune table"
            lede="Small, free tools for a game of Dune at a real table. Made for your phone, no account needed, and they follow the Ruleset you play."
          />
        </Stack>
      </PageLayout.Header>
      <PageLayout.Content>
        <Stack gap="xl">
          {rows.map((row) => (
            <Section key={row.group} title={row.group}>
              <ul className={styles.row} aria-label={row.group}>
                {row.tiles.map((tile) => (
                  <ToolTileView key={tile.slug} tile={tile} />
                ))}
              </ul>
            </Section>
          ))}
          <Surface as="section" aria-label="Suggest a tool" padding="lg" className={styles.suggest}>
            <ThemeIcon size={56} radius="50%" variant="light" color="dune" aria-hidden>
              <Lightbulb />
            </ThemeIcon>
            <Stack gap={4} className={styles.suggestWords}>
              <Text fw={700}>Missing a tool?</Text>
              <Text size="sm" c="dimmed">
                Tell us what you keep track of on paper, and it may be the next one here.
              </Text>
            </Stack>
            <LabeledAction
              emphasis="strong"
              icon={<MessageCirclePlus size={17} />}
              href={suggestHref}
              target="_blank"
              rel="noopener noreferrer"
            >
              Suggest a tool
            </LabeledAction>
          </Surface>
        </Stack>
      </PageLayout.Content>
    </PageLayout>
  );
}
