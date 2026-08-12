import {
  Badge,
  Center,
  Group,
  Image,
  Pagination,
  Paper,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { createFileRoute } from '@tanstack/react-router';
import { Surface } from '@ui/surface';
import { icons, Search } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useMemo, useState } from 'react';

import { TOPIC_ICON_TOPICS, TopicIcon } from '@app/components/content/TopicIcon';
import type { TopicIconTopic } from '@app/components/content/TopicIcon';
import { PageLayout } from '@app/components/layout/PageLayout';
import {
  BACKGROUND,
  DECAL,
  GENERIC,
  ICON,
  LOGO,
  TROOP,
  TROOP_MODIFIER,
} from '@game/data/generated';

const PAGE_SIZE = 120;

const DUNE_GROUPS = [
  { name: 'Background', paths: Object.keys(BACKGROUND.enum) },
  { name: 'Decal', paths: Object.keys(DECAL.enum) },
  { name: 'Generic', paths: Object.keys(GENERIC.enum) },
  { name: 'Icon', paths: Object.keys(ICON.enum) },
  { name: 'Logo', paths: Object.keys(LOGO.enum) },
  { name: 'Troop', paths: Object.keys(TROOP.enum) },
  { name: 'Troop modifier', paths: Object.keys(TROOP_MODIFIER.enum) },
] as const;

type CatalogSource = 'topics' | 'lucide' | 'dune';

type CatalogEntry =
  | { source: 'topics'; name: TopicIconTopic; searchText: string }
  | { source: 'lucide'; name: string; icon: LucideIcon; searchText: string }
  | { source: 'dune'; name: string; group: string; path: string; searchText: string };

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

export const Route = createFileRoute('/_app/__icons')({
  codeSplitGroupings: [['component']],
  component: IconsPage,
});

function IconsPage() {
  const [source, setSource] = useState<CatalogSource>('topics');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  const filteredEntries = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const sourceEntries = ENTRIES_BY_SOURCE[source];
    return normalizedQuery.length === 0
      ? sourceEntries
      : sourceEntries.filter((entry) => entry.searchText.includes(normalizedQuery));
  }, [query, source]);

  const pageCount = Math.max(1, Math.ceil(filteredEntries.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visibleEntries = filteredEntries.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

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
                setPage(1);
              }}
            />
            <Tabs
              value={source}
              onChange={(value) => {
                if (!value) {
                  return;
                }
                setSource(value as CatalogSource);
                setPage(1);
              }}
            >
              <Tabs.List grow>
                <Tabs.Tab value="topics">Topics ({TOPIC_ENTRIES.length})</Tabs.Tab>
                <Tabs.Tab value="lucide">Lucide ({LUCIDE_ENTRIES.length})</Tabs.Tab>
                <Tabs.Tab value="dune">Dune SVGs ({DUNE_ENTRIES.length})</Tabs.Tab>
              </Tabs.List>
            </Tabs>
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
                : 'Dune SVGs'}
          </Title>
          <Text size="sm" c="dimmed">
            {filteredEntries.length} {filteredEntries.length === 1 ? 'match' : 'matches'}
          </Text>
        </Group>

        {visibleEntries.length > 0 ? (
          <SimpleGrid cols={{ base: 2, xs: 3, sm: 4, md: 6, lg: 8 }} spacing="md">
            {visibleEntries.map((entry) => (
              <IconCatalogCard entry={entry} key={catalogEntryKey(entry)} />
            ))}
          </SimpleGrid>
        ) : (
          <Surface padding="xl">
            <Text ta="center" c="dimmed">
              No icons match “{query.trim()}”.
            </Text>
          </Surface>
        )}

        {pageCount > 1 ? (
          <Center>
            <Pagination
              value={currentPage}
              onChange={setPage}
              total={pageCount}
              withEdges
              aria-label="Icon catalog pages"
            />
          </Center>
        ) : null}
      </Stack>
    </PageLayout>
  );
}

function IconCatalogCard({ entry }: { entry: CatalogEntry }) {
  return (
    <Surface padding="sm">
      <Stack align="center" gap="sm">
        <Center h={52}>
          {entry.source === 'topics' ? (
            <TopicIcon topic={entry.name} size={36} />
          ) : entry.source === 'lucide' ? (
            <entry.icon size={36} strokeWidth={1.75} aria-hidden />
          ) : (
            <Image src={entry.path} alt="" aria-hidden h={44} w={44} fit="contain" />
          )}
        </Center>
        <Text size="xs" fw={600} ta="center" lineClamp={2} title={entry.name}>
          {entry.name}
        </Text>
        {entry.source === 'dune' ? (
          <Badge variant="light" size="xs">
            {entry.group}
          </Badge>
        ) : null}
      </Stack>
    </Surface>
  );
}

function catalogEntryKey(entry: CatalogEntry) {
  return entry.source === 'dune' ? entry.path : `${entry.source}:${entry.name}`;
}
