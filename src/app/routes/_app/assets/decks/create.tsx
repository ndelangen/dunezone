/**
 * PROTOTYPE — wayfinder ticket #503 "Deck editor: cardPicker, cardbackCreator, inline
 * card creation". Workbench chrome as settled (#501/#502): ConnectedTabs chapters, sticky
 * full-width right rail, faction-style toolbar, no-masthead-until-warnings, per-type page.
 * Chapters: Identity | Cards | Cardback.
 * - Cards: the cardPicker — search the catalogue, add cards; composition rows carry the
 *   COUNT (asset_relations count decision: duplicates via count, no ordering); the
 *   quick-create row mock-creates a full secondary card asset (inherits the deck's Group,
 *   owned by its creator) and adds it to the deck.
 * - Cardback: the cardbackCreator — the deck's only publication, per «Deck publication is
 *   its Cardback only».
 * Rail: full-width Cardback proof + the composition fanned beneath it.
 * In-memory draft, real CardBack/TreacheryCard/SpiceCard renderers. Throwaway.
 */
import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Button,
  Group,
  NumberInput,
  SegmentedControl,
  Select,
  Slider,
  Stack,
  Switch,
  Text,
  TextInput,
  UnstyledButton,
} from '@mantine/core';
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router';
import { Eyebrow } from '@ui/content/Eyebrow';
import { IconAction } from '@ui/control/IconAction';
import { PageLayout } from '@ui/layout/PageLayout';
import { ConnectedTabs } from '@ui/surface/ConnectedTabs';
import { Toolbar } from '@ui/surface/Toolbar';
import {
  ArrowDownAZ,
  ArrowLeft,
  Filter,
  Info,
  Layers,
  Minus,
  Plus,
  RotateCcw,
  Save,
  Search,
  Signature,
  Trash2,
  TriangleAlert,
  WalletCards,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

import { CardBack } from '@game/assets/card/Back';
import { SpiceCard } from '@game/assets/card/Spice';
import { TreacheryCard } from '@game/assets/treachery/Treachery';
import { backgroundPresets } from '@game/data/backgrounds';
import { card as CARD_SIZE } from '@game/data/sizes';
import { treacheryCardFixtures } from '@game/fixtures/treacheryCards';

export const Route = createFileRoute('/_app/assets/decks/create')({
  component: DeckEditorPrototypePage,
});

/* ------------------------------ mock catalogue ------------------------------ */

type CatalogueCard = {
  slug: string;
  createdAt: string;
  name: string;
  typeLabel: string;
  owner: string;
  render: () => ReactNode;
};

const CATALOGUE: CatalogueCard[] = [
  { slug: 'lasgun', createdAt: '2026-08-18', name: 'Lasgun', typeLabel: 'Treachery card', owner: 'stilgar', render: () => <TreacheryCard {...treacheryCardFixtures.lasgun} /> },
  { slug: 'chaumas', createdAt: '2026-08-18', name: 'Chaumas', typeLabel: 'Treachery card', owner: 'chani', render: () => <TreacheryCard {...treacheryCardFixtures.chaumas} /> },
  { slug: 'shield', createdAt: '2026-08-16', name: 'Shield', typeLabel: 'Treachery card', owner: 'gurney', render: () => <TreacheryCard {...treacheryCardFixtures.shield} /> },
  { slug: 'cheap-hero', createdAt: '2026-08-16', name: 'Cheap Hero', typeLabel: 'Treachery card', owner: 'irulan', render: () => <TreacheryCard {...treacheryCardFixtures.cheapHero} /> },
  { slug: 'weirding-way', createdAt: '2026-08-13', name: 'Weirding Way', typeLabel: 'Treachery card', owner: 'duncan', render: () => <TreacheryCard {...treacheryCardFixtures.weirdingWay} /> },
  { slug: 'baliset', createdAt: '2026-08-12', name: 'Baliset', typeLabel: 'Treachery card', owner: 'irulan', render: () => <TreacheryCard {...treacheryCardFixtures.baliset} /> },
  { slug: 'arsunt', createdAt: '2026-08-12', name: 'Arsunt', typeLabel: 'Spice card', owner: 'stilgar', render: () => <SpiceCard name="Arsunt" subName="Spice mine" icon="spice-mine" highlights={['arsunt']} amount={3} /> },
];

/* ------------------------------ draft model ------------------------------ */

type CardbackDraft = {
  label: string;
  /** preset key, or the custom composition (the real schema stores a Background either way) */
  backgroundMode: 'preset' | 'custom';
  background: string;
  image: string;
  imageScale: number;
  imageOffsetY: number;
};

/** stock cardbacks, defined in code — what most decks want; the deck still publishes
 * its own cardback image either way, stock just supplies the render payload */
const STOCK_CARDBACKS: Record<string, CardbackDraft> = {
  treachery: { label: 'Treachery', backgroundMode: 'preset', background: 'weapon', image: '/vector/icon/projectile.svg', imageScale: 1.1, imageOffsetY: 10 },
  spice: { label: 'Spice', backgroundMode: 'preset', background: 'spice', image: '/vector/icon/eye.svg', imageScale: 1.1, imageOffsetY: 10 },
  traitor: { label: 'Traitor', backgroundMode: 'preset', background: 'traitor', image: '/vector/icon/traitor.svg', imageScale: 1.1, imageOffsetY: 10 },
};

type DeckDraft = {
  name: string;
  /** slug -> count; the asset_relations rows (count ≥ 1, no ordering) */
  cards: Record<string, number>;
  /** which back the deck wears: a stock key, or 'custom'. Always exactly one — a deck
   * without a back does not exist. */
  backChoice: string;
  cardback: CardbackDraft;
};

const BACKGROUND_OPTIONS = ['traitor', 'weapon', 'defense', 'special', 'worthless', 'spice'] as const;

const IMAGE_OPTIONS = ['traitor', 'projectile', 'poison', 'karama', 'eye', 'key'].map((name) => ({
  value: `/vector/icon/${name}.svg`,
  label: name,
}));

const INITIAL_DRAFT: DeckDraft = {
  name: 'House Treachery',
  cards: { lasgun: 1, chaumas: 1, 'cheap-hero': 3 },
  backChoice: 'treachery',
  cardback: { label: 'Treachery', backgroundMode: 'preset', background: 'weapon', image: '/vector/icon/projectile.svg', imageScale: 1.1, imageOffsetY: 10 },
};

/** the composition that renders and publishes — authored or stock, never absent */
function effectiveCardback(draft: DeckDraft): CardbackDraft {
  if (draft.backChoice === 'custom') return draft.cardback;
  return STOCK_CARDBACKS[draft.backChoice] ?? (draft.cardback as CardbackDraft);
}

const presetOf = (key: string) => backgroundPresets[key as keyof typeof backgroundPresets];

/* ------------------------------ proof rendering ------------------------------ */

const CARD_ASPECT = CARD_SIZE.height / CARD_SIZE.width;

function ScaledCard({ width, children, style }: { width: number; children: ReactNode; style?: CSSProperties }) {
  const scale = width / CARD_SIZE.width;
  return (
    <div
      style={{
        width,
        height: width * CARD_ASPECT,
        position: 'relative',
        borderRadius: width / 18,
        overflow: 'hidden',
        boxShadow: '0 2px 10px rgba(0,0,0,0.45)',
        flexShrink: 0,
        ...style,
      }}
    >
      <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: CARD_SIZE.width, height: CARD_SIZE.height, pointerEvents: 'none' }}>
        {children}
      </div>
    </div>
  );
}

