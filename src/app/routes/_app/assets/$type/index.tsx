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
 * And the up-close view (#515 lives here) switchable against the same grid:
 * ?u=overlay  addressable and focused   ?u=rail  contextual and comparative
 *
 * Already decided, not re-litigated: the create affordance lives in the PageHeader and the toolbar
 * (#512 comment);
 * clicking a card/token entry means the up-close view and Edit stays on this page
 * (#515 reframe);
 * the honest empty and Planned states stay.
 *
 * The catalogue is seeded with mock treachery cards — only one real asset exists, and density is the whole question.
 * Real entries are appended when present.
 */
import { Badge, Group, Modal, Select, Stack, Text, TextInput, Title, UnstyledButton } from '@mantine/core';
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
import { Pencil, Plus, Search } from 'lucide-react';
import { useState } from 'react';

import { loadAssetsByTypes, useAssetsByTypes } from '@app/db/assets';
import type { AssetListEntry } from '@app/db/assets';
import { backgroundPresets } from '@game/data/backgrounds';

import { AssetFace, CARD_ASPECT } from '../-assetFaces';
import styles from './index.module.css';

type Variant = 'a' | 'b' | 'c';
type UpClose = 'overlay' | 'rail';

export const Route = createFileRoute('/_app/assets/$type/')({
  validateSearch: (search: Record<string, unknown>): { v?: Variant; u?: UpClose; q?: string; sort?: string } => ({
    v: search.v === 'b' || search.v === 'c' ? search.v : 'a',
    u: search.u === 'rail' ? 'rail' : 'overlay',
    q: typeof search.q === 'string' && search.q ? search.q : undefined,
    sort: typeof search.sort === 'string' && search.sort ? search.sort : undefined,
  }),
  loader: async ({ params }) => {
    if (!isAssetType(params.type)) {
      throw notFound();
    }
    return await loadAssetsByTypes([params.type]);
  },
  component: TypeBrowsePrototype,
});

/* ------------------------------ mock catalogue ------------------------------ */

const MOCK_NAMES = [
  ['Lasgun', 'Weapon - Projectile', 'weapon'],
  ['Shield', 'Defense - Projectile', 'defense'],
  ['Crysknife', 'Weapon - Projectile', 'weapon'],
  ['Maula Pistol', 'Weapon - Projectile', 'weapon'],
  ['Slip Tip', 'Weapon - Poison', 'weapon'],
  ['Stunner', 'Weapon - Poison', 'weapon'],
  ['Chaumas', 'Weapon - Poison', 'weapon'],
  ['Snooper', 'Defense - Poison', 'defense'],
  ['Chaumurky', 'Weapon - Poison', 'weapon'],
  ['Gom Jabbar', 'Weapon - Poison', 'weapon'],
  ['Shield Snooper', 'Defense - Both', 'defense'],
  ['Karama', 'Special', 'special'],
  ['Truthtrance', 'Special', 'special'],
  ['Family Atomics', 'Special', 'special'],
  ['Weather Control', 'Special', 'special'],
  ['Baliset', 'Worthless', 'worthless'],
  ['Kulon', 'Worthless', 'worthless'],
  ['Trip to Gamont', 'Worthless', 'worthless'],
] as const;

const MOCK_OWNERS = ['stilgar', 'gurney', 'irulan', 'Central'];
const HEADS: Record<string, { head: object; striped: object }> = {
  weapon: { head: backgroundPresets.weapon, striped: backgroundPresets.stripedWeapon },
  defense: { head: backgroundPresets.defense, striped: backgroundPresets.stripedDefense },
  special: { head: backgroundPresets.special, striped: backgroundPresets.stripedSpecial },
  worthless: { head: backgroundPresets.worthless, striped: backgroundPresets.stripedWorthless },
};
const ICONS = ['/vector/icon/projectile.svg', '/vector/icon/poison.svg', '/vector/icon/karama.svg'];

const mockEntries = (): AssetListEntry[] =>
  MOCK_NAMES.map(([name, subName, kind], i) => {
    const preset = HEADS[kind] ?? HEADS.weapon!;
    return {
      id: `mock-${i}` as AssetListEntry['id'],
      type: 'card-treachery',
      slug: name.toLowerCase().replace(/\s+/g, '-'),
      name,
      created_at: `2026-08-${String(2 + (i % 17)).padStart(2, '0')}T10:00:00.000Z`,
      updated_at: `2026-08-${String(2 + (i % 17)).padStart(2, '0')}T10:00:00.000Z`,
      owner: {
        id: `owner-${i % MOCK_OWNERS.length}` as never,
        slug: MOCK_OWNERS[i % MOCK_OWNERS.length] as string,
        username: MOCK_OWNERS[i % MOCK_OWNERS.length] as string,
        avatar_url: null,
      },
      data: {
        name,
        subName,
        head: preset.head,
        icon: [preset.striped, ICONS[i % ICONS.length]],
        decals: [],
        text: 'Prototype seed data — the catalogue needs bulk before density can be judged.',
      },
    } as AssetListEntry;
  });

const SORTS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'name', label: 'Name A–Z' },
  { value: 'owner', label: 'Owner' },
];

function sortEntries(entries: AssetListEntry[], sort: string | undefined) {
  const list = [...entries];
  switch (sort) {
    case 'name':
      return list.sort((a, b) => a.name.localeCompare(b.name));
    case 'owner':
      return list.sort((a, b) => (a.owner?.username ?? '').localeCompare(b.owner?.username ?? ''));
    default:
      return list.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
}

/* ------------------------------ shared pieces ------------------------------ */

function EntryFace({ entry, width }: { entry: AssetListEntry; width: number }) {
  return <AssetFace type={entry.type} data={entry.data} name={entry.name} width={width} />;
}

/* --- A: catalogue transposition --- */
function UniformGrid({ entries, onOpen }: { entries: AssetListEntry[]; onOpen: (e: AssetListEntry) => void }) {
  return (
    <div className={styles.uniformGrid}>
      {entries.map((entry) => (
        <div key={entry.id} className={styles.tile}>
          <UnstyledButton className={styles.tileOpen} onClick={() => onOpen(entry)}>
            <div className={styles.tileArt}>
              <CanvasScale canvasWidth={900} canvasHeight={900 * CARD_ASPECT}>
                <EntryFace entry={entry} width={900} />
              </CanvasScale>
            </div>
            <Text size="sm" fw={600} mt={6} truncate>
              {entry.name}
            </Text>
          </UnstyledButton>
          <Group gap={6} justify="space-between" wrap="nowrap">
            <Text size="xs" c="dimmed" truncate>
              {entry.owner?.username ?? 'unknown'} · {entry.created_at.slice(5, 10)}
            </Text>
            <span className={styles.tileActions}>
              <IconAction
                label="Edit"
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
function ContactSheet({ entries, onOpen }: { entries: AssetListEntry[]; onOpen: (e: AssetListEntry) => void }) {
  return (
    <div className={styles.contactSheet}>
      {entries.map((entry) => (
        <UnstyledButton key={entry.id} className={styles.contactItem} onClick={() => onOpen(entry)}>
          <CanvasScale canvasWidth={900} canvasHeight={900 * CARD_ASPECT}>
            <EntryFace entry={entry} width={900} />
          </CanvasScale>
          <div className={styles.contactCaption}>
            <Text size="xs" fw={700} c="#fff" truncate>
              {entry.name}
            </Text>
            <Text size="xs" c="#ddd" truncate>
              {entry.owner?.username ?? 'unknown'}
            </Text>
          </div>
        </UnstyledButton>
      ))}
    </div>
  );
}

function FacetRail({
  entries,
  owner,
  onOwner,
}: {
  entries: AssetListEntry[];
  owner: string | null;
  onOwner: (value: string | null) => void;
}) {
  const counts = new Map<string, number>();
  entries.forEach((entry) => {
    const key = entry.owner?.username ?? 'unknown';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  return (
    <Stack gap="xs">
      <Eyebrow>Owner</Eyebrow>
      <div className={styles.facetRail}>
        <UnstyledButton className={styles.facet} aria-pressed={owner === null} onClick={() => onOwner(null)}>
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
            onClick={() => onOwner(owner === key ? null : key)}
          >
            <Text size="sm">{key}</Text>
            <Text size="sm" c="dimmed">
              {count}
            </Text>
          </UnstyledButton>
        ))}
      </div>
    </Stack>
  );
}

/* --- C: grouped ledger --- */
function GroupedLedger({ entries, onOpen }: { entries: AssetListEntry[]; onOpen: (e: AssetListEntry) => void }) {
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
                <Group key={entry.id} justify="space-between" wrap="nowrap">
                  <Text size="sm" truncate>
                    {entry.name}
                  </Text>
                  <Group gap={4} wrap="nowrap">
                    <Text size="xs" c="dimmed">
                      {entry.created_at.slice(0, 10)}
                    </Text>
                    <IconAction
                      label="Up close"
                      variant="subtle"
                      color="gray"
                      size="sm"
                      icon={<Search size={14} aria-hidden />}
                      onClick={() => onOpen(entry)}
                    />
                    <IconAction
                      label="Edit"
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

/* --- the up-close view --- */
function UpCloseBody({ entry }: { entry: AssetListEntry }) {
  return (
    <Stack gap="sm">
      <div className={styles.upCloseArt}>
        <CanvasScale canvasWidth={900} canvasHeight={900 * CARD_ASPECT}>
          <EntryFace entry={entry} width={900} />
        </CanvasScale>
      </div>
      <Group justify="space-between">
        <Stack gap={0}>
          <Text fw={700}>{entry.name}</Text>
          <Text size="xs" c="dimmed">
            by {entry.owner?.username ?? 'unknown'}
          </Text>
        </Stack>
        <Group gap="xs">
          <IconAction label="Edit" variant="light" color="gray" size="lg" icon={<Pencil size={16} aria-hidden />} />
        </Group>
      </Group>
      <Badge variant="light" color="gray">
        Download appears here once the publisher makes images
      </Badge>
    </Stack>
  );
}

/* --------------------------------- page --------------------------------- */

function TypeBrowsePrototype() {
  const { type } = Route.useParams();
  const { v = 'a', u = 'overlay', q, sort } = Route.useSearch();
  const navigate = useNavigate();
  const loaderData = Route.useLoaderData();
  const live = useAssetsByTypes([type], { initialData: loaderData });
  const definition = ASSET_TYPES[type as keyof typeof ASSET_TYPES];
  const [open, setOpen] = useState<AssetListEntry | null>(null);
  const [owner, setOwner] = useState<string | null>(null);
  const [draft, setDraft] = useState(q ?? '');

  const real = live.data ?? loaderData;
  const all = type === 'card-treachery' ? [...mockEntries(), ...real] : real;
  const filtered = all
    .filter((entry) => (owner ? (entry.owner?.username ?? 'unknown') === owner : true))
    .filter((entry) => (q ? entry.name.toLowerCase().includes(q.toLowerCase()) : true));
  const entries = sortEntries(filtered, sort);

  const showRail = u === 'rail' && v !== 'c';

  const setSearch = (patch: Record<string, unknown>) =>
    void navigate({ to: '.', search: (prev) => ({ ...prev, ...patch }), replace: true });

  const grid =
    v === 'b' ? (
      <ContactSheet entries={entries} onOpen={setOpen} />
    ) : v === 'c' ? (
      <GroupedLedger entries={entries} onOpen={setOpen} />
    ) : (
      <UniformGrid entries={entries} onOpen={setOpen} />
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
                <Select
                  size="xs"
                  aria-label="Up-close mechanism"
                  allowDeselect={false}
                  data={[
                    { value: 'overlay', label: 'Up close: overlay' },
                    { value: 'rail', label: 'Up close: rail' },
                  ]}
                  value={u}
                  onChange={(value) => setSearch({ u: value })}
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
            <div className={styles.browseRegion} data-facets={v === 'b'} data-rail={showRail}>
              {v === 'b' ? (
                <div className={styles.facetColumn}>
                  <Surface padding="md">
                    <FacetRail entries={all} owner={owner} onOwner={setOwner} />
                  </Surface>
                </div>
              ) : null}
              <div className={styles.browseColumn}>{grid}</div>
              {showRail ? (
                <div className={styles.railCard}>
                  <Surface padding="md">
                    {open ? (
                      <UpCloseBody entry={open} />
                    ) : (
                      <Text size="sm" c="dimmed">
                        Pick a card to see it up close. The rail stays put while you scroll, so you can compare against
                        its neighbours.
                      </Text>
                    )}
                  </Surface>
                </div>
              ) : null}
            </div>
          )}
        </Stack>

        <Modal
          opened={u === 'overlay' && open !== null}
          onClose={() => setOpen(null)}
          title={open?.name}
          size="lg"
          centered
        >
          {open ? <UpCloseBody entry={open} /> : null}
        </Modal>
      </PageLayout.Content>
    </PageLayout>
  );
}
