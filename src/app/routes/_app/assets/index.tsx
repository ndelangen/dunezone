/**
 * PROTOTYPE — wayfinder ticket #500 "Assets landing and category browse pages", round 3.
 * The Table concept won; this is three VARIATIONS of it, switchable via ?variant= (A|B|C).
 * Shared skeleton: cards-only dealt fan in the masthead band; body holds the type-level
 * physical piles (card fans, deck pile, four token-shape stacks, boards reservation).
 * A: centered rows in one Surface. B: SectionedSurface ledger rows. C: shelves — pile
 * anchors with the newest items spread flat beside them.
 * All data is in-memory mock rendered with the real game renderers. Throwaway.
 */
import { Badge, Group, Stack, Text, Title, UnstyledButton } from '@mantine/core';
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router';
import { Eyebrow } from '@ui/content/Eyebrow';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import { SectionedSurface } from '@ui/surface/SectionedSurface';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect } from 'react';
import type { CSSProperties, ReactNode } from 'react';

import { CardBack } from '@game/assets/card/Back';
import { SpiceCard } from '@game/assets/card/Spice';
import { CustomToken } from '@game/assets/token/Custom';
import { TreacheryCard } from '@game/assets/treachery/Treachery';
import { backgroundPresets } from '@game/data/backgrounds';
import { card as CARD_SIZE } from '@game/data/sizes';
import { treacheryCardFixtures } from '@game/fixtures/treacheryCards';

const VARIANTS = ['A', 'B', 'C'] as const;
type Variant = (typeof VARIANTS)[number];
const VARIANT_NAMES: Record<Variant, string> = {
  A: 'Centered rows',
  B: 'Ledger',
  C: 'Shelves',
};

type AssetsSearch = { variant?: Variant; category?: string };

export const Route = createFileRoute('/_app/assets/')({
  validateSearch: (search: Record<string, unknown>): AssetsSearch => ({
    variant: VARIANTS.includes(search.variant as Variant) ? (search.variant as Variant) : undefined,
    category: typeof search.category === 'string' ? search.category : undefined,
  }),
  component: AssetsPrototypePage,
});

/* ------------------------------ mock catalogue ------------------------------ */

type MockAsset = {
  slug: string;
  name: string;
  category: 'cards' | 'decks' | 'tokens';
  typeLabel: string;
  owner: string;
  createdAt: string;
  /** ratio of height to width, so layouts can honour true proportions */
  aspect: number;
  /** tokens clip to their physical shape */
  shape?: 'round' | 'gear' | 'square' | 'rect';
  render: () => ReactNode;
};

const CARD_ASPECT = CARD_SIZE.height / CARD_SIZE.width;

