import { Anchor, Group, Select, Stack, Text, Tooltip } from '@mantine/core';
import { resolveAsset } from '@shared/media/resolveAsset';
import { createFileRoute, Link, useParams } from '@tanstack/react-router';
import { Section } from '@ui/block/Section';
import { helpLines } from '@ui/content/helpLines';
import { TOPIC_ICON_TOPICS, TopicIcon } from '@ui/content/TopicIcon';
import { ControlBlock } from '@ui/control/ControlBlock';
import { IconAction } from '@ui/control/IconAction';
import { LabeledAction } from '@ui/control/LabeledAction';
import { SearchRefine } from '@ui/control/SearchRefine';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import { Card } from '@ui/surface/Card';
import { Toolbar } from '@ui/surface/Toolbar';
import { ArrowRight, Image as ImageIcon, Info, X } from 'lucide-react';
import { Fragment, lazy, Suspense, useEffect, useReducer, useRef, useState } from 'react';

import { catalogueEntries as mediaEntries } from './mediaCatalogue';
import type { MediaEntry } from './mediaCatalogue';
import { mediaHead } from './mediaHead';
import { indexGalleries } from './mediaIndex';
import { mediaLocation, mediaPathSearch, validateMediaQuery } from './mediaNavigation';
import { filterCatalogue } from './mediaSearch';
import { iconLibraryLabels, mediaKinds } from './mediaSearchParams';
import type { MediaSearch } from './mediaSearchParams';
import { MediaShowcase } from './MediaShowcase';
import { holdsArtwork, mediaTiles, variantLabel } from './mediaTiles';
import type { MediaTile } from './mediaTiles';
import styles from './route.module.css';

export const Route = createFileRoute('/_app/media')({
  ssr: true,
  codeSplitGroupings: [['component']],
  head: ({ params, match }) => mediaHead(params, match),
  validateSearch: validateMediaQuery,
  component: MediaPage,
});

const LucideIcons = lazy(() => import('./LucideIcons'));
const noMatches = <Text>No artwork matches these filters. Try fewer words or clear the filters.</Text>;

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
  const focused = focusedMedia(search);
  return (
    <PageLayout>
      <PageLayout.Header size={overview ? 'compact' : 'default'}>
        <MediaShowcase overview={overview} compact={overview} gallery={galleryLabel(search)} />
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
          focused={focused}
          onClose={() => updateSearch({ item: undefined })}
        />
      </PageLayout.Content>
    </PageLayout>
  );
}

/** Every view but the overview is a gallery and names the page, so its heading matches the document title (see mediaHead). */
function galleryLabel(search: MediaSearch) {
  return search.source === 'media'
    ? mediaKinds.find((kind) => kind.value === search.kind)?.label
    : iconLibraryLabels[search.source];
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
  focused,
  onClose,
}: Readonly<{
  search: MediaSearch;
  catalogue: ReturnType<typeof filterCatalogue>;
  focused?: MediaEntry;
  onClose: () => void;
}>) {
  if (search.source === 'media' && search.kind === 'all') {
    return <MediaLibraries />;
  }
  const query = search.q.trim().toLowerCase();
  if (search.source === 'lucide') {
    return (
      <Stack gap="xl">
        <Suspense fallback={<MediaResultCount search={search} matches={catalogue.matches} />}>
          <LucideIcons
            query={query}
            heading={(lucideTotal) => (
              <MediaResultCount search={search} matches={catalogue.matches} total={lucideTotal} />
            )}
            empty={noMatches}
          />
        </Suspense>
      </Stack>
    );
  }
  const total = search.source === 'media' ? catalogue.matches.length : topicMatchCount(query);
  const groups = catalogue.groups.map((group) => ({ ...group, tiles: mediaTiles(group.entries) }));
  const host = focused && groups.flatMap((group) => group.tiles).find((tile) => holdsArtwork(tile, focused.value));
  return (
    <Stack gap="xl">
      <MediaResultCount search={search} matches={catalogue.matches} total={total} />
      {/* The detail opens in the gallery, under the row of the artwork it shows. Only artwork the filters hide keeps it above the results. */}
      {focused && !host && <FocusedMedia focused={focused} onClose={onClose} />}
      {search.source === 'media' ? (
        <>
          {catalogue.approximate && <Text size="sm">No exact matches. Showing close spellings.</Text>}
          <MediaGroups groups={groups} search={search} focused={focused} hostKey={host?.key} onClose={onClose} />
        </>
      ) : (
        <TopicIcons query={query} />
      )}
      {total === 0 && noMatches}
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

/* The gallery's name and the way back to every gallery sit above the title (see MediaShowcase), so this line only counts what the filters left. */
function MediaResultCount({
  search,
  matches,
  total,
}: Readonly<{ search: MediaSearch; matches: MediaEntry[]; total?: number }>) {
  return (
    <Text size="sm" c="dimmed" role="status">
      {total === undefined ? null : resultCount(search, matches, total)}
    </Text>
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
  return helpLines(
    entry.description,
    entry.credit && `Credit: ${entry.credit}`,
    `Keywords: ${entry.tags.join(', ')}.`,
    `File: ${entry.value}`
  );
}

function FocusedMedia({ focused, onClose }: Readonly<{ focused: MediaEntry; onClose: () => void }>) {
  return (
    <Section
      title={focused.label}
      action={
        <Group gap="xs">
          <IconAction
            label="Artwork details"
            tooltip={mediaDetails(focused)}
            emphasis="standard"
            icon={<Info size={16} />}
          />
          <LabeledAction size="xs" icon={<X size={14} />} onClick={onClose}>
            Close preview
          </LabeledAction>
        </Group>
      }
    >
      <Stack align="center" gap="sm">
        <MediaPreview entry={focused} large />
        {focused.credit && (
          <Text size="sm" c="dimmed" ta="center" maw={480}>
            {focused.credit}
          </Text>
        )}
        <Anchor href={resolveAsset(focused.value, 'large')} target="_blank" rel="noreferrer">
          Open image file
        </Anchor>
      </Stack>
    </Section>
  );
}

function MediaCard({ tile, search, opened }: Readonly<{ tile: MediaTile; search: MediaSearch; opened?: string }>) {
  const [selected, setSelected] = useState<string>();
  /* The opened version shows on the tile until the visitor picks another, so tile and detail agree. */
  const entry = tile.variants.find((variant) => variant.value === (selected ?? opened)) ?? tile.entry;
  return (
    <article aria-label={tile.label} className={styles.card}>
      <Tooltip label={mediaDetails(entry)} multiline w={320} events={{ hover: true, focus: true, touch: false }}>
        <Anchor
          renderRoot={(props) => (
            <Link
              {...props}
              {...mediaLocation({ ...search, item: entry.value })}
              resetScroll={false}
              onClick={(event) => {
                reveal.value = entry.value;
                props.onClick?.(event);
              }}
            />
          )}
          aria-label={`Open ${entry.label}`}
          rel="nofollow"
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
            <LabeledAction
              key={variant.value}
              size="compact-xs"
              pressed={variant.value === entry.value}
              icon={<ImageIcon size={12} />}
              onClick={() => setSelected(variant.value)}
            >
              {variantLabel(variant)}
            </LabeledAction>
          ))}
        </Group>
      )}
    </article>
  );
}

