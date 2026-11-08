import { Anchor, Box, Group, Stack, Text, ThemeIcon } from '@mantine/core';
import { Link } from '@tanstack/react-router';
import type { LinkProps } from '@tanstack/react-router';
import { OpenableTile } from '@ui/block/OpenableTile';
import { PageTitle } from '@ui/block/PageTitle';
import { Section } from '@ui/block/Section';
import { Eyebrow } from '@ui/content/Eyebrow';
import { StatusBadge } from '@ui/content/StatusBadge';
import { LabeledAction } from '@ui/control/LabeledAction';
import { AtlasLayout } from '@ui/layout/AtlasLayout';
import { PageLayout } from '@ui/layout/PageLayout';
import { Bullets } from '@ui/list/Bullets';
import { ChipList } from '@ui/list/ChipList';
import { TileGrid } from '@ui/list/TileGrid';
import { Surface } from '@ui/surface';
import { Spotlight } from '@ui/surface/Spotlight';
import { ArrowRight, ChevronRight, Lightbulb, MessageCirclePlus } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useId } from 'react';

import styles from './ToolCatalogue.module.css';

/*
 * The tools catalogue at /tools: every tool, in rows by when a table reaches for it.
 * A tool not yet built says so and still opens: its page says what it will do.
 * The layouts below are the options shown to Norbert (2026-11-08) after the first tiles did not land; the picked one stays, the rest go.
 */

export type ToolTile = Readonly<{
  slug: string;
  title: string;
  goal: string;
  /** What the tool does and who it is for, in a sentence. */
  statement: string;
  /** The three things it does, by name. */
  points: readonly string[];
  icon: LucideIcon;
  /** Where the tile opens: the tool, or its placeholder while it is coming soon. */
  link: LinkProps;
  built: boolean;
}>;

export type ToolRow = Readonly<{ group: string; tiles: readonly ToolTile[] }>;

export type ToolCatalogueLayout = 'tiles' | 'shelf' | 'launcher' | 'ledger' | 'atlas' | 'featured';

function Soon({ tile }: Readonly<{ tile: ToolTile }>) {
  return tile.built ? null : <StatusBadge tone="pending">Coming soon</StatusBadge>;
}

