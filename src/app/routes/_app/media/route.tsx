import { Anchor, Button, Group, Select, Stack, Text, Tooltip } from '@mantine/core';
import { resolveAsset } from '@shared/media/resolveAsset';
import { createFileRoute, Link, useParams } from '@tanstack/react-router';
import { Section } from '@ui/block/Section';
import { TOPIC_ICON_TOPICS, TopicIcon } from '@ui/content/TopicIcon';
import { IconAction } from '@ui/control/IconAction';
import { SearchRefine } from '@ui/control/SearchRefine';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import { Card } from '@ui/surface/Card';
import { Toolbar } from '@ui/surface/Toolbar';
import { icons, X, Images, Info, ArrowRight } from 'lucide-react';
import { useReducer, useState } from 'react';

import { pageHead } from '../../pageTitle';
import { catalogueEntries as mediaEntries, mediaKinds } from './mediaCatalogue';
import type { MediaEntry, MediaSearch } from './mediaCatalogue';
import { indexGalleries } from './mediaIndex';
import { mediaLocation, mediaPathSearch, validateMediaQuery } from './mediaNavigation';
import { filterCatalogue } from './mediaSearch';
import { MediaShowcase } from './MediaShowcase';
import { mediaTiles, variantLabel } from './mediaTiles';
import type { MediaTile } from './mediaTiles';
import styles from './route.module.css';

export const Route = createFileRoute('/_app/media')({
  codeSplitGroupings: [['component']],
  head: () => pageHead('Media catalogue'),
  validateSearch: validateMediaQuery,
  component: MediaPage,
});

const lucideEntries = Object.entries(icons);

function MediaPage() {
  const committedSearch = mediaPathSearch(Route.useSearch(), useParams({ strict: false }));
  const { search, editQuery } = useMediaQuery(committedSearch);
  const navigate = Route.useNavigate();
  const updateSearch = (patch: Partial<MediaSearch>, replace = false) => {
    if (patch.q !== undefined) {
      editQuery(patch.q);
    }
    void navigate({
      ...mediaLocation({ ...search, ...patch }),
      replace,
      resetScroll: false,
    });
  };
  const overview = search.source === 'media' && search.kind === 'all';
  const catalogue = filterCatalogue(overview ? { source: 'media', kind: 'all', q: '', group: '' } : search);
  const query = search.q.trim().toLowerCase();
  const total = search.source === 'media' ? catalogue.matches.length : iconMatchCount(search.source, query);
  const focused = focusedMedia(search);
  return (
    <PageLayout>
      <PageLayout.Header size={overview ? 'compact' : 'default'}>
        <MediaShowcase overview={overview} compact={overview} />
      </PageLayout.Header>
      {!overview && (
        <PageLayout.Toolbar>
          <MediaFilters search={search} catalogue={catalogue} updateSearch={updateSearch} editQuery={editQuery} />
        </PageLayout.Toolbar>
      )}
      <PageLayout.Content width="viewport">
        <MediaResults
          search={search}
          catalogue={catalogue}
          total={total}
          focused={focused}
          onClose={() => updateSearch({ item: undefined })}
        />
      </PageLayout.Content>
    </PageLayout>
  );
}

function focusedMedia(search: MediaSearch) {
  if (search.source !== 'media') {
    return undefined;
  }
  return mediaEntries.find((entry) => entry.value === search.item && entry.kind === search.kind);
}

type QueryDraft = { identity: string; q: string };
type QueryEvent = { type: 'edit'; q: string } | { type: 'navigate'; identity: string; q: string };
function queryDraftReducer(state: QueryDraft, event: QueryEvent): QueryDraft {
  if (event.type === 'edit') {
    return { ...state, q: event.q.slice(0, 300) };
  }
  return { identity: event.identity, q: event.q };
}

function useMediaQuery(committed: MediaSearch) {
  const identity = JSON.stringify(committed);
  const [draft, dispatch] = useReducer(queryDraftReducer, { identity, q: committed.q });
  if (draft.identity !== identity) {
    dispatch({ type: 'navigate', identity, q: committed.q });
  }
  return { search: { ...committed, q: draft.q }, editQuery: (q: string) => dispatch({ type: 'edit', q }) };
}

