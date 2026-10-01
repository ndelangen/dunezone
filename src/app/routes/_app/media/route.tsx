import { Anchor, Button, Group, Select, Stack, Text, Tooltip } from '@mantine/core';
import { createFileRoute, Link, useParams } from '@tanstack/react-router';
import { Section } from '@ui/block/Section';
import { TOPIC_ICON_TOPICS, TopicIcon } from '@ui/content/TopicIcon';
import { IconAction } from '@ui/control/IconAction';
import { SearchRefine } from '@ui/control/SearchRefine';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import { Toolbar } from '@ui/surface/Toolbar';
import { icons, X, Images, Info, ArrowRight } from 'lucide-react';

import { resolveAsset } from '@game/assets/resolveAsset';

import { pageHead } from '../../pageTitle';
import { catalogueEntries as mediaEntries, mediaKinds } from './mediaCatalogue';
import type { MediaEntry, MediaSearch } from './mediaCatalogue';
import { indexGalleries } from './mediaIndex';
import { mediaLocation, mediaPathSearch, validateMediaQuery } from './mediaNavigation';
import { filterCatalogue } from './mediaSearch';
import { MediaShowcase } from './MediaShowcase';
import styles from './route.module.css';

export const Route = createFileRoute('/_app/media')({
  codeSplitGroupings: [['component']],
  head: () => pageHead('Media catalogue'),
  validateSearch: validateMediaQuery,
  component: MediaPage,
});

const lucideEntries = Object.entries(icons);

