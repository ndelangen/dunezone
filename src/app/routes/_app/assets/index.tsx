import { Badge, Stack, Text, Title, UnstyledButton } from '@mantine/core';
import { ASSET_TYPE_KEYS, ASSET_TYPES } from '@shared/assets/types';
import type { AssetCategory, AssetType } from '@shared/assets/types';
import { Link, createFileRoute } from '@tanstack/react-router';
import { Eyebrow } from '@ui/content/Eyebrow';
import { PageLayout } from '@ui/layout/PageLayout';
import { SectionedSurface } from '@ui/surface/SectionedSurface';
import type { CSSProperties } from 'react';

import { loadAssetCataloguePage, useAssetCataloguePage } from '@app/db/assets';
import type { AssetListEntry } from '@app/db/assets';
import { AssetFace, assetFaceAspect } from '@app/widgets/asset-face/AssetFace';

import styles from './index.module.css';

export const Route = createFileRoute('/_app/assets/')({
  loader: loadAssetCataloguePage,
  component: AssetsLandingPage,
});

/** deterministic jitter so fans read hand-held, not machine-dealt */
const JITTER_ROT = [2.5, -1.8, 0.8, -2.6, 3.2];
const JITTER_TOP = [5, -4, 2, 6, -3];
const JITTER_LEFT = [3, -4, 2, -3, 4];

/** the slot width a pile is drawn at when the row has room for it in full */
const PILE_SLOT = 150;
/** horizontal shift per extra card in a fan; slight, so the faces keep the placeholder's size rather than sharing the slot out (Norbert, 2026-08-21) */
const FAN_OVERLAP = 6;
/** how many cards a pile's fan shows; three reads as a pile without shrinking anyone */
const FAN_COUNT = 3;
/** the masthead fan's cards are placed by hand against a fixed 540px band, so they are the one fan drawn at a set size */
const MASTHEAD_CARD = 138;

/* Handed to the stylesheet so the grid tracks and the art cannot drift apart. */
const pileGroupStyle = { '--pile-slot': `${PILE_SLOT}px` } as CSSProperties;

/**
 * The ledger's three rows, each naming the categories whose piles it holds.
 * Written out rather than derived from the category list, because the rows do not map one to one onto categories: cards and decks share a row.
 */
const PILE_ROWS: { label: string; categories: AssetCategory[] }[] = [
  { label: 'Cards & decks', categories: ['cards', 'decks'] },
  { label: 'Tokens', categories: ['tokens'] },
  { label: 'Boards', categories: ['boards'] },
];

/**
 * Which types each row draws.
 * Derived rather than listed, because a hand-written list is a second answer to which types exist and it had already drifted: `bundle` went live and never reached this page, so a live type had no pile and no way in from the landing.
 * Order comes from `ASSET_TYPES`' own declaration order, which is the curated order the old list already had.
 */
const PILE_GROUPS = PILE_ROWS.map(({ label, categories }) => ({
  label,
  types: ASSET_TYPE_KEYS.filter((type) => categories.includes(ASSET_TYPES[type].category)),
}));

function MastheadFan({ cards }: { cards: AssetListEntry[] }) {
  const fan = cards.slice(0, 5);
  return (
    <Stack gap={4} align="center">
      <div style={{ position: 'relative', height: 230, width: 540 }} aria-hidden>
        {fan.map((card, i) => {
          const mid = (fan.length - 1) / 2;
          const off = i - mid;
          return (
            <div
              key={card.id}
              style={{
                position: 'absolute',
                width: MASTHEAD_CARD,
                left: `calc(50% - 70px + ${off * 90 + (JITTER_LEFT[i] ?? 0)}px)`,
                top: 28 + Math.abs(off) * 16 + (JITTER_TOP[i] ?? 0),
                transform: `rotate(${off * 8 + (JITTER_ROT[i] ?? 0)}deg)`,
                transformOrigin: '50% 130%',
              }}
            >
              <AssetFace type={card.type} data={card.data} name={card.name} />
            </div>
          );
        })}
      </div>
    </Stack>
  );
}

/*
 * The piles below share one shape: every face sits in the same grid cell, so the pile's height is one
 * face's height and no one computes it. The spread is a `transform`, which takes no part in layout, and
 * the padding is the room those transforms need to lean into.
 *
 * They used to be absolutely positioned inside a box whose height was `faceWidth * ratio`, which is why
 * the page measured its own grid track: that arithmetic needed a pixel width, and the track's width is a
 * CSS answer that only a `ResizeObserver` could read back into JavaScript. Nothing needs it now, so the
 * piles are drawn on first paint rather than after a measurement lands.
 */
const PILE_CELL = { gridArea: '1 / 1' } as const;