function CardbackProof({ cardback, width, style }: { cardback: CardbackDraft; width: number; style?: CSSProperties }) {
  return (
    <ScaledCard width={width} style={style}>
      <CardBack
        name={cardback.label}
        background={presetOf(cardback.background)}
        image={cardback.image}
        imageOffset={[0, cardback.imageOffsetY]}
        imageScale={cardback.imageScale}
      />
    </ScaledCard>
  );
}

/** rail: the Cardback at full width — the deck's one publication — with the composition fanned beneath */
function RailProofs({ draft, catalogue }: { draft: DeckDraft; catalogue: CatalogueCard[] }) {
  const [width, setWidth] = useState(0);
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);
  const picked = catalogue.filter((card) => (draft.cards[card.slug] ?? 0) > 0);
  const total = Object.values(draft.cards).reduce((n, c) => n + c, 0);
  return (
    <div ref={setNode} style={{ width: '100%' }}>
      {width > 0 && (
        <Stack gap="md">
          <Stack gap={4} align="center">
            <CardbackProof cardback={effectiveCardback(draft)} width={width} />
            <Text size="xs" c="dimmed">
              cardback — the deck's publication
            </Text>
          </Stack>
          {picked.length > 0 ? (
            <Stack gap={4} align="center">
              <div style={{ position: 'relative', width, height: width * 0.42 }}>
                {picked.slice(0, 5).map((card, i) => (
                  <div
                    key={card.slug}
                    style={{
                      position: 'absolute',
                      left: (i * (width - width * 0.28)) / Math.max(picked.length - 1, 1),
                      top: 4,
                      transform: `rotate(${(i - (Math.min(picked.length, 5) - 1) / 2) * 4}deg)`,
                      transformOrigin: '50% 130%',
                    }}
                  >
                    <ScaledCard width={width * 0.28}>{card.render()}</ScaledCard>
                  </div>
                ))}
              </div>
              <Text size="xs" c="dimmed">
                {total} card{total === 1 ? '' : 's'} in the deck
              </Text>
            </Stack>
          ) : null}
        </Stack>
      )}
    </div>
  );
}