function MediaResults({
  search,
  catalogue,
  total,
  focused,
  onClose,
}: Readonly<{
  search: MediaSearch;
  catalogue: ReturnType<typeof filterCatalogue>;
  total: number;
  focused?: MediaEntry;
  onClose: () => void;
}>) {
  if (search.source === 'media' && search.kind === 'all') {
    return <MediaLibraries />;
  }
  return (
    <Stack gap="xl">
      <MediaBreadcrumb search={search} matches={catalogue.matches} total={total} />
      {focused && <FocusedMedia focused={focused} onClose={onClose} />}
      {search.source === 'media' ? (
        <>
          {catalogue.approximate && <Text size="sm">No exact matches. Showing close spellings.</Text>}
          <MediaGroups groups={catalogue.groups} search={search} />
        </>
      ) : (
        <ExtraIcons source={search.source} query={search.q.trim().toLowerCase()} />
      )}
      {total === 0 && <Text>No artwork matches these filters. Try fewer words or clear the filters.</Text>}
    </Stack>
  );
}

function resultCount(search: MediaSearch, matches: MediaEntry[], total: number) {
  if (!total) {
    return 'No matches';
  }
  if (search.source === 'media' && search.kind === 'decal') {
    return `${mediaTiles(matches).length} decals · ${total} matching files`;
  }
  return `${total} matches`;
}

function MediaBreadcrumb({
  search,
  matches,
  total,
}: Readonly<{ search: MediaSearch; matches: MediaEntry[]; total: number }>) {
  const iconLabels = { topics: 'Topic icons', lucide: 'Lucide icons' };
  const label =
    search.source === 'media'
      ? mediaKinds.find((kind) => kind.value === search.kind)?.label
      : iconLabels[search.source];
  return (
    <Group gap="xs">
      <Images size={16} aria-hidden />
      <Anchor renderRoot={(props) => <Link {...props} to="/media" />}>All media</Anchor>
      <Text size="sm">/ {label}</Text>
      <Text size="sm" c="dimmed" role="status">
        {resultCount(search, matches, total)}
      </Text>
    </Group>
  );
}