/** a slightly fanned pile of real faces for card-type piles; every face keeps the placeholder's width */
function MiniFan({ entries }: { entries: AssetListEntry[] }) {
  const spread = (entries.length - 1) * FAN_OVERLAP;
  const mid = (entries.length - 1) / 2;
  return (
    <div style={{ display: 'grid', width: '100%', padding: '8px 0' }}>
      {entries.map((entry, i) => (
        <div
          key={entry.id}
          style={{
            ...PILE_CELL,
            /* The track can shrink below the spread on a stacked row, so the face floors at 1px rather than going negative. */
            width: `max(1px, calc(100% - ${spread}px))`,
            transformOrigin: '50% 120%',
            transform: `translate(${i * FAN_OVERLAP}px, ${Math.abs(i - mid) * 3}px) rotate(${(i - mid) * 4 + (JITTER_ROT[i % JITTER_ROT.length] ?? 0)}deg)`,
          }}
        >
          <AssetFace type={entry.type} data={entry.data} name={entry.name} />
        </div>
      ))}
    </div>
  );
}

/** a squared-up pile for decks; the newest deck's cardback on top */
function DeckPile({ entries }: { entries: AssetListEntry[] }) {
  const top = entries[0] as AssetListEntry;
  return (
    <div style={{ display: 'grid', width: '100%', paddingBottom: 10 }}>
      {[2, 1, 0].map((n) => (
        <div
          key={n}
          style={{ ...PILE_CELL, width: 'max(1px, calc(100% - 6px))', transform: `translate(${n * 2}px, ${n * 4}px)` }}
        >
          <AssetFace type={top.type} data={top.data} name={top.name} />
        </div>
      ))}
    </div>
  );
}

/** The height a token pile's box reserves, and the width a square-shaped token draws at. */
const TOKEN_PILE_FACE = 96;

/** different tokens dropped into a loose stack */
const STACK_PLACEMENTS = [
  { top: 42, left: -3, rot: -5 },
  { top: 28, left: 8, rot: 8 },
  { top: 14, left: -5, rot: -6 },
  { top: 0, left: 3, rot: 3 },
];

function TokenStack({ entries, fill }: { entries: AssetListEntry[]; fill: boolean }) {
  const shown = entries.slice(0, 4);
  const placements = STACK_PLACEMENTS.slice(STACK_PLACEMENTS.length - shown.length);
  const type = shown[0]?.type ?? '';
  /*
   * A bundle is a box and a box sits flat, so its pile takes the offsets and drops the tilt.
   * The other token shapes are counters, and a leaning counter is what makes a pile read as a pile.
   */
  const straight = type === 'bundle';
  /*
   * Every token pile reserves the same box and centres its face in it, so the row shares one
   * centreline whatever each face's proportions are.
   *
   * It used to size the box from the pile's own width, which is not a shared number: a disc draws at
   * `TOKEN_PILE_FACE` and an enhance token draws to its grid slot. Bottom-aligned boxes of different
   * heights then put every face on a different line, worst for the widest and shortest one
   * (Norbert, 2026-08-20).
   *
   * The centring is the band's own layout now rather than an offset computed from the face's height,
   * which is the reason this component no longer needs to know how tall its faces are.
   */
  const boxHeight = TOKEN_PILE_FACE + (placements[0]?.top ?? 0) + 6;
  return (
    <div style={{ position: 'relative', width: fill ? '100%' : TOKEN_PILE_FACE + 26, height: boxHeight }}>
      {shown.map((entry, i) => {
        const placement = placements[i] ?? { top: 0, left: 0, rot: 0 };
        return (
          <div
            key={entry.id}
            style={{
              position: 'absolute',
              top: placement.top,
              left: 6 + placement.left,
              width: fill ? 'max(1px, calc(100% - 26px))' : TOKEN_PILE_FACE,
              height: TOKEN_PILE_FACE,
              display: 'grid',
              /*
               * `alignItems`, which centres the face inside its row, and not `alignContent`, which centres
               * the row inside this box and does nothing when the two are the same size.
               * They part company for the one face that outgrows the band: a token frame carries
               * `overflow: hidden`, which zeroes its automatic minimum size, so the auto row stops growing
               * at this box's own height instead of reaching the face's. An enhance token past a 181px
               * track then started at the row's top edge rather than straddling it, 5.94px low at a 200px
               * track, which is the shared centreline this box exists to hold.
               */
              alignItems: 'center',
              transform: straight ? undefined : `rotate(${placement.rot}deg)`,
            }}
          >
            <AssetFace type={entry.type} data={entry.data} name={entry.name} />
          </div>
        );
      })}
    </div>
  );
}