const ASSETS: MockAsset[] = [
  { slug: 'lasgun', name: 'Lasgun', category: 'cards', typeLabel: 'Treachery card', owner: 'stilgar', createdAt: 'Aug 18', aspect: CARD_ASPECT, render: () => <TreacheryCard {...treacheryCardFixtures.lasgun} /> },
  { slug: 'chaumas', name: 'Chaumas', category: 'cards', typeLabel: 'Treachery card', owner: 'chani', createdAt: 'Aug 18', aspect: CARD_ASPECT, render: () => <TreacheryCard {...treacheryCardFixtures.chaumas} /> },
  { slug: 'traitor-deck', name: 'Traitor', category: 'decks', typeLabel: 'Deck · 33 cards', owner: 'stilgar', createdAt: 'Aug 17', aspect: CARD_ASPECT, render: () => <CardBack name="Traitor" background={backgroundPresets.traitor} image="/vector/icon/traitor.svg" imageOffset={[0, 10]} imageScale={1.1} /> },
  { slug: 'ambassador-token', name: 'Ambassador', category: 'tokens', typeLabel: 'Token · round', owner: 'duncan', createdAt: 'Aug 17', aspect: 1, shape: 'round', render: () => <CustomToken background={backgroundPresets.techRed} image="/vector/icon/ambassador.svg" circle={false} /> },
  { slug: 'cheap-hero', name: 'Cheap Hero', category: 'cards', typeLabel: 'Treachery card', owner: 'irulan', createdAt: 'Aug 16', aspect: CARD_ASPECT, render: () => <TreacheryCard {...treacheryCardFixtures.cheapHero} /> },
  { slug: 'shield', name: 'Shield', category: 'cards', typeLabel: 'Treachery card', owner: 'gurney', createdAt: 'Aug 16', aspect: CARD_ASPECT, render: () => <TreacheryCard {...treacheryCardFixtures.shield} /> },
  { slug: 'weapons-deck', name: 'Weapons', category: 'decks', typeLabel: 'Deck · 21 cards', owner: 'chani', createdAt: 'Aug 15', aspect: CARD_ASPECT, render: () => <CardBack name="Weapons" background={backgroundPresets.weapon} image="/vector/icon/projectile.svg" imageOffset={[0, 10]} imageScale={1.1} /> },
  { slug: 'heighliner-token', name: 'Heighliner', category: 'tokens', typeLabel: 'Token · round', owner: 'gurney', createdAt: 'Aug 14', aspect: 1, shape: 'round', render: () => <CustomToken background={backgroundPresets.techBlue} image="/vector/icon/heighliners.svg" circle /> },
  { slug: 'weirding-way', name: 'Weirding Way', category: 'cards', typeLabel: 'Treachery card', owner: 'duncan', createdAt: 'Aug 13', aspect: CARD_ASPECT, render: () => <TreacheryCard {...treacheryCardFixtures.weirdingWay} /> },
  { slug: 'baliset', name: 'Baliset', category: 'cards', typeLabel: 'Treachery card', owner: 'irulan', createdAt: 'Aug 12', aspect: CARD_ASPECT, render: () => <TreacheryCard {...treacheryCardFixtures.baliset} /> },
  { slug: 'arsunt', name: 'Arsunt', category: 'cards', typeLabel: 'Spice card', owner: 'stilgar', createdAt: 'Aug 12', aspect: CARD_ASPECT, render: () => <SpiceCard name="Arsunt" subName="Spice mine" icon="spice-mine" highlights={['arsunt']} amount={3} /> },
  { slug: 'gara-kulon', name: 'Gara Kulon', category: 'cards', typeLabel: 'Spice card', owner: 'chani', createdAt: 'Aug 11', aspect: CARD_ASPECT, render: () => <SpiceCard name="Gara Kulon" subName="Spice mine" icon="spice-mine" highlights={['gara-kulon']} amount={5} /> },
  { slug: 'maker-hooks', name: 'Maker Hooks', category: 'tokens', typeLabel: 'Token · gear', owner: 'irulan', createdAt: 'Aug 11', aspect: 1, shape: 'gear', render: () => <CustomToken background={backgroundPresets.techYellow} image="/vector/icon/poison.svg" circle /> },
  { slug: 'fedaykin', name: 'Fedaykin', category: 'tokens', typeLabel: 'Token · round', owner: 'stilgar', createdAt: 'Aug 10', aspect: 1, shape: 'round', render: () => <CustomToken background={backgroundPresets.fremen} image="/vector/logo/fremen.svg" circle /> },
  { slug: 'thumper', name: 'Thumper', category: 'tokens', typeLabel: 'Token · gear', owner: 'duncan', createdAt: 'Aug 10', aspect: 1, shape: 'gear', render: () => <CustomToken background={backgroundPresets.techRed} image="/vector/icon/projectile.svg" circle /> },
  { slug: 'glowglobe', name: 'Glowglobe', category: 'tokens', typeLabel: 'Token · square', owner: 'chani', createdAt: 'Aug 9', aspect: 1, shape: 'square', render: () => <CustomToken background={backgroundPresets.techBlue} image="/vector/icon/ambassador.svg" circle /> },
  { slug: 'paracompass', name: 'Paracompass', category: 'tokens', typeLabel: 'Token · square', owner: 'gurney', createdAt: 'Aug 9', aspect: 1, shape: 'square', render: () => <CustomToken background={backgroundPresets.techYellow} image="/vector/icon/traitor.svg" circle /> },
  { slug: 'servok', name: 'Servok', category: 'tokens', typeLabel: 'Token · square', owner: 'duncan', createdAt: 'Aug 8', aspect: 1, shape: 'square', render: () => <CustomToken background={backgroundPresets.techRed} image="/vector/icon/poison.svg" circle /> },
  { slug: 'krysknife', name: 'Krysknife', category: 'tokens', typeLabel: 'Token · square', owner: 'stilgar', createdAt: 'Aug 8', aspect: 1, shape: 'square', render: () => <CustomToken background={backgroundPresets.techBlue} image="/vector/icon/projectile.svg" circle /> },
  { slug: 'stilltent', name: 'Stilltent', category: 'tokens', typeLabel: 'Token · rectangle', owner: 'chani', createdAt: 'Aug 7', aspect: 0.62, shape: 'rect', render: () => <CustomToken background={backgroundPresets.techYellow} image="/vector/icon/heighliners.svg" circle /> },
  { slug: 'dew-collector', name: 'Dew Collector', category: 'tokens', typeLabel: 'Token · rectangle', owner: 'irulan', createdAt: 'Aug 7', aspect: 0.62, shape: 'rect', render: () => <CustomToken background={backgroundPresets.techRed} image="/vector/icon/ambassador.svg" circle /> },
  { slug: 'sietch-rites', name: 'Sietch Rites', category: 'cards', typeLabel: 'Custom card', owner: 'stilgar', createdAt: 'Aug 6', aspect: CARD_ASPECT, render: () => <TreacheryCard {...treacheryCardFixtures.shaiHulud} /> },
  { slug: 'water-debt', name: 'Water Debt', category: 'cards', typeLabel: 'Custom card', owner: 'irulan', createdAt: 'Aug 6', aspect: CARD_ASPECT, render: () => <TreacheryCard {...treacheryCardFixtures.supplies} /> },
  { slug: 'smugglers-favor', name: "Smuggler's Favor", category: 'cards', typeLabel: 'Custom card', owner: 'gurney', createdAt: 'Aug 5', aspect: CARD_ASPECT, render: () => <TreacheryCard {...treacheryCardFixtures.richeseKarama} /> },
];

