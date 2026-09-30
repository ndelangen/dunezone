import {
  Anchor,
  Autocomplete,
  Button,
  Checkbox,
  Group,
  Select,
  Stack,
  Tabs,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { useClipboard } from '@mantine/hooks';
import { createFileRoute, Link } from '@tanstack/react-router';
import { PageTitle } from '@ui/block/PageTitle';
import { Section } from '@ui/block/Section';
import { TOPIC_ICON_TOPICS, TopicIcon } from '@ui/content/TopicIcon';
import { ControlBlock } from '@ui/control/ControlBlock';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import { icons, Search } from 'lucide-react';
import { useReducer } from 'react';

import { resolveAsset } from '@game/assets/resolveAsset';

import { pageHead } from '../../pageTitle';
import {
  draftInitial,
  draftReducer,
  mediaEntries,
  mediaKinds,
  reclassificationPrompt,
  validateMediaSearch,
} from './mediaCatalogue';
import type { MediaEntry } from './mediaCatalogue';
import styles from './route.module.css';

export const Route = createFileRoute('/_app/__media')({
  codeSplitGroupings: [['component']],
  head: () => pageHead('Media catalogue'),
  validateSearch: validateMediaSearch,
  component: MediaPage,
});

const lucideEntries = Object.entries(icons);

function MediaPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [draft, dispatch] = useReducer(draftReducer, draftInitial);
  const clipboard = useClipboard();
  const prompt = reclassificationPrompt(mediaEntries, draft.moves, draft.notes);
  const updateSearch = (patch: Partial<typeof search>, replace = false) => {
    void navigate({ search: { ...search, ...patch }, replace, resetScroll: false });
  };
  const collectionOf = (entry: MediaEntry) => draft.moves[entry.value] ?? entry.collection;
  const kindEntries = mediaEntries.filter((entry) => search.kind === 'all' || entry.kind === search.kind);
  const collections = [...new Set(kindEntries.map(collectionOf))].sort();
  const destinations = [...new Set(mediaEntries.map(collectionOf))].sort();
  const query = search.q.trim().toLowerCase();
  const matches = kindEntries.filter(
    (entry) =>
      (!search.group || collectionOf(entry) === search.group) &&
      `${entry.label} ${entry.keywords} ${collectionOf(entry)}`.toLowerCase().includes(query)
  );
  const otherEntries =
    search.source === 'topics'
      ? TOPIC_ICON_TOPICS.filter((name) => name.toLowerCase().includes(query))
      : lucideEntries.filter(([name]) => name.toLowerCase().includes(query));
  const total = search.source === 'media' ? matches.length : otherEntries.length;
  const groups = [...new Set(matches.map(collectionOf))];
  const focused = search.source === 'media' ? mediaEntries.find((entry) => entry.value === search.item) : undefined;
  const changes = mediaEntries.filter(
    (entry) => draft.moves[entry.value] && draft.moves[entry.value] !== entry.collection
  );

  return (
    <PageLayout>
      <PageLayout.Header size="compact">
        <Stack gap="xs">
          <PageTitle title="Media catalogue" />
          <Text>Browse the artwork, share a group or image, and propose changes to its classification.</Text>
        </Stack>
      </PageLayout.Header>
      <PageLayout.Toolbar>
        <Stack gap="md">
          <Tabs
            value={search.source}
            onChange={(value) => updateSearch({ source: value as typeof search.source, item: undefined })}
          >
            <Tabs.List>
              <Tabs.Tab value="media">Game media ({mediaEntries.length})</Tabs.Tab>
              <Tabs.Tab value="topics">Topics</Tabs.Tab>
              <Tabs.Tab value="lucide">Lucide</Tabs.Tab>
            </Tabs.List>
          </Tabs>
          <div className={styles.filters}>
            <ControlBlock
              title="Search"
              input={
                <TextInput
                  aria-label="Search media"
                  placeholder="Name, subject, or file path"
                  leftSection={<Search size={16} aria-hidden />}
                  value={search.q}
                  onChange={(event) => updateSearch({ q: event.currentTarget.value }, true)}
                />
              }
            />
            {search.source === 'media' && (
              <>
                <ControlBlock
                  title="Media type"
                  input={
                    <Select
                      aria-label="Media type"
                      value={search.kind}
                      data={[{ value: 'all', label: 'All media' }, ...mediaKinds]}
                      onChange={(value) => updateSearch({ kind: value as typeof search.kind, group: '' })}
                      allowDeselect={false}
                      comboboxProps={{ keepMounted: false }}
                    />
                  }
                />
                <ControlBlock
                  title="Group"
                  input={
                    <Select
                      aria-label="Filter by group"
                      placeholder="All groups"
                      value={search.group || null}
                      data={collections}
                      searchable
                      clearable
                      onChange={(value) => updateSearch({ group: value ?? '' })}
                      comboboxProps={{ keepMounted: false }}
                    />
                  }
                />
              </>
            )}
          </div>
        </Stack>
      </PageLayout.Toolbar>
      <PageLayout.Content width="viewport">
        <Stack gap="xl">
          {search.source === 'media' && (
            <>
              <Group justify="space-between">
                <Group gap="sm">
                  <Text size="sm">
                    {draft.selected.length} selected · {changes.length} proposed changes
                  </Text>
                  <Button
                    size="xs"
                    variant="subtle"
                    disabled={!matches.length}
                    onClick={() => dispatch({ type: 'selectMany', values: matches.map((entry) => entry.value) })}
                  >
                    Select all matches
                  </Button>
                  <Button
                    size="xs"
                    variant="subtle"
                    disabled={!draft.selected.length}
                    onClick={() => dispatch({ type: 'clearSelection' })}
                  >
                    Clear selection
                  </Button>
                </Group>
                <Group gap="sm">
                  <Button
                    size="xs"
                    variant="subtle"
                    disabled={!draft.history.length}
                    onClick={() => dispatch({ type: 'undo' })}
                  >
                    Undo move
                  </Button>
                  <Button
                    size="xs"
                    variant="subtle"
                    disabled={!changes.length && !draft.selected.length && !draft.notes}
                    onClick={() => dispatch({ type: 'reset' })}
                  >
                    Reset draft
                  </Button>
                </Group>
              </Group>
              {(draft.selected.length > 0 || changes.length > 0) && (
                <Section
                  title="Propose a classification"
                  description="These changes stay in this page until you leave or reload. Copy the prompt to request permanent changes."
                >
                  <Surface padding="md">
                    <Stack gap="md">
                      <Group align="end" grow>
                        <ControlBlock
                          title="Destination group"
                          input={
                            <Autocomplete
                              aria-label="Destination group"
                              placeholder="Choose a group or type a new one"
                              data={destinations}
                              value={draft.destination}
                              onChange={(value) => dispatch({ type: 'destination', value })}
                              comboboxProps={{ keepMounted: false }}
                            />
                          }
                        />
                        <Button
                          disabled={!draft.selected.length || !draft.destination.trim()}
                          onClick={() => dispatch({ type: 'move' })}
                        >
                          Move selected
                        </Button>
                      </Group>
                      {changes.length > 0 && (
                        <>
                          <ControlBlock
                            title="Notes"
                            input={
                              <Textarea
                                aria-label="Classification notes"
                                placeholder="Explain the grouping or describe another change"
                                value={draft.notes}
                                onChange={(event) => dispatch({ type: 'notes', value: event.currentTarget.value })}
                                autosize
                                minRows={2}
                              />
                            }
                          />
                          <Text size="sm">
                            {changes.length}{' '}
                            {changes.length === 1 ? 'file has a new proposed group' : 'files have new proposed groups'}.
                            Original files and saved factions are unchanged.
                          </Text>
                          <ControlBlock
                            title="Reclassification prompt"
                            input={
                              <Textarea
                                aria-label="Reclassification prompt"
                                value={prompt}
                                readOnly
                                autosize
                                minRows={5}
                                maxRows={12}
                              />
                            }
                          />
                          <Group>
                            <Button variant="light" onClick={() => clipboard.copy(prompt)}>
                              {clipboard.copied ? 'Prompt copied' : 'Copy prompt'}
                            </Button>
                            {clipboard.error && (
                              <Text size="sm" role="status">
                                Copy was unavailable. Select and copy the prompt above.
                              </Text>
                            )}
                          </Group>
                        </>
                      )}
                    </Stack>
                  </Surface>
                </Section>
              )}
              {focused && (
                <Section
                  title={focused.label}
                  description={collectionOf(focused)}
                  action={
                    <Button variant="subtle" size="xs" onClick={() => updateSearch({ item: undefined })}>
                      Close preview
                    </Button>
                  }
                >
                  <Surface padding="md">
                    <div className={styles.detail}>
                      <MediaPreview entry={focused} large />
                      <Stack gap="sm">
                        <Text size="sm" className={styles.path}>
                          {focused.value}
                        </Text>
                        <Text size="sm">Original group: {focused.collection}</Text>
                        {draft.moves[focused.value] && (
                          <Text size="sm">Proposed group: {draft.moves[focused.value]}</Text>
                        )}
                        <Checkbox
                          label={`Select ${focused.label}`}
                          checked={draft.selected.includes(focused.value)}
                          onChange={() => dispatch({ type: 'toggle', value: focused.value })}
                        />
                        <Anchor
                          renderRoot={(props) => (
                            <Link {...props} to="/__media" search={{ ...search, item: focused.value }} />
                          )}
                        >
                          Link to this item
                        </Anchor>
                        <Anchor href={resolveAsset(focused.value, 'large')} target="_blank" rel="noreferrer">
                          Open image file
                        </Anchor>
                      </Stack>
                    </div>
                  </Surface>
                </Section>
              )}
              {search.item && !focused && (
                <Text role="status">This media item was not found. You can still browse the catalogue below.</Text>
              )}
            </>
          )}
          <Group justify="space-between">
            <Text size="sm" c="dimmed">
              {total === 0 ? 'No matches' : `${total} matches`}
            </Text>
            <Anchor renderRoot={(props) => <Link {...props} to="/__media" search={search} />}>Link to this view</Anchor>
          </Group>
          {search.source === 'media' ? (
            groups.map((group) => (
              <Section
                key={group}
                title={group}
                description={`${matches.filter((entry) => collectionOf(entry) === group).length} matching items`}
                action={
                  <Anchor
                    renderRoot={(props) => (
                      <Link {...props} to="/__media" search={{ ...search, group, item: undefined }} />
                    )}
                  >
                    Group link
                  </Anchor>
                }
              >
                <div className={styles.grid}>
                  {matches
                    .filter((entry) => collectionOf(entry) === group)
                    .map((entry) => (
                      <Surface
                        key={entry.value}
                        padding="sm"
                        as="article"
                        aria-label={entry.label}
                        className={styles.card}
                      >
                        <Stack gap="xs">
                          <Anchor
                            renderRoot={(props) => (
                              <Link {...props} to="/__media" search={{ ...search, item: entry.value }} />
                            )}
                            aria-label={`Open ${entry.label}`}
                            className={styles.previewLink}
                          >
                            <MediaPreview entry={entry} />
                          </Anchor>
                          <Checkbox
                            aria-label={`Select ${entry.label}`}
                            label={entry.label}
                            checked={draft.selected.includes(entry.value)}
                            onChange={() => dispatch({ type: 'toggle', value: entry.value })}
                          />
                          <Text size="xs" c="dimmed">
                            {mediaKinds.find((kind) => kind.value === entry.kind)?.label}
                            {draft.moves[entry.value] ? ' · Moved in draft' : ''}
                          </Text>
                        </Stack>
                      </Surface>
                    ))}
                </div>
              </Section>
            ))
          ) : (
            <div className={styles.grid}>
              {search.source === 'topics'
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
          )}
          {total === 0 && <Text>No artwork matches these filters. Try another name or clear the group filter.</Text>}
        </Stack>
      </PageLayout.Content>
    </PageLayout>
  );
}

function MediaPreview({ entry, large = false }: { entry: MediaEntry; large?: boolean }) {
  return entry.glyphPreview ? (
    <svg
      className={large ? styles.largePreview : styles.preview}
      viewBox="0 0 100 100"
      role="img"
      aria-label={entry.label}
    >
      <use href={`${entry.value}#root`} fill="currentColor" />
    </svg>
  ) : (
    <img
      className={large ? styles.largePreview : styles.preview}
      src={resolveAsset(entry.value, large ? 'large' : 'small')}
      alt={entry.label}
      loading="lazy"
    />
  );
}
