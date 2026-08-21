import { Badge, Stack, Text, Title, UnstyledButton } from '@mantine/core';
import { ASSET_TYPE_KEYS, ASSET_TYPES } from '@shared/assets/types';
import type { AssetCategory, AssetType } from '@shared/assets/types';
import { Link, createFileRoute } from '@tanstack/react-router';
import { Eyebrow } from '@ui/content/Eyebrow';
import { PageLayout } from '@ui/layout/PageLayout';
import { SectionedSurface } from '@ui/surface/SectionedSurface';
import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';

import { loadAssetCataloguePage, useAssetCataloguePage } from '@app/db/assets';
import type { AssetListEntry } from '@app/db/assets';
import { AssetFace, assetFaceAspect, CARD_ASPECT } from '@app/widgets/asset-face/AssetFace';

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

/* Handed to the stylesheet so the grid tracks and the art cannot drift apart. */
const pileGroupStyle = { '--pile-slot': `${PILE_SLOT}px` } as CSSProperties;

/**
 * The width the pile's art actually has: grid tracks flex below their slot ceiling on narrow rows (see index.module.css), so a fixed pixel width would overflow its own track.
 */
function useSlotWidth() {
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!node) {
      return;
    }
    const observer = new ResizeObserver(([entry]) => setWidth(entry?.contentRect.width ?? 0));
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);
  return { ref: setNode, width };
}

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
                left: `calc(50% - 70px + ${off * 90 + (JITTER_LEFT[i] ?? 0)}px)`,
                top: 28 + Math.abs(off) * 16 + (JITTER_TOP[i] ?? 0),
                transform: `rotate(${off * 8 + (JITTER_ROT[i] ?? 0)}deg)`,
                transformOrigin: '50% 130%',
              }}
            >
              <AssetFace type={card.type} data={card.data} name={card.name} width={138} />
            </div>
          );
        })}
      </div>
    </Stack>
  );
}

/** a slightly fanned pile of real faces — card-type piles; every face keeps the placeholder's width */
function MiniFan({ entries, slot }: { entries: AssetListEntry[]; slot: number }) {
  /* The grid track may shrink below the spread in the stacked state, so the face width floors at 1px rather than going negative. */
  const cardWidth = Math.max(1, slot - (entries.length - 1) * FAN_OVERLAP);
  const mid = (entries.length - 1) / 2;
  return (
    <div style={{ position: 'relative', width: slot, height: cardWidth * CARD_ASPECT + 16 }}>
      {entries.map((entry, i) => (
        <div
          key={entry.id}
          style={{
            position: 'absolute',
            left: i * FAN_OVERLAP,
            top: 8 + Math.abs(i - mid) * 3,
            transform: `rotate(${(i - mid) * 4 + (JITTER_ROT[i % JITTER_ROT.length] ?? 0)}deg)`,
            transformOrigin: '50% 120%',
          }}
        >
          <AssetFace type={entry.type} data={entry.data} name={entry.name} width={cardWidth} />
        </div>
      ))}
    </div>
  );
}

/** a squared-up pile — decks; the newest deck's cardback on top */
function DeckPile({ entries, slot }: { entries: AssetListEntry[]; slot: number }) {
  const top = entries[0] as AssetListEntry;
  const cardWidth = Math.max(1, slot - 6);
  return (
    <div style={{ position: 'relative', width: slot, height: cardWidth * CARD_ASPECT + 10 }}>
      {[2, 1, 0].map((n) => (
        <div key={n} style={{ position: 'absolute', top: n * 4, left: n * 2 }}>
          <AssetFace type={top.type} data={top.data} name={top.name} width={cardWidth} />
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

function TokenStack({ entries, width }: { entries: AssetListEntry[]; width: number }) {
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
   */
  const faceHeight = width * assetFaceAspect(type);
  const boxHeight = TOKEN_PILE_FACE + (placements[0]?.top ?? 0) + 6;
  const centring = (TOKEN_PILE_FACE - faceHeight) / 2;
  return (
    <div style={{ position: 'relative', width: width + 26, height: boxHeight }}>
      {shown.map((entry, i) => {
        const placement = placements[i] ?? { top: 0, left: 0, rot: 0 };
        return (
          <div
            key={entry.id}
            style={{
              position: 'absolute',
              top: placement.top + centring,
              left: 6 + placement.left,
              transform: straight ? undefined : `rotate(${placement.rot}deg)`,
            }}
          >
            <AssetFace type={entry.type} data={entry.data} name={entry.name} width={width} />
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
  switch (type) {
    case 'token-disc':
    case 'token-tech':
      return { width: 96, height: 96, borderRadius: '50%' };
    case 'token-plate':
      return { width: 96, height: 96, borderRadius: 8 };
    case 'token-enhance':
      /* `assetFaceAspect` owns this ratio; the literal here was 110/68, which is close to it but not equal, and drifting apart was only a matter of time. */
      return { width: '100%', aspectRatio: `1 / ${assetFaceAspect('token-enhance')}`, borderRadius: 8 };
    case 'board':
      return { width: '100%', aspectRatio: '3 / 2', borderRadius: 8 };
    default:
      /* cards and decks: the card's own proportions */
      return { width: '100%', aspectRatio: `1 / ${CARD_ASPECT}`, borderRadius: 6 };
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
  const slot = useSlotWidth();
  /* The track is the ceiling, so the art fills whatever width it was given. */
  const drawnAt = slot.width;
  const art =
    planned || entries.length === 0 ? (
      <EmptyPileOutline type={type} planned={planned} />
    ) : drawnAt === 0 ? null : type === 'deck' ? (
      <DeckPile entries={entries} slot={drawnAt} />
    ) : isCardish ? (
      <MiniFan entries={entries.slice(0, FAN_COUNT)} slot={drawnAt} />
    ) : (
      <TokenStack entries={entries} width={type === 'token-enhance' ? Math.max(1, drawnAt - 26) : TOKEN_PILE_FACE} />
    );

  const body = (
    <Stack gap={8} align="center">
      <div ref={slot.ref} className={styles.pileArt}>
        {art}
      </div>
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