const byType = (label: string) => ASSETS.filter((a) => a.typeLabel === label);
const byShape = (shape: MockAsset['shape']) => ASSETS.filter((a) => a.shape === shape);
const decks = () => ASSETS.filter((a) => a.category === 'decks');
const inCategory = (slug?: string) => (slug ? ASSETS.filter((a) => a.category === slug) : ASSETS);

/** the pile groups, shared by all three variations */
const PILE_GROUPS = [
  {
    label: 'Cards & decks',
    piles: [
      { label: 'Treachery cards', to: 'cards', kind: 'fan' as const, assets: () => byType('Treachery card').slice(0, 4) },
      { label: 'Spice cards', to: 'cards', kind: 'fan' as const, assets: () => byType('Spice card') },
      { label: 'Custom cards', to: 'cards', kind: 'fan' as const, assets: () => byType('Custom card') },
      { label: 'Decks', to: 'decks', kind: 'deck' as const, assets: decks },
    ],
  },
  {
    label: 'Tokens',
    piles: [
      { label: 'Round', to: 'tokens', kind: 'stack' as const, assets: () => byShape('round') },
      { label: 'Gear', to: 'tokens', kind: 'stack' as const, assets: () => byShape('gear') },
      { label: 'Square', to: 'tokens', kind: 'stack' as const, assets: () => byShape('square') },
      { label: 'Rectangle', to: 'tokens', kind: 'stack' as const, assets: () => byShape('rect') },
    ],
  },
  {
    label: 'Boards',
    piles: [{ label: 'Boards', to: undefined, kind: 'reservation' as const, assets: () => [] as MockAsset[] }],
  },
];

/* --------------------------- physical renderers --------------------------- */

/** a cog silhouette for gear tokens — 10 teeth, alternating outer/inner radius */
const GEAR_CLIP = (() => {
  const steps = 20;
  const points: string[] = [];
  for (let i = 0; i < steps; i++) {
    const angle = (i / steps) * 2 * Math.PI;
    const next = ((i + 0.72) / steps) * 2 * Math.PI;
    const r = i % 2 === 0 ? 50 : 41;
    points.push(`${50 + r * Math.cos(angle)}% ${50 + r * Math.sin(angle)}%`);
    points.push(`${50 + r * Math.cos(next)}% ${50 + r * Math.sin(next)}%`);
  }
  return `polygon(${points.join(', ')})`;
})();

/**
 * Game renderers draw at intrinsic size (cards: 900x1263, tokens: fill).
 * This mounts one at an exact on-screen width, scaling cards down and boxing tokens.
 */
