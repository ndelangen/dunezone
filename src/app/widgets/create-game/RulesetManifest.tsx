import { Anchor, Group, Stack, Text } from '@mantine/core';
import { tokenShapeOfType } from '@shared/assets/tokenOutline';
import type { RulesetAssetSlot } from '@shared/rulesets/assetSlots';
import { Eyebrow } from '@ui/content/Eyebrow';
import { TokenImage } from '@ui/content/TokenImage';
import { ChipList } from '@ui/list/ChipList';
import { TallyList } from '@ui/list/TallyList';
import { ExternalLink } from 'lucide-react';
import type { ReactNode } from 'react';

import type { CreatableRulesetPreview } from '@db/play';
import { AssetFace } from '@app/widgets/asset-face/AssetFace';

/* One line per slot, in the words a player reads on the pass rather than the editor's slot names. */
const SLOT_LABELS: Record<RulesetAssetSlot, string> = {
  board: 'Board',
  treachery: 'Treachery deck',
  spice: 'Spice deck',
  techToken: 'Tech tokens',
  custom: 'Custom deck',
  customTokens: 'Custom tokens',
};

type Packed = CreatableRulesetPreview['packed'][number];
type Faction = CreatableRulesetPreview['factions'][number];

/**
 * The chosen ruleset's manifest, printed on the pass: every deck and token set it puts on the table with how many pieces it holds, then its factions, the ones made for it first.
 * It is the pass's own print, ruled off with the same dashed lines as the facts along its foot, never a pane of its own inside the pass.
 * The ruleset page opens in a new tab, so nothing set on the pass is lost.
 */
export function RulesetManifest({
  ruleset,
  preview,
  rulesetLink,
}: Readonly<{
  ruleset: Readonly<{ name: string; slug: string }>;
  preview: CreatableRulesetPreview;
  rulesetLink: (slug: string) => (rootProps: object) => ReactNode;
}>) {
  const own = preview.factions.filter((faction) => faction.own);
  const shared = preview.factions.filter((faction) => !faction.own);
  return (
    <Stack component="section" gap="sm" aria-label={`What ${ruleset.name} puts on the table`}>
      <Group justify="space-between" wrap="nowrap">
        <Eyebrow>Packed for the table</Eyebrow>
        <Anchor size="sm" renderRoot={rulesetLink(ruleset.slug)} target="_blank">
          <Group gap={4} component="span" wrap="nowrap">
            Read the ruleset
            <ExternalLink size={13} aria-label="opens in a new tab" />
          </Group>
        </Anchor>
      </Group>
      {preview.packed.length > 0 ? (
        <TallyList items={preview.packed.map(packedTally)} />
      ) : (
        <Text size="sm" c="dimmed">
          No decks or token sets are linked yet.
        </Text>
      )}
      <Stack gap="sm" pt="xs">
        <Eyebrow>{preview.factions.length === 1 ? '1 faction' : `${preview.factions.length} factions`}</Eyebrow>
        {preview.factions.length === 0 ? (
          <Text size="sm" c="dimmed">
            No factions are linked yet.
          </Text>
        ) : null}
        {own.length > 0 ? (
          <FactionGroup label={<Text size="xs" c="dimmed">{`Made for ${ruleset.name}`}</Text>} factions={own} />
        ) : null}
        {shared.length > 0 ? (
          <FactionGroup
            label={
              own.length > 0 ? (
                <Text size="xs" c="dimmed">
                  Also in other rulesets
                </Text>
              ) : null
            }
            factions={shared}
          />
        ) : null}
      </Stack>
    </Stack>
  );
}

/* A packed deck or token set as the manifest prints it: its face, the pass's word for its slot over its own name, and how many pieces it holds. */
function packedTally(item: Packed, index: number) {
  const deck = item.faceType === 'deck';
  const count = `${item.count}${item.truncated ? '+' : ''}`;
  return {
    key: `${item.slot}-${index}`,
    figure: deck ? (
      <AssetFace type="deck" data={null} name={item.name} href={item.face} />
    ) : (
      <TokenImage src={item.face} name={item.name} shape={tokenShapeOfType(item.faceType) ?? 'round'} />
    ),
    figureShape: deck ? ('card' as const) : ('token' as const),
    title: SLOT_LABELS[item.slot as RulesetAssetSlot] ?? item.name,
    detail: item.name,
    count,
    countLabel: `${count} ${item.faceType === 'board' ? 'board' : deck ? 'cards' : 'tokens'}`,
  };
}

function FactionGroup({ label, factions }: Readonly<{ label: ReactNode; factions: Faction[] }>) {
  return (
    <Stack gap="xs">
      {label ? <div>{label}</div> : null}
      <ChipList
        items={factions.map((faction) => ({
          key: faction.id,
          figure: <TokenImage src={faction.token} name={faction.name} shape="round" />,
          label: faction.name,
        }))}
      />
    </Stack>
  );
}
