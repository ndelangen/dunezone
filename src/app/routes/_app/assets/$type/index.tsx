/**
 * PROTOTYPE — wayfinder ticket #512 "Type browse page design".
 * THROWAWAY.
 *
 * The current page is a centred flex `Group` of fixed-width faces with a plain-text Edit link, no toolbar, no create entry point and no thinking about density.
 * This puts three genuinely different answers up, differing on how you FIND things rather than on decoration:
 *
 * ?v=a  Catalogue transposition — the faction overview one-for-one: joined search|sort field, result count, uniform slots, caption beneath, Edit on hover.
 * You filter.
 * ?v=b  Contact sheet — artwork edge to edge at its true aspect, identity from the picture, discovery moved to a facet rail of owners and dates.
 * You browse facets.
 * ?v=c  Grouped ledger — records, not a wall: grouped rows with a thumbnail strip and entries listed beside it.
 * You navigate structure.
 *
 * Clicking an entry navigates to the Asset detail page at `/assets/{type}/{slug}`.
 * The modal and the sticky rail this file used to offer are gone: Norbert rejected the modal (2026-08-20), and the rail was the same component in a different place rather than a second answer to a second question.
 * That means every entry is an anchor, not a button — a navigation target has to be middle-clickable and copyable.
 *
 * Already decided, not re-litigated: the create affordance lives in the PageHeader and the toolbar (#512 comment);
 * the honest empty and Planned states stay.
 *
 * The catalogue is seeded with mock treachery cards — only one real asset exists, and density is the whole question.
 * Real entries are appended when present, and the detail page reads the same seed so a tile and the page it leads to describe the same card.
 *
 * Deck membership is seeded too, and is likewise fiction: `asset_relations` exists in the schema with a `by_to_kind` index bought for exactly this lookup, and nothing reads or writes it.
 * The treatment splits by cardinality — a count here, the names on the detail page — because a 9.5rem tile cannot carry a deck name without truncating it, and a truncated deck name tells you less than no deck name.
 */
import { Anchor, Group, Select, Stack, Text, TextInput, Title, UnstyledButton } from '@mantine/core';
import { ASSET_TYPES, isAssetType } from '@shared/assets/types';
import { createFileRoute, Link, notFound, useNavigate } from '@tanstack/react-router';
import { Eyebrow } from '@ui/content/Eyebrow';
import { CallToAction } from '@ui/control/CallToAction';
import { IconAction } from '@ui/control/IconAction';
import { CanvasScale } from '@ui/layout/CanvasScale';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import { SectionedSurface } from '@ui/surface/SectionedSurface';
import { Toolbar } from '@ui/surface/Toolbar';
import { Pencil, Plus } from 'lucide-react';
import { useState } from 'react';

import { loadAssetsByTypes, useAssetsByTypes } from '@app/db/assets';
import type { AssetListEntry } from '@app/db/assets';

import { AssetFace, CARD_ASPECT } from '../-assetFaces';
import { deckCountLabel, deckLabel, decksOf, mockEntries } from '../-mockCatalogue';
import styles from './index.module.css';

type Variant = 'a' | 'b' | 'c';

export const Route = createFileRoute('/_app/assets/$type/')({
  validateSearch: (
    search: Record<string, unknown>
  ): { v?: Variant; q?: string; sort?: string; owner?: string; orphans?: boolean } => ({
    v: search.v === 'b' || search.v === 'c' ? search.v : 'a',
    q: typeof search.q === 'string' && search.q ? search.q : undefined,
    sort: typeof search.sort === 'string' && search.sort ? search.sort : undefined,
    /* Facets belong in the URL: "show me the cards in no deck" is only worth having if it can be sent to someone. */
    owner: typeof search.owner === 'string' && search.owner ? search.owner : undefined,
    orphans: search.orphans === true || search.orphans === 'true' ? true : undefined,
  }),
  loader: async ({ params }) => {
    if (!isAssetType(params.type)) {
      throw notFound();
    }
    return await loadAssetsByTypes([params.type]);
  },
  component: TypeBrowsePrototype,
});

const SORTS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'name', label: 'Name A–Z' },
  { value: 'owner', label: 'Owner' },
  { value: 'decks', label: 'Most used' },
];