function Render({ asset, width, style }: { asset: MockAsset; width: number; style?: CSSProperties }) {
  const height = width * asset.aspect;
  const isCard = asset.category !== 'tokens';
  const scale = width / CARD_SIZE.width;
  const radius = asset.shape === 'round' ? '50%' : asset.shape === 'square' || asset.shape === 'rect' ? 8 : width / 18;
  const gear = asset.shape === 'gear';
  return (
    <div
      style={{
        width,
        height,
        position: 'relative',
        borderRadius: gear ? undefined : radius,
        clipPath: gear ? GEAR_CLIP : undefined,
        overflow: 'hidden',
        boxShadow: gear ? undefined : '0 2px 10px rgba(0,0,0,0.45)',
        filter: gear ? 'drop-shadow(0 2px 6px rgba(0,0,0,0.5))' : undefined,
        ...style,
      }}
    >
      {isCard ? (
        <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: CARD_SIZE.width, height: CARD_SIZE.height, pointerEvents: 'none' }}>
          {asset.render()}
        </div>
      ) : (
        <div style={{ width, height, pointerEvents: 'none' }}>{asset.render()}</div>
      )}
    </div>
  );
}

/** deterministic "shuffle" so fans read hand-held, not machine-dealt */
const JITTER_ROT = [2.5, -1.8, 0.8, -2.6, 3.2];
const JITTER_TOP = [5, -4, 2, 6, -3];
const JITTER_LEFT = [3, -4, 2, -3, 4];

/** a small overlapping fan — for card-type piles */
function MiniFan({ assets, width }: { assets: MockAsset[]; width: number }) {
  const mid = (assets.length - 1) / 2;
  return (
    <div style={{ position: 'relative', width: width + assets.length * 26, height: width * 1.4 + 16 }}>
      {assets.map((a, i) => (
        <div
          key={a.slug}
          style={{
            position: 'absolute',
            left: i * 26,
            top: 8 + Math.abs(i - mid) * 4,
            transform: `rotate(${(i - mid) * 6 + JITTER_ROT[i % JITTER_ROT.length]}deg)`,
            transformOrigin: '50% 120%',
          }}
        >
          <Render asset={a} width={width} />
        </div>
      ))}
    </div>
  );
}

/** a squared-up deck pile — the top cardback with two peeking beneath */
function DeckPile({ assets, width }: { assets: MockAsset[]; width: number }) {
  const top = assets[0];
  return (
    <div style={{ position: 'relative', width: width + 6, height: width * CARD_ASPECT + 10 }}>
      {[2, 1, 0].map((n) => (
        <div key={n} style={{ position: 'absolute', top: n * 4, left: n * 2 }}>
          <Render asset={top} width={width} />
        </div>
      ))}
    </div>
  );
}

/** different tokens dropped into a loose stack; height varies with what exists */
const STACK_PLACEMENTS = [
  { top: 42, left: -3, rot: -5 },
  { top: 28, left: 8, rot: 8 },
  { top: 14, left: -5, rot: -6 },
  { top: 0, left: 3, rot: 3 },
];

function TokenStack({ assets, width }: { assets: MockAsset[]; width: number }) {
  const shown = assets.slice(0, 4);
  const placements = STACK_PLACEMENTS.slice(STACK_PLACEMENTS.length - shown.length);
  const tallest = Math.max(...shown.map((a) => width * a.aspect));
  return (
    <div style={{ position: 'relative', width: width + 26, height: tallest + placements[0].top + 6 }}>
      {shown.map((a, i) => {
        const p = placements[i];
        return (
          <div key={a.slug} style={{ position: 'absolute', top: p.top, left: 6 + p.left, transform: `rotate(${p.rot}deg)` }}>
            <Render asset={a} width={width} />
          </div>
        );
      })}
    </div>
  );
}

function BoardReservation({ width = 210, height = 120 }: { width?: number; height?: number }) {
  return (
    <div
      style={{
        width,
        height,
        border: '2px dashed var(--mantine-color-dimmed)',
        borderRadius: 8,
        display: 'grid',
        placeItems: 'center',
        opacity: 0.7,
      }}
    >
      <Text size="xs" c="dimmed" ta="center">
        reserved for
        <br />
        the board
      </Text>
    </div>
  );
}

type PileDef = (typeof PILE_GROUPS)[number]['piles'][number];

function PileArt({ pile }: { pile: PileDef }) {
  switch (pile.kind) {
    case 'fan':
      return <MiniFan assets={pile.assets()} width={104} />;
    case 'deck':
      return <DeckPile assets={pile.assets()} width={110} />;
    case 'stack':
      return <TokenStack assets={pile.assets()} width={pile.assets()[0]?.shape === 'rect' ? 104 : 84} />;
    case 'reservation':
      return <BoardReservation />;
  }
}

