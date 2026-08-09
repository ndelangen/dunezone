import {
  Card,
  Chip,
  Group,
  Paper,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { createFileRoute } from '@tanstack/react-router';
import { icons, Search } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { PageLayout } from '@app/components/shell';
import { TOPIC_ICON_TOPICS, TopicIcon } from '@app/components/topics/TopicIcon';
import type { TopicIconTopic } from '@app/components/topics/TopicIcon';
import {
  BACKGROUND,
  DECAL,
  GENERIC,
  ICON,
  LOGO,
  TROOP,
  TROOP_MODIFIER,
} from '@game/data/generated';

const BATCH_SIZE = 60;

const DUNE_GROUPS = [
  { name: 'Background', paths: Object.keys(BACKGROUND.enum) },
  { name: 'Decal', paths: Object.keys(DECAL.enum) },
  { name: 'Generic', paths: Object.keys(GENERIC.enum) },
  { name: 'Icon', paths: Object.keys(ICON.enum) },
  { name: 'Logo', paths: Object.keys(LOGO.enum) },
  { name: 'Troop', paths: Object.keys(TROOP.enum) },
  { name: 'Troop modifier', paths: Object.keys(TROOP_MODIFIER.enum) },
] as const;

const ALL_DUNE_CATEGORY = 'all';
type DuneCategory = (typeof DUNE_GROUPS)[number]['name'] | typeof ALL_DUNE_CATEGORY;

type SortMode = 'name' | 'size-asc' | 'size-desc';
const SORT_OPTIONS: { label: string; value: SortMode }[] = [
  { label: 'Name', value: 'name' },
  { label: 'Size ↑', value: 'size-asc' },
  { label: 'Size ↓', value: 'size-desc' },
];

type CatalogSource = 'topics' | 'lucide' | 'dune';

type CatalogEntry =
  | { source: 'topics'; name: TopicIconTopic; searchText: string }
  | { source: 'lucide'; name: string; icon: LucideIcon; searchText: string }
  | { source: 'dune'; name: string; group: string; path: string; searchText: string };
type DuneCatalogEntry = Extract<CatalogEntry, { source: 'dune' }>;

const TOPIC_ENTRIES: CatalogEntry[] = TOPIC_ICON_TOPICS.map((name) => ({
  source: 'topics',
  name,
  searchText: name.toLowerCase(),
}));

const LUCIDE_ENTRIES: CatalogEntry[] = (Object.entries(icons) as Array<[string, LucideIcon]>).map(
  ([name, icon]) => ({
    source: 'lucide',
    name,
    icon,
    searchText: name.toLowerCase(),
  })
);

const DUNE_ENTRIES: CatalogEntry[] = DUNE_GROUPS.flatMap(({ name: group, paths }) =>
  paths.map((path) => {
    const name =
      path
        .split('/')
        .at(-1)
        ?.replace(/\.svg$/, '') ?? path;
    return {
      source: 'dune' as const,
      name,
      group,
      path,
      searchText: `${name} ${group} ${path}`.toLowerCase(),
    };
  })
);

const ENTRIES_BY_SOURCE: Record<CatalogSource, CatalogEntry[]> = {
  topics: TOPIC_ENTRIES,
  lucide: LUCIDE_ENTRIES,
  dune: DUNE_ENTRIES,
};

/**
 * Grows `visibleCount` in `BATCH_SIZE` steps as a sentinel element at the bottom of the grid enters
 * the viewport, and resets it whenever `resetKey` changes (new search, tab, or category).
 */
function useInfiniteReveal(total: number, resetKey: string) {
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setVisibleCount(BATCH_SIZE);
  }, [resetKey]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((count) => Math.min(count + BATCH_SIZE, total));
        }
      },
      { rootMargin: '600px' }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [total]);

  return { visibleCount: Math.min(visibleCount, total), sentinelRef };
}

/** Shared across mounts so navigating away from and back to the Dune SVGs tab re-fetches nothing. */
const svgByteSizeCache = new Map<string, number>();