/* ------------------------------ chapters ------------------------------ */

type Patch = (update: Partial<DeckDraft>) => void;

function IdentityFields({ draft, patch }: { draft: DeckDraft; patch: Patch }) {
  return (
    <TextInput
      label="Name"
      description="Names the deck in the catalogue and determines its URL"
      value={draft.name}
      onChange={(e) => patch({ name: e.currentTarget.value })}
    />
  );
}

/** the cardPicker: composition on top (rows with count steppers), catalogue search below,
 * and the quick-create row that mock-creates a secondary card asset */
function CardsFields({
  draft,
  patch,
  catalogue,
  isDirty,
  onCreateCard,
}: {
  draft: DeckDraft;
  patch: Patch;
  catalogue: CatalogueCard[];
  isDirty: boolean;
  onCreateCard: () => void;
}) {
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [sort, setSort] = useState('name');
  const picked = catalogue.filter((card) => (draft.cards[card.slug] ?? 0) > 0);
  const available = catalogue
    .filter(
      (card) =>
        (draft.cards[card.slug] ?? 0) === 0 &&
        card.name.toLowerCase().includes(query.toLowerCase()) &&
        (!typeFilter || card.typeLabel === typeFilter)
    )
    .sort((a, b) =>
      sort === 'newest'
        ? b.createdAt.localeCompare(a.createdAt)
        : sort === 'owner'
          ? a.owner.localeCompare(b.owner) || a.name.localeCompare(b.name)
          : a.name.localeCompare(b.name)
    );
  const setCount = (slug: string, count: number) => {
    const cards = { ...draft.cards };
    if (count <= 0) delete cards[slug];
    else cards[slug] = count;
    patch({ cards });
  };
  return (
    <Stack gap="lg">
      <Stack gap="xs">
        <Eyebrow>In this deck</Eyebrow>
        {picked.length === 0 ? (
          <Text size="sm" c="dimmed">
            No cards yet — add them from the catalogue below.
          </Text>
        ) : (
          picked.map((card) => (
            <Group key={card.slug} gap="sm" wrap="nowrap" style={{ borderBottom: '1px solid rgba(128,128,128,0.15)', paddingBottom: 6 }}>
              <ScaledCard width={34}>{card.render()}</ScaledCard>
              <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
                <Text fw={600} truncate>
                  {card.name}
                </Text>
                <Text size="xs" c="dimmed">
                  {card.typeLabel} · by {card.owner}
                </Text>
              </Stack>
              <Group gap={4} wrap="nowrap">
                <ActionIcon variant="light" size="sm" aria-label={`One fewer ${card.name}`} onClick={() => setCount(card.slug, (draft.cards[card.slug] ?? 1) - 1)}>
                  <Minus size={13} aria-hidden />
                </ActionIcon>
                <NumberInput
                  w={56}
                  size="xs"
                  min={1}
                  value={draft.cards[card.slug] ?? 1}
                  onChange={(value) => typeof value === 'number' && setCount(card.slug, value)}
                  aria-label={`Copies of ${card.name}`}
                  hideControls
                  styles={{ input: { textAlign: 'center' } }}
                />
                <ActionIcon variant="light" size="sm" aria-label={`One more ${card.name}`} onClick={() => setCount(card.slug, (draft.cards[card.slug] ?? 0) + 1)}>
                  <Plus size={13} aria-hidden />
                </ActionIcon>
                <ActionIcon variant="light" color="red" size="sm" aria-label={`Remove ${card.name}`} onClick={() => setCount(card.slug, 0)}>
                  <Trash2 size={13} aria-hidden />
                </ActionIcon>
              </Group>
            </Group>
          ))
        )}
      </Stack>
      <Stack gap="xs">
        <Eyebrow>Card catalogue</Eyebrow>
        {/* three controls joined into one field — the faction catalogue toolbar pattern —
            with the create-card action detached beside it */}
        <Group gap="sm" wrap="nowrap" align="center">
        <fieldset
          aria-label="Card catalogue filters"
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'stretch',
            minWidth: 0,
            padding: 0,
            margin: 0,
            overflow: 'hidden',
            border: '1px solid var(--mantine-color-default-border)',
            borderRadius: 'var(--mantine-radius-sm)',
            background: 'var(--mantine-color-body)',
            boxShadow: 'var(--mantine-shadow-xs)',
          }}
        >
          <TextInput
            variant="unstyled"
            style={{ flex: '1 1 10rem', minWidth: '7rem' }}
            leftSection={<Search size={15} aria-hidden />}
            placeholder="Search cards…"
            aria-label="Search cards"
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
          />
          <Select
            variant="unstyled"
            style={{ flex: '0 0 9.5rem', minWidth: 0, borderLeft: '1px solid var(--mantine-color-default-border)' }}
            aria-label="Filter by card type"
            placeholder="All types"
            clearable
            leftSection={<Filter size={15} aria-hidden />}
            data={[...new Set(catalogue.map((card) => card.typeLabel))]}
            value={typeFilter}
            onChange={setTypeFilter}
          />
          <Select
            variant="unstyled"
            style={{ flex: '0 0 9rem', minWidth: 0, borderLeft: '1px solid var(--mantine-color-default-border)' }}
            aria-label="Sort cards"
            leftSection={<ArrowDownAZ size={15} aria-hidden />}
            data={[
              { value: 'name', label: 'Name A–Z' },
              { value: 'newest', label: 'Newest' },
              { value: 'owner', label: 'By owner' },
            ]}
            value={sort}
            onChange={(value) => value && setSort(value)}
          />
        </fieldset>
        {/* the way out of the flow — replaces the old callout; disabled while unsaved */}
        <IconAction
          label="Create a new card"
          tooltip={
            isDirty
              ? 'Save your deck first — creating a card leaves this page'
              : 'Create a new card — leaves this page for the card editor'
          }
          variant="filled"
          color="confirm"
          size="lg"
          disabled={isDirty}
          onClick={onCreateCard}
          icon={<Plus size={17} aria-hidden />}
        />
        </Group>
        <Text size="xs" c="dimmed">
          {available.length} of {catalogue.length - picked.length} cards
        </Text>
        {available.map((card) => (
          <Group key={card.slug} gap="sm" wrap="nowrap">
            <ScaledCard width={34}>{card.render()}</ScaledCard>
            <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
              <Text fw={600} truncate>
                {card.name}
              </Text>
              <Text size="xs" c="dimmed">
                {card.typeLabel} · by {card.owner}
              </Text>
            </Stack>
            <Button size="compact-sm" variant="light" leftSection={<Plus size={13} aria-hidden />} onClick={() => setCount(card.slug, 1)}>
              Add
            </Button>
          </Group>
        ))}
      </Stack>
    </Stack>
  );
}