function TablePile({ pile, variant }: { pile: PileDef; variant: Variant }) {
  const planned = pile.kind === 'reservation';
  const body = (
    <Stack gap={8} align="center">
      <PileArt pile={pile} />
      <Group gap={6}>
        <Text fw={700} c={planned ? 'dimmed' : undefined}>
          {pile.label}
        </Text>
        {planned ? (
          <Badge size="xs" variant="outline" color="gray">
            Planned
          </Badge>
        ) : (
          <Text c="dimmed">{pile.assets().length}</Text>
        )}
      </Group>
    </Stack>
  );
  if (!pile.to) return body;
  return (
    <UnstyledButton component={Link} to="/assets" search={{ variant, category: pile.to }}>
      {body}
    </UnstyledButton>
  );
}

/* ------------------------- shared masthead and spread ------------------------- */

function MastheadFan() {
  const fan = byType('Treachery card').slice(0, 5);
  return (
    <Stack gap={4} align="center">
      <div style={{ position: 'relative', height: 230, width: 540, flexShrink: 0 }} aria-hidden>
        {fan.map((a, i) => {
          const mid = (fan.length - 1) / 2;
          const off = i - mid;
          return (
            <div
              key={a.slug}
              style={{
                position: 'absolute',
                left: `calc(50% - 70px + ${off * 90 + JITTER_LEFT[i]}px)`,
                top: 28 + Math.abs(off) * 16 + JITTER_TOP[i],
                transform: `rotate(${off * 8 + JITTER_ROT[i]}deg)`,
                transformOrigin: '50% 130%',
              }}
            >
              <Render asset={a} width={138} />
            </div>
          );
        })}
      </div>
    </Stack>
  );
}

const SPREAD_ROTATIONS = [-6, 4, -3, 5, -5, 2, -4, 3, -2, 6];

function CategorySpread({ category, variant }: { category: string; variant: Variant }) {
  const spread = inCategory(category);
  return (
    <Surface padding="xl">
      <Stack gap="lg">
        <Group justify="space-between">
          <UnstyledButton component={Link} to="/assets" search={{ variant }}>
            <Text c="dimmed" fw={600}>
              ← All categories
            </Text>
          </UnstyledButton>
          <Text c="dimmed">{spread.length} in this category</Text>
        </Group>
        <Group gap="xl" align="flex-start" justify="center">
          {spread.map((a, i) => (
            <Stack key={a.slug} gap={6} align="center">
              <Render asset={a} width={a.category === 'tokens' ? 140 : 150} style={{ transform: `rotate(${SPREAD_ROTATIONS[i % SPREAD_ROTATIONS.length]}deg)` }} />
              <Text size="sm" fw={600}>
                {a.name}
              </Text>
              <Text size="xs" c="dimmed">
                by {a.owner} · {a.createdAt}
              </Text>
            </Stack>
          ))}
        </Group>
      </Stack>
    </Surface>
  );
}

function TitleBlock() {
  return (
    <Stack gap={2} align="center">
      <Eyebrow>Community assets</Eyebrow>
      <Title order={1}>Assets</Title>
      <Text c="dimmed" ta="center">
        Cards, decks, tokens and boards, made by the community.
      </Text>
    </Stack>
  );
}

/* ------------------------------- variation A ------------------------------- */
/** Centered rows: one Surface, title block on top, each group a centered labelled row. */
function VariationA() {
  return (
    <Surface padding="xl">
      <Stack gap={40}>
        <TitleBlock />
        <Stack gap="xl">
          {PILE_GROUPS.map((group) => (
            <Stack key={group.label} gap="xs">
              <Eyebrow>{group.label}</Eyebrow>
              <Group gap={48} justify="center" align="flex-end">
                {group.piles.map((pile) => (
                  <TablePile key={pile.label} pile={pile} variant="A" />
                ))}
              </Group>
            </Stack>
          ))}
        </Stack>
      </Stack>
    </Surface>
  );
}

/* ------------------------------- variation B ------------------------------- */
/** Ledger: one SectionedSurface — each group is a hairline-divided row with the group
 * name and count on the left, its piles trailing right. */