/* The artwork a visitor just clicked. Only that click brings the detail into view; filtering, a deep link or a restored scroll leave the page where it is. */
const reveal: { value?: string } = {};

/*
 * Spans the whole grid row; the grid packs densely, so the artwork after the opened one fills its row
 * first and the detail drops in under it. That artwork sits after the detail in reading and tab order.
 */
function InlineFocusedMedia({ focused, onClose }: Readonly<{ focused: MediaEntry; onClose: () => void }>) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (reveal.value === focused.value) {
      reveal.value = undefined;
      ref.current?.scrollIntoView({ block: 'nearest' });
    }
  }, [focused.value]);
  return (
    <div ref={ref} className={styles.inlineDetail}>
      <FocusedMedia focused={focused} onClose={onClose} />
    </div>
  );
}

function MediaGroups({
  groups,
  search,
  focused,
  hostKey,
  onClose,
}: Readonly<{
  groups: (ReturnType<typeof filterCatalogue>['groups'][number] & { tiles: MediaTile[] })[];
  search: MediaSearch;
  focused?: MediaEntry;
  hostKey?: string;
  onClose: () => void;
}>) {
  return (
    <>
      {groups.map(({ label, entries, tiles, total, collection, kind }) => (
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
            {tiles.map((tile) => {
              const opened = tile.key === hostKey ? focused : undefined;
              return (
                <Fragment key={tile.key}>
                  <MediaCard tile={tile} search={search} opened={opened?.value} />
                  {opened && <InlineFocusedMedia focused={opened} onClose={onClose} />}
                </Fragment>
              );
            })}
          </div>
        </Card>
      ))}
    </>
  );
}

function TopicIcons({ query }: Readonly<{ query: string }>) {
  return (
    <div className={styles.grid}>
      {TOPIC_ICON_TOPICS.filter((name) => name.toLowerCase().includes(query)).map((name) => (
        <Surface key={name} padding="md" className={styles.card}>
          <Stack align="center" gap="sm">
            <TopicIcon topic={name} size={48} />
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
      <ControlBlock
        title="Library"
        input={
          <Select
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
        }
      />
      {search.source === 'media' && (
        <>
          <ControlBlock
            title="Media type"
            input={(fieldProps) => (
              <Select
                {...fieldProps}
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
            )}
          />
          <ControlBlock
            title="Subject"
            input={
              <Select
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
            }
          />
          <ControlBlock
            title="Collection"
            input={
              <Select
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
            }
          />
          {search.kind !== 'leader' && search.kind !== 'decal' && (
            <ControlBlock
              title="Group results by"
              input={(fieldProps) => (
                <Select
                  {...fieldProps}
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
            />
          )}
        </>
      )}
    </>
  );
}

function topicMatchCount(query: string) {
  return TOPIC_ICON_TOPICS.filter((name) => name.toLowerCase().includes(query)).length;
}