function CardbackFields({ draft, patch }: { draft: DeckDraft; patch: Patch }) {
  const set = (update: Partial<CardbackDraft>) => patch({ cardback: { ...draft.cardback, ...update } });
  return (
    <Stack gap="sm">
      <Select
        label="Card back"
        description="Every deck wears exactly one back — a stock one, or your own. The deck publishes its cardback image either way."
        data={[
          ...Object.entries(STOCK_CARDBACKS).map(([value, stock]) => ({ value, label: `${stock.label} card back` })),
          { value: 'custom', label: 'Custom…' },
        ]}
        value={draft.backChoice}
        allowDeselect={false}
        onChange={(value) => value && patch({ backChoice: value })}
      />
      {draft.backChoice === 'custom' ? (
        <>
      <TextInput
        label="Cardback label"
        description="The word on the back — often the deck's nature, not its name"
        value={draft.cardback.label}
        onChange={(e) => set({ label: e.currentTarget.value })}
      />
      <div>
        <Text size="sm" fw={500} mb={4}>
          Background
        </Text>
        <SegmentedControl
          fullWidth
          value={draft.cardback.backgroundMode}
          onChange={(value) => set({ backgroundMode: value as CardbackDraft['backgroundMode'] })}
          data={[
            { value: 'preset', label: 'Preset' },
            { value: 'custom', label: 'Custom' },
          ]}
        />
      </div>
      {draft.cardback.backgroundMode === 'preset' ? (
        <Select
          aria-label="Background preset"
          data={BACKGROUND_OPTIONS.map((key) => ({ value: key, label: key }))}
          value={draft.cardback.background}
          onChange={(value) => value && set({ background: value })}
        />
      ) : (
        <Text size="sm" c="dimmed">
          The custom composer goes here — the existing background composer (pattern, colors, definition, influence,
          inversion) from faction editing, exactly as the card editor's custom head. Not rebuilt in this prototype.
        </Text>
      )}
      <Select label="Emblem" data={IMAGE_OPTIONS} value={draft.cardback.image} onChange={(value) => value && set({ image: value })} />
      <div>
        <Text size="sm" fw={500} mb={4}>
          Emblem scale
        </Text>
        <Slider min={0.5} max={2} step={0.05} value={draft.cardback.imageScale} onChange={(value) => set({ imageScale: value })} label={(v) => v.toFixed(2)} />
      </div>
      <div>
        <Text size="sm" fw={500} mb={4}>
          Emblem vertical offset
        </Text>
        <Slider min={-60} max={60} step={1} value={draft.cardback.imageOffsetY} onChange={(value) => set({ imageOffsetY: value })} label={(v) => `${v}`} />
      </div>
        </>
      ) : null}
    </Stack>
  );
}