function VariationB() {
  return (
    <Stack
      gap="md"
      style={{ '--table-highlight-on-hover-color': 'transparent', '--table-hover-color': 'transparent' } as CSSProperties}
    >
      <TitleBlock />
      <SectionedSurface>
        {PILE_GROUPS.map((group) => {
          const total = group.piles.reduce((n, p) => n + p.assets().length, 0);
          return (
            <SectionedSurface.Row key={group.label}>
              <Group gap="xl" align="center" wrap="nowrap">
                <Stack gap={2} style={{ width: 150, flexShrink: 0 }}>
                  <Eyebrow>{group.label}</Eyebrow>
                  <Text size="sm" c="dimmed">
                    {group.piles[0].kind === 'reservation' ? 'planned' : `${total} assets`}
                  </Text>
                </Stack>
                <Group gap={40} align="flex-end" style={{ flex: 1 }} justify="flex-start">
                  {group.piles.map((pile) => (
                    <TablePile key={pile.label} pile={pile} variant="B" />
                  ))}
                </Group>
              </Group>
            </SectionedSurface.Row>
          );
        })}
      </SectionedSurface>
    </Stack>
  );
}

/* ------------------------------- variation C ------------------------------- */
/** Shelves: each group is a shelf — the pile anchors the left end, the newest items of
 * that group lie flat along the shelf with captions; a shelf edge underlines each row. */
function VariationC() {
  return (
    <Surface padding="xl">
      <Stack gap={44}>
        <TitleBlock />
        {PILE_GROUPS.map((group) => {
          const newest = group.piles
            .flatMap((p) => p.assets())
            .slice(0, 4);
          const anchor = group.piles[0];
          return (
            <Stack key={group.label} gap={0}>
              <Group gap={44} align="flex-end" wrap="nowrap" style={{ paddingBottom: 18, borderBottom: '3px solid rgba(190,160,110,0.22)' }}>
                <Stack gap={8} align="center" style={{ flexShrink: 0 }}>
                  <PileArt pile={anchor} />
                  <Group gap={6}>
                    <Text fw={700} c={anchor.kind === 'reservation' ? 'dimmed' : undefined}>
                      {group.label}
                    </Text>
                    {anchor.kind === 'reservation' ? (
                      <Badge size="xs" variant="outline" color="gray">
                        Planned
                      </Badge>
                    ) : (
                      <Text c="dimmed">{group.piles.reduce((n, p) => n + p.assets().length, 0)}</Text>
                    )}
                  </Group>
                </Stack>
                {newest.length > 0 && (
                  <Group gap="lg" align="flex-end">
                    {newest.map((a) => (
                      <Stack key={a.slug} gap={4} align="center">
                        <Render asset={a} width={a.category === 'tokens' ? 74 : 82} />
                        <Text size="xs" c="dimmed">
                          {a.name}
                        </Text>
                      </Stack>
                    ))}
                  </Group>
                )}
              </Group>
            </Stack>
          );
        })}
      </Stack>
    </Surface>
  );
}

/* ------------------------------- switcher ------------------------------- */

function PrototypeSwitcher({ current }: { current: Variant }) {
  const navigate = useNavigate();
  const cycle = (dir: 1 | -1) => {
    const next = VARIANTS[(VARIANTS.indexOf(current) + dir + VARIANTS.length) % VARIANTS.length];
    void navigate({
      to: '/assets',
      search: (prev: AssetsSearch) => ({ ...prev, variant: next, category: undefined }),
      replace: true,
    });
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (event.key === 'ArrowLeft') cycle(-1);
      if (event.key === 'ArrowRight') cycle(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!import.meta.env.DEV) return null;
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 12px',
        borderRadius: 999,
        background: '#111',
        color: 'white',
        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        fontSize: 13,
      }}
    >
      <UnstyledButton c="white" onClick={() => cycle(-1)} aria-label="Previous variant">
        <ChevronLeft size={16} />
      </UnstyledButton>
      <span>
        {current} — {VARIANT_NAMES[current]}
      </span>
      <UnstyledButton c="white" onClick={() => cycle(1)} aria-label="Next variant">
        <ChevronRight size={16} />
      </UnstyledButton>
    </div>
  );
}

/* --------------------------------- page --------------------------------- */

function AssetsPrototypePage() {
  const { variant = 'A', category } = Route.useSearch();
  return (
    <>
      <PageLayout>
        <PageLayout.Header>
          <MastheadFan />
        </PageLayout.Header>
        <PageLayout.Content>
          {category ? (
            <CategorySpread category={category} variant={variant} />
          ) : variant === 'A' ? (
            <VariationA />
          ) : variant === 'B' ? (
            <VariationB />
          ) : (
            <VariationC />
          )}
        </PageLayout.Content>
      </PageLayout>
      <PrototypeSwitcher current={variant} />
    </>
  );
}