function formatBytes(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

/**
 * Byte size isn't in the generated manifest, so it's measured client-side, once, from the same
 * static files `<use>` already renders. Fetches every uncached Dune SVG in parallel the first time
 * the Dune SVGs tab opens, and bumps `version` in batches so cards and sort fill in progressively
 * rather than waiting on all ~500 requests to land.
 */
function useDuneSvgSizes(enabled: boolean) {
  const [version, setVersion] = useState(0);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!enabled || startedRef.current) {
      return;
    }
    startedRef.current = true;

    const missing = DUNE_ENTRIES.filter(
      (entry): entry is DuneCatalogEntry =>
        entry.source === 'dune' && !svgByteSizeCache.has(entry.path)
    );
    let completed = 0;
    let cancelled = false;

    for (const entry of missing) {
      fetch(entry.path)
        .then((response) => response.arrayBuffer())
        .then((buffer) => {
          svgByteSizeCache.set(entry.path, buffer.byteLength);
        })
        .catch(() => {
          // Leave unmeasured — size display/sort just treats it as unknown.
        })
        .finally(() => {
          completed += 1;
          if (!cancelled && (completed % 32 === 0 || completed === missing.length)) {
            setVersion((v) => v + 1);
          }
        });
    }

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return version;
}

export const Route = createFileRoute('/_app/__icons')({
  codeSplitGroupings: [['component']],
  component: IconsPage,
});