/* ----------------------------- validation + page ----------------------------- */

const VALIDATION_STRIP_ID = 'deck-validation-header';

type DraftWarning = { source: string; missing: string; chapter: string };

function draftWarnings(draft: DeckDraft): DraftWarning[] {
  const warnings: DraftWarning[] = [];
  if (!draft.name.trim()) warnings.push({ source: 'Identity', missing: 'a name', chapter: 'identity' });
  if (Object.keys(draft.cards).length === 0) warnings.push({ source: 'Cards', missing: 'cards', chapter: 'cards' });
  if (draft.backChoice === 'custom' && !draft.cardback.label.trim())
    warnings.push({ source: 'Cardback', missing: 'a label', chapter: 'identity' });
  return warnings;
}

function ValidationStrip({ warnings, onFocus }: { warnings: DraftWarning[]; onFocus: (w: DraftWarning) => void }) {
  return (
    <Group gap="sm" justify="center">
      <Group gap={6}>
        <TriangleAlert size={15} aria-hidden />
        <Text size="sm" fw={700}>
          Incomplete fields
        </Text>
      </Group>
      {warnings.map((warning) => (
        <UnstyledButton
          key={`${warning.source}-${warning.missing}`}
          onClick={() => onFocus(warning)}
          style={{ borderRadius: 999, padding: '2px 10px', background: 'rgba(255,255,255,0.12)', fontSize: 13 }}
        >
          <strong>{warning.source}</strong>: missing {warning.missing}
        </UnstyledButton>
      ))}
    </Group>
  );
}

const panel = (children: ReactNode) => (
  <Stack gap="md" p="lg">
    {children}
  </Stack>
);