function MediaLibraries() {
  return (
    <div className={styles.libraryWall}>
      {indexGalleries.map((gallery, index) => (
        <Card
          title={gallery.title}
          action={
            <Group gap="xs">
              <Text size="xs" c="dimmed">
                {gallery.total}
              </Text>
              <ArrowRight size={16} aria-hidden />
            </Group>
          }
          key={gallery.kind}
          padding="md"
          interactive
          className={index < 2 ? styles.libraryFeatured : styles.librarySmall}
          renderRoot={(props) => (
            <Link {...props} {...mediaLocation({ source: 'media', kind: gallery.kind, q: '', group: '' })} />
          )}
        >
          <div
            className={`${styles.libraryCollage} ${index < 2 ? styles.libraryLargeCollage : ''} ${gallery.kind === 'leader' ? styles.libraryPortraits : ''} ${gallery.kind === 'decal' ? styles.libraryDecals : ''}`}
          >
            {gallery.samples.map((entry) => (
              <div key={entry.value} className={styles.librarySpecimen}>
                {entry.value.startsWith('/vector/') ? (
                  <svg
                    viewBox="0 0 100 100"
                    preserveAspectRatio="xMidYMid meet"
                    className={styles.libraryArt}
                    aria-hidden
                  >
                    <use href={`${entry.value}#root`} fill="currentColor" />
                  </svg>
                ) : (
                  <img
                    src={resolveAsset(entry.value, 'small')}
                    alt=""
                    loading="lazy"
                    className={`${styles.libraryArt} ${entry.kind === 'leader' ? styles.libraryDisc : ''}`}
                  />
                )}
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

function previewClass(entry: MediaEntry, large: boolean) {
  if (large) {
    return styles.largePreview;
  }
  return entry.kind === 'leader' ? styles.portrait : styles.preview;
}
function galleryGrid(kind: MediaEntry['kind']) {
  if (kind === 'leader') {
    return styles.leaderGrid;
  }
  return kind === 'decal' ? styles.decalGrid : styles.grid;
}

function MediaPreview({ entry, large = false }: Readonly<{ entry: MediaEntry; large?: boolean }>) {
  const className = previewClass(entry, large);
  return (
    <img
      className={`${className} ${entry.value.startsWith('/vector/') ? styles.vectorPreview : ''}`}
      src={resolveAsset(entry.value, large ? 'large' : 'small')}
      alt={entry.label}
      loading="lazy"
    />
  );
}

function mediaDetails(entry: MediaEntry) {
  return `${entry.description} Keywords: ${entry.tags.join(', ')}. File: ${entry.value}`;
}

function FocusedMedia({ focused, onClose }: Readonly<{ focused: MediaEntry; onClose: () => void }>) {
  return (
    <Section
      title={focused.label}
      action={
        <Group gap="xs">
          <Tooltip label={mediaDetails(focused)} multiline w={320} events={{ hover: true, focus: true, touch: true }}>
            <Button variant="subtle" size="xs" aria-label="Artwork details">
              <Info size={16} aria-hidden />
            </Button>
          </Tooltip>
          <Button variant="subtle" size="xs" onClick={onClose}>
            Close preview
          </Button>
        </Group>
      }
    >
      <Stack align="center" gap="sm">
        <MediaPreview entry={focused} large />
        <Anchor href={resolveAsset(focused.value, 'large')} target="_blank" rel="noreferrer">
          Open image file
        </Anchor>
      </Stack>
    </Section>
  );
}

function MediaCard({ tile, search }: Readonly<{ tile: MediaTile; search: MediaSearch }>) {
  const [selected, setSelected] = useState<string>();
  const entry = tile.variants.find((variant) => variant.value === selected) ?? tile.entry;
  return (
    <article aria-label={tile.label} className={styles.card}>
      <Tooltip label={mediaDetails(entry)} multiline w={320} events={{ hover: true, focus: true, touch: false }}>
        <Anchor
          renderRoot={(props) => <Link {...props} {...mediaLocation({ ...search, item: entry.value })} />}
          aria-label={`Open ${entry.label}`}
          className={styles.previewLink}
        >
          <Stack gap="xs" align="center">
            <MediaPreview entry={entry} />
            <Text size="sm" ta="center">
              {tile.label}
            </Text>
          </Stack>
        </Anchor>
      </Tooltip>
      {tile.variants.length > 1 && (
        <Group gap="xs" justify="center" mt="xs" aria-label={`${tile.label} versions`}>
          {tile.variants.map((variant) => (
            <Tooltip key={variant.value} label={`${variantLabel(variant)} version`}>
              <Button
                size="compact-xs"
                variant={variant.value === entry.value ? 'light' : 'subtle'}
                aria-pressed={variant.value === entry.value}
                onClick={() => setSelected(variant.value)}
              >
                {variantLabel(variant)}
              </Button>
            </Tooltip>
          ))}
        </Group>
      )}
    </article>
  );
}

function MediaGroups({
  groups,
  search,
}: Readonly<{
  groups: ReturnType<typeof filterCatalogue>['groups'];
  search: MediaSearch;
}>) {
  return (
    <>
      {groups.map(({ label, entries, total, collection, kind }) => (
        <Card
          key={label}
          padding="md"
          title={label}
          action={
            collection && entries.length < total ? (
              <Anchor
                size="sm"
                renderRoot={(props) => (
                  <Link {...props} {...mediaLocation({ source: 'media', kind, q: '', group: collection })} />
                )}
              >
                Show everything from this group
              </Anchor>
            ) : undefined
          }
        >
          <div className={galleryGrid(kind)}>
            {mediaTiles(entries).map((tile) => (
              <MediaCard key={tile.key} tile={tile} search={search} />
            ))}
          </div>
        </Card>
      ))}
    </>
  );
}

function ExtraIcons({ source, query }: Readonly<{ source: 'topics' | 'lucide'; query: string }>) {
  return (
    <div className={styles.grid}>
      {source === 'topics'
        ? TOPIC_ICON_TOPICS.filter((name) => name.toLowerCase().includes(query)).map((name) => (
            <Surface key={name} padding="md" className={styles.card}>
              <Stack align="center" gap="sm">
                <TopicIcon topic={name} size={48} />
                <Text size="xs">{name}</Text>
              </Stack>
            </Surface>
          ))
        : lucideEntries
            .filter(([name]) => name.toLowerCase().includes(query))
            .map(([name, Icon]) => (
              <Surface key={name} padding="md" className={styles.card}>
                <Stack align="center" gap="sm">
                  <Icon size={48} aria-hidden />
                  <Text size="xs">{name}</Text>
                </Stack>
              </Surface>
            ))}
    </div>
  );
}

function MediaFilters({
  search,
  catalogue,
  updateSearch,
  editQuery,
}: Readonly<{
  editQuery: (q: string) => void;
  search: MediaSearch;
  catalogue: ReturnType<typeof filterCatalogue>;
  updateSearch: (patch: Partial<MediaSearch>, replace?: boolean) => void;
}>) {
  const active = Number(Boolean(search.subject)) + Number(Boolean(search.group)) + Number(search.kind !== 'all');
  return (
    <Toolbar>
      <Toolbar.Center>
        <SearchRefine
          label="Media catalogue filters"
          search={{
            value: search.q,
            onChange: editQuery,
            onCommit: () => updateSearch({ q: search.q }, true),
            label: 'Search media',
            placeholder: 'Search names, subjects or visual details...',
          }}
          refine={{
            label: 'Refine media',
            active,
            content: <MediaRefinements search={search} catalogue={catalogue} updateSearch={updateSearch} />,
          }}
        />
      </Toolbar.Center>
      <Toolbar.Right label="Catalogue actions">
        <Toolbar.Cluster kind="content">
          {(search.q || search.subject || search.group) && (
            <IconAction
              label="Clear filters"
              size="lg"
              intent="neutral"
              emphasis="standard"
              icon={<X size={17} aria-hidden />}
              onClick={() => updateSearch({ q: '', group: '', subject: undefined, item: undefined })}
            />
          )}
        </Toolbar.Cluster>
      </Toolbar.Right>
    </Toolbar>
  );
}
function MediaRefinements({
  search,
  catalogue,
  updateSearch,
}: Readonly<{
  search: MediaSearch;
  catalogue: ReturnType<typeof filterCatalogue>;
  updateSearch: (patch: Partial<MediaSearch>, replace?: boolean) => void;
}>) {
  return (
    <>
      <Select
        label="Library"
        aria-label="Media library"
        value={search.source}
        data={[
          { value: 'media', label: 'Game media' },
          { value: 'topics', label: 'Topic icons' },
          { value: 'lucide', label: 'Lucide icons' },
        ]}
        allowDeselect={false}
        comboboxProps={{ keepMounted: false }}
        onChange={(value) =>
          updateSearch({
            source: value as MediaSearch['source'],
            kind: 'all',
            group: '',
            subject: undefined,
            item: undefined,
          })
        }
      />
      {search.source === 'media' && (
        <>
          <Select
            label="Media type"
            aria-label="Media type"
            value={search.kind}
            data={[
              { value: 'all', label: 'Choose a gallery' },
              ...catalogue.kindCounts.map(({ value, label, count }) => ({
                value,
                label: `${label} (${count})`,
              })),
            ]}
            allowDeselect={false}
            searchable
            comboboxProps={{ keepMounted: false }}
            onChange={(value) => updateSearch({ kind: value as MediaSearch['kind'], group: '', item: undefined })}
          />
          <Select
            label="Subject"
            aria-label="Filter by subject"
            placeholder="All subjects"
            value={search.subject ?? null}
            data={catalogue.subjectCounts.map(({ value, label, count }) => ({
              value,
              label: `${label} (${count})`,
            }))}
            searchable
            clearable
            comboboxProps={{ keepMounted: false }}
            onChange={(value) => updateSearch({ subject: value ?? undefined })}
          />
          <Select
            label="Collection"
            aria-label="Filter by group"
            placeholder="All collections"
            value={search.group || null}
            data={catalogue.collectionCounts.map(({ value, label, count }) => ({
              value,
              label: `${label} (${count})`,
            }))}
            searchable
            clearable
            comboboxProps={{ keepMounted: false }}
            onChange={(value) => updateSearch({ group: value ?? '' })}
          />
          {search.kind !== 'leader' && search.kind !== 'decal' && (
            <Select
              label="Group results by"
              value={search.browse ?? 'subject'}
              data={[
                { value: 'subject', label: 'Subject' },
                { value: 'collection', label: 'Collection' },
              ]}
              allowDeselect={false}
              comboboxProps={{ keepMounted: false }}
              onChange={(value) => updateSearch({ browse: value === 'collection' ? 'collection' : undefined })}
            />
          )}
        </>
      )}
    </>
  );
}

function iconMatchCount(source: 'topics' | 'lucide', query: string) {
  if (source === 'topics') {
    return TOPIC_ICON_TOPICS.filter((name) => name.toLowerCase().includes(query)).length;
  }
  return lucideEntries.filter(([name]) => name.toLowerCase().includes(query)).length;
}