/* A: the first tiles, kept for comparison. */
function TileView({ tile }: Readonly<{ tile: ToolTile }>) {
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
            <Soon tile={tile} />
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

function TilesLayout({ rows }: Readonly<{ rows: readonly ToolRow[] }>) {
  return rows.map((row) => (
    <Section key={row.group} title={row.group}>
      <ul className={styles.row} aria-label={row.group}>
        {row.tiles.map((tile) => (
          <TileView key={tile.slug} tile={tile} />
        ))}
      </ul>
    </Section>
  ));
}

/* B: a shelf of Spotlights, the kit's "go to this one thing" row, two or three across. */
function ShelfLayout({ rows }: Readonly<{ rows: readonly ToolRow[] }>) {
  return rows.map((row) => (
    <Section key={row.group} title={row.group}>
      <TileGrid size="wide" aria-label={row.group}>
        {row.tiles.map((tile) => {
          const Icon = tile.icon;
          return (
            <Spotlight
              key={tile.slug}
              media={
                <ThemeIcon size="100%" radius="50%" variant="light" color="dune">
                  <Icon size={26} />
                </ThemeIcon>
              }
              eyebrow={tile.built ? undefined : 'Coming soon'}
              title={tile.title}
              meta={tile.goal}
              renderRoot={(props) => <Link {...props} {...tile.link} />}
            />
          );
        })}
      </TileGrid>
    </Section>
  ));
}

/* C: a phone's home screen. Big round marks with a name beneath, so a tool is one thumb away. */
function LauncherLayout({ rows }: Readonly<{ rows: readonly ToolRow[] }>) {
  return rows.map((row) => (
    <Section key={row.group} title={row.group} alignment="center">
      <TileGrid aria-label={row.group}>
        {row.tiles.map((tile) => {
          const Icon = tile.icon;
          return (
            <OpenableTile
              key={tile.slug}
              caption={tile.title}
              renderRoot={(props) => <Link {...props} {...tile.link} />}
            >
              <div className={styles.launcherArt}>
                <ThemeIcon size={96} radius="50%" variant="light" color="dune">
                  <Icon size={44} strokeWidth={1.5} />
                </ThemeIcon>
                {tile.built ? null : <span className={styles.launcherSoon}>Soon</span>}
              </div>
            </OpenableTile>
          );
        })}
      </TileGrid>
    </Section>
  ));
}

/* D: one pane per group, a divided list of rows: mark, name and line, what it does as tags, and a chevron. */
function LedgerLayout({ rows }: Readonly<{ rows: readonly ToolRow[] }>) {
  return rows.map((row) => (
    <Section key={row.group} title={row.group}>
      <Surface padding="none">
        <ul className={styles.ledger} aria-label={row.group}>
          {row.tiles.map((tile) => {
            const Icon = tile.icon;
            return (
              <li key={tile.slug}>
                <Link {...tile.link} className={styles.ledgerRow}>
                  <ThemeIcon size={44} radius="50%" variant="light" color="dune" aria-hidden>
                    <Icon size={22} />
                  </ThemeIcon>
                  <Stack gap={2} miw={0} className={styles.ledgerWords}>
                    <Group gap="xs">
                      <Text fw={700}>{tile.title}</Text>
                      <Soon tile={tile} />
                    </Group>
                    <Text size="sm" c="dimmed">
                      {tile.goal}
                    </Text>
                  </Stack>
                  <div className={styles.ledgerPoints}>
                    <ChipList items={tile.points.map((point) => ({ key: point, label: point }))} />
                  </div>
                  <ChevronRight size={18} aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      </Surface>
    </Section>
  ));
}

/* E: the Future plans atlas: the groups in a side index, each tool an editorial entry with its number. */
function AtlasCatalogue({ rows }: Readonly<{ rows: readonly ToolRow[] }>) {
  const numbers = new Map(rows.flatMap((row) => row.tiles).map((tile, index) => [tile.slug, index + 1]));
  return (
    <AtlasLayout>
      <AtlasLayout.Sidebar>
        <Stack component="aside" gap="md">
          <Eyebrow>The shelf</Eyebrow>
          <nav aria-label="Tool groups">
            <Bullets gap="none">
              {rows.map((row) => {
                const Icon = row.tiles[0]!.icon;
                return (
                  <Bullets.Item
                    key={row.group}
                    icon={<Icon />}
                    title={row.group}
                    trailing={<ArrowRight size={16} aria-hidden />}
                    renderLink={(content) => (
                      <Anchor className={styles.indexLink} href={`#tools-${row.group.replace(/\W+/g, '-')}`}>
                        {content}
                      </Anchor>
                    )}
                  />
                );
              })}
            </Bullets>
          </nav>
        </Stack>
      </AtlasLayout.Sidebar>
      <AtlasLayout.Content>
        <Stack gap="xl">
          {rows.map((row) => (
            <Section key={row.group} title={row.group} id={`tools-${row.group.replace(/\W+/g, '-')}`}>
              <Stack gap="lg" component="ul" aria-label={row.group} className={styles.atlasList}>
                {row.tiles.map((tile) => {
                  const number = numbers.get(tile.slug) ?? 0;
                  return (
                    <li key={tile.slug} className={styles.atlasEntry}>
                      <Text className={styles.coordinate} aria-hidden>
                        {String(number).padStart(2, '0')}
                      </Text>
                      <Stack gap={6} miw={0}>
                        <Group gap="xs">
                          <Text fw={700} size="lg">
                            <Link {...tile.link} className={styles.atlasLink}>
                              {tile.title}
                            </Link>
                          </Text>
                          <Soon tile={tile} />
                        </Group>
                        <Text c="dimmed">{tile.statement}</Text>
                        <ChipList items={tile.points.map((point) => ({ key: point, label: point }))} />
                      </Stack>
                    </li>
                  );
                })}
              </Stack>
            </Section>
          ))}
        </Stack>
      </AtlasLayout.Content>
    </AtlasLayout>
  );
}

/* F: the first tool on its own as a feature, the others as a compact list beneath. */
function FeaturedLayout({ rows }: Readonly<{ rows: readonly ToolRow[] }>) {
  const all = rows.flatMap((row) => row.tiles);
  const featured = all.find((tile) => tile.slug === 'atreides-treachery-tracker') ?? all[0]!;
  const FeaturedIcon = featured.icon;
  return (
    <>
      <Surface as="section" aria-label="First up" padding="xl" className={styles.feature}>
        <ThemeIcon size={112} radius="50%" variant="light" color="dune" aria-hidden>
          <FeaturedIcon size={56} strokeWidth={1.5} />
        </ThemeIcon>
        <Stack gap="sm" className={styles.featureWords}>
          <Group gap="xs">
            <Eyebrow tone="accent">First up</Eyebrow>
            <Soon tile={featured} />
          </Group>
          <Text fw={800} size="xl">
            <Link {...featured.link} className={styles.atlasLink}>
              {featured.title}
            </Link>
          </Text>
          <Text c="dimmed">{featured.statement}</Text>
          <ChipList items={featured.points.map((point) => ({ key: point, label: point }))} />
          <Box>
            <LabeledAction
              emphasis="strong"
              icon={<ArrowRight size={17} />}
              renderRoot={(props) => <Link {...props} {...featured.link} />}
            >
              {featured.built ? 'Open the tracker' : 'See what it will do'}
            </LabeledAction>
          </Box>
        </Stack>
      </Surface>
      {rows.map((row) => {
        const rest = row.tiles.filter((tile) => tile !== featured);
        return (
          <Section key={row.group} title={row.group}>
            <Bullets gap="xl" columns={{ base: 1, sm: 2, lg: 3 }}>
              {rest.map((tile) => {
                const Icon = tile.icon;
                return (
                  <Bullets.Item
                    key={tile.slug}
                    icon={<Icon />}
                    title={tile.title}
                    detail={tile.goal}
                    renderLink={(content) => (
                      <Link {...tile.link} className={styles.bulletLink}>
                        {content}
                      </Link>
                    )}
                  />
                );
              })}
            </Bullets>
          </Section>
        );
      })}
    </>
  );
}

const LAYOUTS: Record<ToolCatalogueLayout, (props: Readonly<{ rows: readonly ToolRow[] }>) => React.ReactNode> = {
  tiles: TilesLayout,
  shelf: ShelfLayout,
  launcher: LauncherLayout,
  ledger: LedgerLayout,
  atlas: AtlasCatalogue,
  featured: FeaturedLayout,
};

/**
 * The tools catalogue page, whole: its title band, the tools by group, and a way to ask for the next tool.
 * The route hands over the rows, so the page has no idea which tools exist.
 */
export function ToolCatalogue({
  rows,
  suggestHref,
  layout = 'tiles',
}: Readonly<{ rows: readonly ToolRow[]; suggestHref: string; layout?: ToolCatalogueLayout }>) {
  const Layout = LAYOUTS[layout];
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
          <Layout rows={rows} />
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