/** every outline wears the physical shape of the thing it reserves; width-filling shapes stretch to their grid slot */
function emptyOutlineShape(
  type: AssetType
): { width: number | string; borderRadius: number | string } & ({ height: number } | { aspectRatio: string }) {
  /* Every ratio below is read from `assetFaceAspect`, the same function the face itself holds its height from: an outline and the pile that replaces it are the same shape or the row jumps when the first asset of a type lands. The literal here was once 110/68, close to the enhance token's ratio but not equal, and drifting apart was only a matter of time. */
  switch (type) {
    case 'token-disc':
    case 'token-tech':
      return { width: TOKEN_PILE_FACE, height: TOKEN_PILE_FACE * assetFaceAspect(type), borderRadius: '50%' };
    case 'token-plate':
      return { width: TOKEN_PILE_FACE, height: TOKEN_PILE_FACE * assetFaceAspect(type), borderRadius: 8 };
    case 'token-enhance':
      return { width: '100%', aspectRatio: `1 / ${assetFaceAspect(type)}`, borderRadius: 8 };
    case 'board':
      /* The one shape with no ratio to read: a board is planned, so nothing renders one and `assetFaceAspect` has no answer of its own for it yet. */
      return { width: '100%', aspectRatio: '3 / 2', borderRadius: 8 };
    default:
      /* cards and decks: the card's own proportions */
      return { width: '100%', aspectRatio: `1 / ${assetFaceAspect(type)}`, borderRadius: 6 };
  }
}

function EmptyPileOutline({ type, planned }: { type: AssetType; planned: boolean }) {
  return (
    <div
      style={{
        ...emptyOutlineShape(type),
        border: '2px dashed var(--mantine-color-dimmed)',
        display: 'grid',
        placeItems: 'center',
        opacity: 0.7,
      }}
    >
      {planned ? (
        <Badge size="xs" variant="outline" color="gray">
          Planned
        </Badge>
      ) : (
        <Text size="xs" c="dimmed" ta="center" px={6}>
          none yet
        </Text>
      )}
    </div>
  );
}

function TypePile({ type, entries }: { type: AssetType; entries: AssetListEntry[] }) {
  const definition = ASSET_TYPES[type];
  const planned = definition.status === 'planned';
  const isCardish = type.startsWith('card-') || type === 'deck';
  const art =
    planned || entries.length === 0 ? (
      <EmptyPileOutline type={type} planned={planned} />
    ) : type === 'deck' ? (
      <DeckPile entries={entries} />
    ) : isCardish ? (
      <MiniFan entries={entries.slice(0, FAN_COUNT)} />
    ) : (
      /* An enhance token is wide and short, so its pile takes the track; the rest draw at the shared pile size. */
      <TokenStack entries={entries} fill={type === 'token-enhance'} />
    );

  const body = (
    <Stack gap={8} align="center">
      <div className={styles.pileArt}>{art}</div>
      {/* The pile is its art and its name; the count it once wore said nothing the grid behind the link does not (Norbert, 2026-08-21). */}
      <Text fw={700} c={planned ? 'dimmed' : undefined}>
        {definition.shortLabel}
      </Text>
    </Stack>
  );

  if (planned) {
    return body;
  }
  return (
    <UnstyledButton
      renderRoot={(rootProps) => (
        <Link {...rootProps} to="/assets/$type" params={{ type }} aria-label={`Browse ${definition.label}`} />
      )}
    >
      {body}
    </UnstyledButton>
  );
}

function AssetsLandingPage() {
  const loaderData = Route.useLoaderData();
  const catalogue = useAssetCataloguePage({ initialData: loaderData });
  const data = catalogue.data ?? loaderData;

  const byType = new Map<string, AssetListEntry[]>();
  for (const entry of data.recent) {
    const list = byType.get(entry.type) ?? [];
    list.push(entry);
    byType.set(entry.type, list);
  }
  const fanCards = byType.get('card-treachery') ?? [];

  return (
    <PageLayout>
      {fanCards.length > 0 ? (
        <PageLayout.Header>
          <MastheadFan cards={fanCards} />
        </PageLayout.Header>
      ) : null}
      <PageLayout.Content>
        {/* No width cap: the ledger spans the content column, so its edges align with the masthead band. */}
        <Stack gap="md">
          <Stack gap={2} align="center">
            <Eyebrow>Community assets</Eyebrow>
            <Title order={1}>Assets</Title>
            <Text c="dimmed" ta="center">
              Cards, decks, tokens and boards, made by the community.
            </Text>
          </Stack>
          <SectionedSurface>
            {PILE_GROUPS.map((group) => (
              <SectionedSurface.Row key={group.label}>
                <div className={styles.pileGroup} style={pileGroupStyle}>
                  <div className={styles.pileGroupLayout}>
                    <Stack gap={2} className={styles.pileGroupLabel}>
                      <Eyebrow>{group.label}</Eyebrow>
                    </Stack>
                    <div className={styles.pileGrid}>
                      {group.types.map((type) => (
                        <TypePile key={type} type={type} entries={byType.get(type) ?? []} />
                      ))}
                    </div>
                  </div>
                </div>
              </SectionedSurface.Row>
            ))}
          </SectionedSurface>
        </Stack>
      </PageLayout.Content>
    </PageLayout>
  );
}