function MediaPage() {
  const search = mediaPathSearch(Route.useSearch(), useParams({ strict: false }));
  const navigate = Route.useNavigate();
  const updateSearch = (patch: Partial<MediaSearch>, replace = false) => {
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
  const focused =
    search.source === 'media'
      ? mediaEntries.find((entry) => entry.value === search.item && entry.kind === search.kind)
      : undefined;
  return (
    <PageLayout>
      <PageLayout.Header size={overview ? 'compact' : 'default'}>
        <MediaShowcase overview={overview} compact={overview} />
      </PageLayout.Header>
      {!overview && (
        <PageLayout.Toolbar>
          <MediaFilters search={search} catalogue={catalogue} updateSearch={updateSearch} />
        </PageLayout.Toolbar>
      )}
      <PageLayout.Content width="viewport">
        <Stack gap="xl">
          {!overview && (
            <Group gap="xs">
              <Images size={16} aria-hidden />
              <Anchor renderRoot={(props) => <Link {...props} to="/media" />}>All media</Anchor>
              {(search.kind !== 'all' || search.source !== 'media') && (
                <Text size="sm">
                  /{' '}
                  {search.source === 'media'
                    ? mediaKinds.find((kind) => kind.value === search.kind)?.label
                    : search.source === 'topics'
                      ? 'Topic icons'
                      : 'Lucide icons'}
                </Text>
              )}
              <Text size="sm" c="dimmed" role="status">
                {total === 0 ? 'No matches' : `${total} matches`}
              </Text>
            </Group>
          )}
          {focused && <FocusedMedia focused={focused} onClose={() => updateSearch({ item: undefined })} />}
          {!overview && catalogue.approximate && search.source === 'media' && (
            <Text size="sm">No exact matches. Showing close spellings.</Text>
          )}
          {search.source === 'media' ? (
            search.kind === 'all' ? (
              <MediaLibraries />
            ) : (
              <MediaGroups groups={catalogue.groups} search={search} />
            )
          ) : (
            <ExtraIcons source={search.source} query={query} />
          )}
          {total === 0 && <Text>No artwork matches these filters. Try fewer words or clear the filters.</Text>}
        </Stack>
      </PageLayout.Content>
    </PageLayout>
  );
}

function MediaLibraries() {
  return (
    <div className={styles.libraryWall}>
      {indexGalleries.map((gallery, index) => (
        <Surface
          key={gallery.kind}
          padding="md"
          interactive
          className={index < 2 ? styles.libraryFeatured : styles.librarySmall}
          renderRoot={(props) => (
            <Link
              {...props}
              className={`${props.className} ${styles.libraryLink}`}
              {...mediaLocation({ source: 'media', kind: gallery.kind, q: '', group: '' })}
            />
          )}
        >
          <Section
            title={gallery.title}
            action={
              <Group gap="xs">
                <Text size="xs" c="dimmed">
                  {gallery.total}
                </Text>
                <ArrowRight size={16} aria-hidden />
              </Group>
            }
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
          </Section>
        </Surface>
      ))}
    </div>
  );
}

function MediaPreview({ entry, large = false }: { entry: MediaEntry; large?: boolean }) {
  const className = large ? styles.largePreview : entry.kind === 'leader' ? styles.portrait : styles.preview;
  return entry.value.startsWith('/vector/') ? (
    <svg className={className} viewBox="0 0 100 100" role="img" aria-label={entry.label}>
      <rect width="100" height="100" fill="#d7cba1" />
      <use href={`${entry.value}#root`} fill="#000" />
    </svg>
  ) : (
    <img
      className={className}
      src={resolveAsset(entry.value, large ? 'large' : 'small')}
      alt={entry.label}
      loading="lazy"
    />
  );
}

function mediaDetails(entry: MediaEntry) {
  return `${entry.description} Keywords: ${entry.tags.join(', ')}. File: ${entry.value}`;
}

function FocusedMedia({ focused, onClose }: { focused: MediaEntry; onClose: () => void }) {
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

function MediaCard({ entry, search }: { entry: MediaEntry; search: MediaSearch }) {
  return (
    <article aria-label={entry.label} className={styles.card}>
      <Tooltip label={mediaDetails(entry)} multiline w={320} events={{ hover: true, focus: true, touch: false }}>
        <Anchor
          renderRoot={(props) => <Link {...props} {...mediaLocation({ ...search, item: entry.value })} />}
          aria-label={`Open ${entry.label}`}
          className={styles.previewLink}
        >
          <Stack gap="xs" align="center">
            <MediaPreview entry={entry} />
            <Text size="sm" ta="center">
              {entry.label}
            </Text>
          </Stack>
        </Anchor>
      </Tooltip>
    </article>
  );
}

function MediaGroups({
  groups,
  search,
}: {
  groups: ReturnType<typeof filterCatalogue>['groups'];
  search: MediaSearch;
}) {
  return (
    <>
      {groups.map(({ label, entries, total, collection, kind }) => (
        <Surface key={label} padding="md">
          <Section
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
            <div className={kind === 'leader' ? styles.leaderGrid : kind === 'decal' ? styles.decalGrid : styles.grid}>
              {entries.map((entry) => (
                <MediaCard key={entry.value} entry={entry} search={search} />
              ))}
            </div>
          </Section>
        </Surface>
      ))}
    </>
  );
}

function ExtraIcons({ source, query }: { source: 'topics' | 'lucide'; query: string }) {
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
}: {
  search: MediaSearch;
  catalogue: ReturnType<typeof filterCatalogue>;
  updateSearch: (patch: Partial<MediaSearch>, replace?: boolean) => void;
}) {
  const active = Number(Boolean(search.subject)) + Number(Boolean(search.group)) + Number(search.kind !== 'all');
  return (
    <Toolbar>
      <Toolbar.Center>
        <SearchRefine
          label="Media catalogue filters"
          search={{
            value: search.q,
            onChange: (q) => updateSearch({ q }, true),
            onCommit: () => {},
            label: 'Search media',
            placeholder: 'Search names, subjects or visual details...',
          }}
          refine={{
            label: 'Refine media',
            active,
            content: (
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
                      onChange={(value) =>
                        updateSearch({ kind: value as MediaSearch['kind'], group: '', item: undefined })
                      }
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
                        onChange={(value) =>
                          updateSearch({ browse: value === 'collection' ? 'collection' : undefined })
                        }
                      />
                    )}
                  </>
                )}
              </>
            ),
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
function iconMatchCount(source: 'topics' | 'lucide', query: string) {
  if (source === 'topics') {
    return TOPIC_ICON_TOPICS.filter((name) => name.toLowerCase().includes(query)).length;
  }
  return lucideEntries.filter(([name]) => name.toLowerCase().includes(query)).length;
}