function DeckEditorPrototypePage() {
  const navigate = useNavigate();
  const [draft, setDraft] = useState<DeckDraft>(INITIAL_DRAFT);
  const [chapter, setChapter] = useState('identity');
  const patch: Patch = (update) => setDraft((prev) => ({ ...prev, ...update }));
  const catalogue = CATALOGUE;
  const warnings = draftWarnings(draft);
  const isDirty = JSON.stringify(draft) !== JSON.stringify(INITIAL_DRAFT);
  const isNameBlank = !draft.name.trim();

  return (
    <>
      <PageLayout>
        {warnings.length > 0 ? (
          <PageLayout.Header size="compact">
            <div id={VALIDATION_STRIP_ID}>
              <ValidationStrip warnings={warnings} onFocus={(warning) => setChapter(warning.chapter)} />
            </div>
          </PageLayout.Header>
        ) : null}
        <PageLayout.Toolbar>
          <Toolbar>
            <Toolbar.Left>
              <Group gap="sm" wrap="nowrap">
                <IconAction
                  label="Back"
                  variant="light"
                  color="gray"
                  size="lg"
                  onClick={() => void navigate({ to: '/assets' })}
                  icon={<ArrowLeft size={17} aria-hidden />}
                />
                <Stack gap={2}>
                  <Group gap="xs" wrap="nowrap">
                    <Badge color={isDirty ? 'orange' : 'gray'} variant="light">
                      {isDirty ? 'Unsaved changes' : 'No unsaved changes'}
                    </Badge>
                    {warnings.length > 0 ? (
                      <Button
                        type="button"
                        variant="subtle"
                        color="yellow"
                        size="compact-xs"
                        onClick={() =>
                          document.getElementById(VALIDATION_STRIP_ID)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                        }
                      >
                        {warnings.length} {warnings.length === 1 ? 'field may' : 'fields may'} be incomplete
                      </Button>
                    ) : null}
                  </Group>
                  <Text size="xs" c="dimmed" role="status">
                    {isNameBlank
                      ? 'Add a deck name before saving; it determines the deck URL.'
                      : 'New deck — saving it schedules its Cardback image; card faces publish from the cards themselves.'}
                  </Text>
                </Stack>
              </Group>
            </Toolbar.Left>
            <Toolbar.Right>
              <Group gap="xs" wrap="nowrap">
                <IconAction
                  label="Reset unsaved edits"
                  variant="light"
                  color="gray"
                  size="lg"
                  disabled={!isDirty}
                  onClick={() => setDraft(INITIAL_DRAFT)}
                  icon={<RotateCcw size={17} aria-hidden />}
                />
                <Button type="button" color="confirm" leftSection={<Save size={17} aria-hidden />} disabled={isNameBlank}>
                  Save deck
                </Button>
              </Group>
            </Toolbar.Right>
          </Toolbar>
        </PageLayout.Toolbar>
        <PageLayout.Content>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) minmax(17rem, 21rem)',
              alignItems: 'start',
              width: '100%',
              maxWidth: '78rem',
              margin: '0 auto',
            }}
          >
            <ConnectedTabs
              value={chapter}
              onValueChange={setChapter}
              ariaLabel="Deck chapters"
              items={[
                {
                  value: 'identity',
                  label: 'Identity',
                  /* the chapter wears the deck's chosen emblem, like faction chapters wear their symbols */
                  icon: (
                    <img
                      src={effectiveCardback(draft).image}
                      alt=""
                      width={21}
                      height={21}
                      style={{ filter: 'invert(1)', opacity: 0.9 }}
                    />
                  ),
                  panel: panel(
                    <>
                      <IdentityFields draft={draft} patch={patch} />
                      <CardbackFields draft={draft} patch={patch} />
                    </>
                  ),
                },
                { value: 'cards', label: 'Cards', icon: <WalletCards size={21} aria-hidden />, panel: panel(<CardsFields draft={draft} patch={patch} catalogue={catalogue} isDirty={isDirty} onCreateCard={() => void navigate({ to: '/assets/cards/create' })} />) },
              ]}
            />
            <div style={{ minWidth: 0, paddingLeft: 'var(--mantine-spacing-md)' }}>
              <div style={{ position: 'sticky', top: 96 }}>
                <RailProofs draft={draft} catalogue={catalogue} />
              </div>
            </div>
          </div>
        </PageLayout.Content>
      </PageLayout>
    </>
  );
}