function sortEntries(entries: AssetListEntry[], sort: string | undefined) {
  const list = [...entries];
  switch (sort) {
    case 'name':
      return list.sort((a, b) => a.name.localeCompare(b.name));
    case 'owner':
      return list.sort((a, b) => (a.owner?.username ?? '').localeCompare(b.owner?.username ?? ''));
    case 'decks':
      return list.sort((a, b) => decksOf(b).length - decksOf(a).length || a.name.localeCompare(b.name));
    default:
      return list.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
}

/* ------------------------------ shared pieces ------------------------------ */

function EntryFace({ entry, width }: { entry: AssetListEntry; width: number }) {
  return <AssetFace type={entry.type} data={entry.data} name={entry.name} width={width} />;
}

/* --- A: catalogue transposition --- */
function UniformGrid({ entries }: { entries: AssetListEntry[] }) {
  return (
    <div className={styles.uniformGrid}>
      {entries.map((entry) => (
        <div key={entry.id} className={styles.tile}>
          {/* An anchor, not a button: this navigates, so it has to be middle-clickable and copyable. The Edit control is a sibling, never a child — an anchor may not contain a control. */}
          <Link className={styles.tileOpen} to="/assets/$type/$slug" params={{ type: entry.type, slug: entry.slug }}>
            <div className={styles.tileArt}>
              <CanvasScale canvasWidth={900} canvasHeight={900 * CARD_ASPECT}>
                <EntryFace entry={entry} width={900} />
              </CanvasScale>
            </div>
            <Text size="sm" fw={600} mt={6} truncate>
              {entry.name}
            </Text>
          </Link>
          <Group gap={6} justify="space-between" wrap="nowrap">
            {/* The count takes the created date's slot: the date is already reachable through the sort field, and at this width the line only fits one fact past the owner. */}
            <Text size="xs" c="dimmed" truncate>
              {entry.owner?.username ?? 'unknown'}
              {deckCountLabel(decksOf(entry)) ? ` · ${deckCountLabel(decksOf(entry))}` : ''}
            </Text>
            <span className={styles.tileActions}>
              <IconAction
                label={`Edit ${entry.name}`}
                variant="subtle"
                color="gray"
                size="sm"
                icon={<Pencil size={14} aria-hidden />}
              />
            </span>
          </Group>
        </div>
      ))}
    </div>
  );
}

/* --- B: contact sheet --- */
function ContactSheet({ entries }: { entries: AssetListEntry[] }) {
  return (
    <div className={styles.contactSheet}>
      {entries.map((entry) => (
        <Link
          key={entry.id}
          className={styles.contactItem}
          to="/assets/$type/$slug"
          params={{ type: entry.type, slug: entry.slug }}
        >
          <CanvasScale canvasWidth={900} canvasHeight={900 * CARD_ASPECT}>
            <EntryFace entry={entry} width={900} />
          </CanvasScale>
          <div className={styles.contactCaption}>
            <Text size="xs" fw={700} c="#fff" truncate>
              {entry.name}
            </Text>
            <Text size="xs" c="#ddd" truncate>
              {entry.owner?.username ?? 'unknown'}
              {deckCountLabel(decksOf(entry)) ? ` · ${deckCountLabel(decksOf(entry))}` : ''}
            </Text>
          </div>
        </Link>
      ))}
    </div>
  );
}

function FacetRail({
  entries,
  owner,
  onOwner,
  orphans,
  onOrphans,
}: {
  entries: AssetListEntry[];
  owner: string | undefined;
  onOwner: (value: string | undefined) => void;
  orphans: boolean;
  onOrphans: (value: boolean) => void;
}) {
  const counts = new Map<string, number>();
  entries.forEach((entry) => {
    const key = entry.owner?.username ?? 'unknown';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  const orphanCount = entries.filter((entry) => decksOf(entry).length === 0).length;
  return (
    <Stack gap="lg">
      <Stack gap="xs">
        <Eyebrow>Owner</Eyebrow>
        <div className={styles.facetRail}>
          <UnstyledButton
            className={styles.facet}
            aria-pressed={owner === undefined}
            onClick={() => onOwner(undefined)}
          >
            <Text size="sm">Everyone</Text>
            <Text size="sm" c="dimmed">
              {entries.length}
            </Text>
          </UnstyledButton>
          {[...counts.entries()].map(([key, count]) => (
            <UnstyledButton
              key={key}
              className={styles.facet}
              aria-pressed={owner === key}
              onClick={() => onOwner(owner === key ? undefined : key)}
            >
              <Text size="sm">{key}</Text>
              <Text size="sm" c="dimmed">
                {count}
              </Text>
            </UnstyledButton>
          ))}
        </div>
      </Stack>
      {/*
       * One membership facet, not a rail of every deck.
       * Owners are bounded by who is active; decks are community-authored and unbounded, and "which cards are in deck X" is the deck detail page's own view (#515), not a filter here.
       * "In no deck" is the question the catalogue genuinely cannot answer any other way.
       */}
      <Stack gap="xs">
        <Eyebrow>Use</Eyebrow>
        <div className={styles.facetRail}>
          <UnstyledButton className={styles.facet} aria-pressed={orphans} onClick={() => onOrphans(!orphans)}>
            <Text size="sm">In no deck</Text>
            <Text size="sm" c="dimmed">
              {orphanCount}
            </Text>
          </UnstyledButton>
        </div>
      </Stack>
    </Stack>
  );
}

/* --- C: grouped ledger --- */
function GroupedLedger({ entries }: { entries: AssetListEntry[] }) {
  const groups = new Map<string, AssetListEntry[]>();
  entries.forEach((entry) => {
    const key = entry.owner?.username ?? 'unknown';
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  });
  return (
    <SectionedSurface>
      {[...groups.entries()].map(([owner, group]) => (
        <SectionedSurface.Row key={owner}>
          <Group gap="lg" align="flex-start" wrap="nowrap">
            <Stack gap={2} style={{ width: 140, flexShrink: 0 }}>
              <Eyebrow>{owner}</Eyebrow>
              <Text size="sm" c="dimmed">
                {group.length} {group.length === 1 ? 'card' : 'cards'}
              </Text>
              <div className={styles.ledgerStrip}>
                {group.slice(0, 4).map((entry) => (
                  <div key={entry.id} className={styles.ledgerThumb}>
                    <CanvasScale canvasWidth={900} canvasHeight={900 * CARD_ASPECT}>
                      <EntryFace entry={entry} width={900} />
                    </CanvasScale>
                  </div>
                ))}
              </div>
            </Stack>
            <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
              {group.map((entry) => (
                <Group key={entry.id} justify="space-between" wrap="nowrap" align="flex-start">
                  {/* The one variation with room for deck names rather than a bare count. */}
                  <Stack gap={0} style={{ minWidth: 0 }}>
                    <Anchor
                      size="sm"
                      truncate
                      renderRoot={(rootProps) => (
                        <Link {...rootProps} to="/assets/$type/$slug" params={{ type: entry.type, slug: entry.slug }} />
                      )}
                    >
                      {entry.name}
                    </Anchor>
                    {deckLabel(decksOf(entry)) ? (
                      <Text size="xs" c="dimmed" truncate>
                        {deckLabel(decksOf(entry))}
                      </Text>
                    ) : null}
                  </Stack>
                  <Group gap={4} wrap="nowrap">
                    <Text size="xs" c="dimmed">
                      {entry.created_at.slice(0, 10)}
                    </Text>
                    <IconAction
                      label={`Edit ${entry.name}`}
                      variant="subtle"
                      color="gray"
                      size="sm"
                      icon={<Pencil size={14} aria-hidden />}
                    />
                  </Group>
                </Group>
              ))}
            </Stack>
          </Group>
        </SectionedSurface.Row>
      ))}
    </SectionedSurface>
  );
}

/* --------------------------------- page --------------------------------- */

function TypeBrowsePrototype() {
  const { type } = Route.useParams();
  const { v = 'a', q, sort, owner, orphans } = Route.useSearch();
  const navigate = useNavigate();
  const loaderData = Route.useLoaderData();
  const live = useAssetsByTypes([type], { initialData: loaderData });
  const definition = ASSET_TYPES[type as keyof typeof ASSET_TYPES];
  const [draft, setDraft] = useState(q ?? '');

  const real = live.data ?? loaderData;
  const all = type === 'card-treachery' ? [...mockEntries(), ...real] : real;
  const filtered = all
    .filter((entry) => (owner ? (entry.owner?.username ?? 'unknown') === owner : true))
    .filter((entry) => (orphans ? decksOf(entry).length === 0 : true))
    .filter((entry) => (q ? entry.name.toLowerCase().includes(q.toLowerCase()) : true));
  const entries = sortEntries(filtered, sort);

  const setSearch = (patch: Record<string, unknown>) =>
    void navigate({ to: '.', search: (prev) => ({ ...prev, ...patch }), replace: true });

  const grid =
    v === 'b' ? (
      <ContactSheet entries={entries} />
    ) : v === 'c' ? (
      <GroupedLedger entries={entries} />
    ) : (
      <UniformGrid entries={entries} />
    );

  return (
    <PageLayout>
      <PageLayout.Header size="compact">
        <Stack className={styles.catalogueHeader} gap="lg">
          <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
            <Stack gap={4} align="flex-start" miw={0}>
              <Eyebrow tone="accent">Community assets</Eyebrow>
              <Title order={1}>{definition?.label ?? type}</Title>
              <Text size="sm" c="dimmed">
                Browse the {definition?.label.toLowerCase() ?? 'assets'} the community has made.
              </Text>
            </Stack>
            <CallToAction
              attention
              renderRoot={(rootProps) => <Link {...rootProps} to="/assets/card-treachery/create" />}
            >
              Create a {definition?.shortLabel.toLowerCase() ?? 'asset'}
            </CallToAction>
          </Group>
        </Stack>
      </PageLayout.Header>

      <PageLayout.Toolbar>
        <Toolbar>
          <Toolbar.Left>
            <Text size="sm" c="dimmed">
              {entries.length === all.length ? `${all.length} cards` : `${entries.length} of ${all.length} cards`}
            </Text>
          </Toolbar.Left>
          <Toolbar.Center>
            {/* The band's centre width comes from this field, not from the toolbar. */}
            <fieldset className={styles.joinedFilters} aria-label="Asset catalogue filters">
              <TextInput
                className={styles.searchSegment}
                variant="unstyled"
                placeholder="Search by name"
                aria-label="Search by name"
                value={draft}
                onChange={(event) => setDraft(event.currentTarget.value)}
                onBlur={() => setSearch({ q: draft || undefined })}
                onKeyDown={(event) => event.key === 'Enter' && setSearch({ q: draft || undefined })}
              />
              <Select
                className={styles.sortSegment}
                variant="unstyled"
                aria-label="Sort"
                allowDeselect={false}
                data={SORTS}
                value={sort ?? 'newest'}
                onChange={(value) => setSearch({ sort: value === 'newest' ? undefined : value })}
              />
            </fieldset>
          </Toolbar.Center>
          <Toolbar.Right>
            <IconAction
              label={`Create a ${definition?.shortLabel.toLowerCase() ?? 'asset'}`}
              variant="filled"
              color="confirm"
              size="lg"
              icon={<Plus size={17} aria-hidden />}
              renderRoot={(rootProps) => <Link {...rootProps} to="/assets/card-treachery/create" />}
            />
          </Toolbar.Right>
        </Toolbar>
      </PageLayout.Toolbar>

      <PageLayout.Content>
        <Stack gap="sm">
          <Surface padding="sm">
            <Group justify="space-between" wrap="wrap" gap="sm">
              <Text size="sm" fw={700}>
                PROTOTYPE — type browse page (#512)
              </Text>
              <Group gap="xs">
                <Select
                  size="xs"
                  aria-label="Variation"
                  allowDeselect={false}
                  data={[
                    { value: 'a', label: 'A · Catalogue transposition' },
                    { value: 'b', label: 'B · Contact sheet' },
                    { value: 'c', label: 'C · Grouped ledger' },
                  ]}
                  value={v}
                  onChange={(value) => setSearch({ v: value })}
                />
              </Group>
            </Group>
          </Surface>

          {entries.length === 0 ? (
            <Surface padding="xl">
              <Stack gap="xs" align="center">
                <Title order={2}>Nothing matches</Title>
                <Text c="dimmed">Clear the search to see everything again.</Text>
              </Stack>
            </Surface>
          ) : (
            <div className={styles.browseRegion} data-facets={v === 'b'}>
              {v === 'b' ? (
                <div className={styles.facetColumn}>
                  <Surface padding="md">
                    <FacetRail
                      entries={all}
                      owner={owner}
                      onOwner={(value) => setSearch({ owner: value })}
                      orphans={orphans === true}
                      onOrphans={(value) => setSearch({ orphans: value || undefined })}
                    />
                  </Surface>
                </div>
              ) : null}
              <div className={styles.browseColumn}>{grid}</div>
            </div>
          )}
        </Stack>
      </PageLayout.Content>
    </PageLayout>
  );
}