function IconsPage() {
  const [source, setSource] = useState<CatalogSource>('topics');
  const [category, setCategory] = useState<DuneCategory>(ALL_DUNE_CATEGORY);
  const [sortMode, setSortMode] = useState<SortMode>('name');
  const [query, setQuery] = useState('');

  const sizesVersion = useDuneSvgSizes(source === 'dune');
  const measuredSizeCount = source === 'dune' ? svgByteSizeCache.size : 0;

  const filteredEntries = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const sourceEntries = ENTRIES_BY_SOURCE[source];
    const categoryFiltered =
      source === 'dune' && category !== ALL_DUNE_CATEGORY
        ? sourceEntries.filter((entry) => entry.source === 'dune' && entry.group === category)
        : sourceEntries;
    return normalizedQuery.length === 0
      ? categoryFiltered
      : categoryFiltered.filter((entry) => entry.searchText.includes(normalizedQuery));
  }, [query, source, category]);

  const sortedEntries = useMemo(() => {
    if (source !== 'dune' || sortMode === 'name') {
      return filteredEntries;
    }
    const direction = sortMode === 'size-asc' ? 1 : -1;
    return filteredEntries.slice().sort((a, b) => {
      const sizeA =
        a.source === 'dune' ? (svgByteSizeCache.get(a.path) ?? Number.POSITIVE_INFINITY) : 0;
      const sizeB =
        b.source === 'dune' ? (svgByteSizeCache.get(b.path) ?? Number.POSITIVE_INFINITY) : 0;
      return (sizeA - sizeB) * direction;
    });
    // sizesVersion isn't read directly, but its change means the cache this sort reads has grown.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredEntries, sortMode, source, sizesVersion]);

  const { visibleCount, sentinelRef } = useInfiniteReveal(
    sortedEntries.length,
    `${source}:${category}:${sortMode}:${query.trim().toLowerCase()}`
  );
  const visibleEntries = sortedEntries.slice(0, visibleCount);

  return (
    <PageLayout
      headerSize="compact"
      header={
        <Stack align="center" gap="xs">
          <Title order={1}>Icon catalog</Title>
          <Text ta="center" maw={680}>
            Browse the canonical application topics, Lucide library, and Dune SVG assets available
            in this project.
          </Text>
        </Stack>
      }
      toolbar={
        <Paper withBorder p="md" radius="md" mb="xl">
          <Stack gap="md">
            <TextInput
              aria-label="Search icons"
              placeholder="Search icons by name, group, or path"
              leftSection={<Search size={16} aria-hidden />}
              value={query}
              onChange={(event) => {
                setQuery(event.currentTarget.value);
              }}
            />
            <Tabs
              value={source}
              onChange={(value) => {
                if (!value) {
                  return;
                }
                setSource(value as CatalogSource);
              }}
            >
              <Tabs.List grow>
                <Tabs.Tab value="topics">Topics ({TOPIC_ENTRIES.length})</Tabs.Tab>
                <Tabs.Tab value="lucide">Lucide ({LUCIDE_ENTRIES.length})</Tabs.Tab>
                <Tabs.Tab value="dune">Dune SVGs ({DUNE_ENTRIES.length})</Tabs.Tab>
              </Tabs.List>
            </Tabs>
            {source === 'dune' ? (
              <Chip.Group
                value={category}
                onChange={(value) => {
                  setCategory(value as DuneCategory);
                }}
              >
                <Group gap="xs">
                  <Chip value={ALL_DUNE_CATEGORY} size="xs" variant="light">
                    All ({DUNE_ENTRIES.length})
                  </Chip>
                  {DUNE_GROUPS.map((group) => (
                    <Chip key={group.name} value={group.name} size="xs" variant="light">
                      {group.name} ({group.paths.length})
                    </Chip>
                  ))}
                </Group>
              </Chip.Group>
            ) : null}
            {source === 'dune' ? (
              <Group gap="sm" align="center">
                <Text size="xs" c="dimmed">
                  Sort
                </Text>
                <SegmentedControl
                  size="xs"
                  value={sortMode}
                  onChange={(value) => setSortMode(value as SortMode)}
                  data={SORT_OPTIONS}
                />
                {measuredSizeCount < DUNE_ENTRIES.length ? (
                  <Text size="xs" c="dimmed">
                    measuring sizes… {measuredSizeCount}/{DUNE_ENTRIES.length}
                  </Text>
                ) : null}
              </Group>
            ) : null}
          </Stack>
        </Paper>
      }
    >
      <Stack gap="lg">
        <Group justify="space-between" align="baseline" gap="sm">
          <Title order={2} size="h3">
            {source === 'topics'
              ? 'Canonical topics'
              : source === 'lucide'
                ? 'Lucide'
                : category === ALL_DUNE_CATEGORY
                  ? 'Dune SVGs'
                  : `Dune SVGs — ${category}`}
          </Title>
          <Text size="sm" c="dimmed">
            showing {visibleEntries.length} of {sortedEntries.length}{' '}
            {sortedEntries.length === 1 ? 'match' : 'matches'}
          </Text>
        </Group>

        {visibleEntries.length > 0 ? (
          <SimpleGrid cols={{ base: 2, xs: 3, sm: 4, md: 5 }} spacing="xs">
            {visibleEntries.map((entry) => (
              <IconCatalogCard entry={entry} key={catalogEntryKey(entry)} />
            ))}
          </SimpleGrid>
        ) : (
          <Paper withBorder p="xl" radius="md">
            <Text ta="center" c="dimmed">
              No icons match “{query.trim()}”.
            </Text>
          </Paper>
        )}

        {visibleCount < sortedEntries.length ? (
          <div ref={sentinelRef} style={{ height: 1 }} aria-hidden />
        ) : null}
      </Stack>
    </PageLayout>
  );
}

/** Square, fills the card's full width — `<svg width="100%" height="100%">` scales to fit it. */
const iconSlotStyle = {
  width: '100%',
  aspectRatio: '1 / 1',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
} as const;

function IconCatalogCard({ entry }: { entry: CatalogEntry }) {
  const sizeBytes = entry.source === 'dune' ? svgByteSizeCache.get(entry.path) : undefined;

  return (
    <Card withBorder padding={6} radius="md">
      <Stack align="center" gap={2}>
        <div style={iconSlotStyle}>
          {entry.source === 'topics' ? (
            <TopicIcon topic={entry.name} size={64} />
          ) : entry.source === 'lucide' ? (
            <entry.icon size={64} strokeWidth={1.75} aria-hidden />
          ) : (
            <svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden>
              <use xlinkHref={`${entry.path}#root`} fill="currentColor" />
            </svg>
          )}
        </div>
        <Text size="10px" fw={600} ta="center" lineClamp={1} title={entry.name}>
          {entry.name}
        </Text>
        {entry.source === 'dune' ? (
          <Text size="9px" c="dimmed" ta="center">
            {entry.group}
            {sizeBytes !== undefined ? ` · ${formatBytes(sizeBytes)}` : ''}
          </Text>
        ) : null}
      </Stack>
    </Card>
  );
}

function catalogEntryKey(entry: CatalogEntry) {
  return entry.source === 'dune' ? entry.path : `${entry.source}:${entry.name}`;
}
