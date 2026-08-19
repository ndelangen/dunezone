import { Badge, Group, Stack, Text, Title, UnstyledButton } from '@mantine/core';
import { ASSET_TYPES, categoryOfType } from '@shared/assets/types';
import type { AssetType } from '@shared/assets/types';
import { Link, createFileRoute } from '@tanstack/react-router';
import { Eyebrow } from '@ui/content/Eyebrow';
import { PageLayout } from '@ui/layout/PageLayout';
import { SectionedSurface } from '@ui/surface/SectionedSurface';

import { loadAssetCataloguePage, useAssetCataloguePage } from '@app/db/assets';
import type { AssetListEntry } from '@app/db/assets';

import { AssetFace, CARD_ASPECT } from './-assetFaces';

export const Route = createFileRoute('/_app/assets/')({
  loader: loadAssetCataloguePage,
  component: AssetsLandingPage,
});

/** deterministic jitter so fans read hand-held, not machine-dealt */
const JITTER_ROT = [2.5, -1.8, 0.8, -2.6, 3.2];
const JITTER_TOP = [5, -4, 2, 6, -3];
const JITTER_LEFT = [3, -4, 2, -3, 4];

/** the ledger's three rows: each names the Asset types whose piles it holds */
const PILE_GROUPS: { label: string; types: AssetType[] }[] = [
  {
    label: 'Cards & decks',
    types: [
      'card-treachery',
      'card-spice',
      'card-custom',
      'card-leaderability',
      'card-storm',
      'card-stronghold',
      'card-nexus',
      'deck',
    ],
  },
  { label: 'Tokens', types: ['token-round', 'token-gear', 'token-square', 'token-rectangle'] },
  { label: 'Boards', types: ['board'] },
];

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

/** a small overlapping fan of real faces — card-type piles */
function MiniFan({ entries, width }: { entries: AssetListEntry[]; width: number }) {
  const mid = (entries.length - 1) / 2;
  return (
    <div style={{ position: 'relative', width: width + entries.length * 26, height: width * 1.4 + 16 }}>
      {entries.map((entry, i) => (
        <div
          key={entry.id}
          style={{
            position: 'absolute',
            left: i * 26,
            top: 8 + Math.abs(i - mid) * 4,
            transform: `rotate(${(i - mid) * 6 + (JITTER_ROT[i % JITTER_ROT.length] ?? 0)}deg)`,
            transformOrigin: '50% 120%',
          }}
        >
          <AssetFace type={entry.type} data={entry.data} name={entry.name} width={width} />
        </div>
      ))}
    </div>
  );
}

/** a squared-up pile — decks; the newest deck's cardback on top */
function DeckPile({ entries, width }: { entries: AssetListEntry[]; width: number }) {
  const top = entries[0] as AssetListEntry;
  return (
    <div style={{ position: 'relative', width: width + 6, height: width * CARD_ASPECT + 10 }}>
      {[2, 1, 0].map((n) => (
        <div key={n} style={{ position: 'absolute', top: n * 4, left: n * 2 }}>
          <AssetFace type={top.type} data={top.data} name={top.name} width={width} />
        </div>
      ))}
    </div>
  );
}

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
  return (
    <div style={{ position: 'relative', width: width + 26, height: width + (placements[0]?.top ?? 0) + 6 }}>
      {shown.map((entry, i) => {
        const placement = placements[i] ?? { top: 0, left: 0, rot: 0 };
        return (
          <div
            key={entry.id}
            style={{
              position: 'absolute',
              top: placement.top,
              left: 6 + placement.left,
              transform: `rotate(${placement.rot}deg)`,
            }}
          >
            <AssetFace type={entry.type} data={entry.data} name={entry.name} width={width} />
          </div>
        );
      })}
    </div>
  );
}

function EmptyPileOutline({ label, planned }: { label: string; planned: boolean }) {
  return (
    <div
      style={{
        width: planned ? 150 : 110,
        height: planned ? 100 : 150,
        border: '2px dashed var(--mantine-color-dimmed)',
        borderRadius: 8,
        display: 'grid',
        placeItems: 'center',
        opacity: 0.7,
      }}
    >
      <Text size="xs" c="dimmed" ta="center" px={6}>
        {planned ? `reserved for ${label.toLowerCase()}` : 'none yet'}
      </Text>
    </div>
  );
}

function TypePile({ type, entries }: { type: AssetType; entries: AssetListEntry[] }) {
  const definition = ASSET_TYPES[type];
  const planned = definition.status === 'planned';
  const isCardish = type.startsWith('card-') || type === 'deck';
  const art =
    planned || entries.length === 0 ? (
      <EmptyPileOutline label={definition.label} planned={planned} />
    ) : type === 'deck' ? (
      <DeckPile entries={entries} width={110} />
    ) : isCardish ? (
      <MiniFan entries={entries.slice(0, 4)} width={104} />
    ) : (
      <TokenStack entries={entries} width={type === 'token-rectangle' ? 104 : 84} />
    );

  const body = (
    <Stack gap={8} align="center">
      {art}
      <Group gap={6}>
        <Text fw={700} c={planned ? 'dimmed' : undefined}>
          {definition.label}
        </Text>
        {planned ? (
          <Badge size="xs" variant="outline" color="gray">
            Planned
          </Badge>
        ) : (
          <Text c="dimmed">{entries.length}</Text>
        )}
      </Group>
    </Stack>
  );

  if (planned) {
    return body;
  }
  const category = categoryOfType(type) ?? 'cards';
  return (
    <UnstyledButton
      renderRoot={(rootProps) => (
        <Link {...rootProps} to="/assets/$category" params={{ category }} aria-label={`Browse ${definition.label}`} />
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
        <Stack gap="md" style={{ width: 'min(100%, 64rem)', margin: '0 auto' }}>
          <Stack gap={2} align="center">
            <Eyebrow>Community assets</Eyebrow>
            <Title order={1}>Assets</Title>
            <Text c="dimmed" ta="center">
              Cards, decks, tokens and boards, made by the community.
            </Text>
          </Stack>
          <SectionedSurface>
            {PILE_GROUPS.map((group) => {
              const total = group.types.reduce((n, type) => n + (data.countsByType[type] ?? 0), 0);
              const allPlanned = group.types.every((type) => ASSET_TYPES[type].status === 'planned');
              return (
                <SectionedSurface.Row key={group.label}>
                  <Group gap="xl" align="center" wrap="nowrap">
                    <Stack gap={2} style={{ width: 150, flexShrink: 0 }}>
                      <Eyebrow>{group.label}</Eyebrow>
                      <Text size="sm" c="dimmed">
                        {allPlanned ? 'planned' : `${total} asset${total === 1 ? '' : 's'}`}
                      </Text>
                    </Stack>
                    <Group gap={40} align="flex-end" style={{ flex: 1 }} justify="flex-start">
                      {group.types.map((type) => (
                        <TypePile key={type} type={type} entries={byType.get(type) ?? []} />
                      ))}
                    </Group>
                  </Group>
                </SectionedSurface.Row>
              );
            })}
          </SectionedSurface>
        </Stack>
      </PageLayout.Content>
    </PageLayout>
  );
}
