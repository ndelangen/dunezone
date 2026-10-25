import { Anchor, Group, Stack, Text } from '@mantine/core';
import { tokenShapeOfType } from '@shared/assets/tokenOutline';
import type { RulesetAssetSlot } from '@shared/rulesets/assetSlots';
import { Link } from '@tanstack/react-router';
import { Eyebrow } from '@ui/content/Eyebrow';
import { TokenImage } from '@ui/content/TokenImage';
import { ExternalLink } from 'lucide-react';
import type { ReactNode } from 'react';

import type { CreatableRuleset, CreatableRulesetPreview } from '@db/play';
import { AssetFace } from '@app/widgets/asset-face/AssetFace';

import styles from './create.module.css';

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
}: Readonly<{ ruleset: CreatableRuleset; preview: CreatableRulesetPreview }>) {
  const own = preview.factions.filter((faction) => faction.own);
  const shared = preview.factions.filter((faction) => !faction.own);
  return (
    <section className={styles.manifest} aria-label={`What ${ruleset.name} puts on the table`}>
      <Group justify="space-between" wrap="nowrap">
        <Eyebrow>Packed for the table</Eyebrow>
        <Anchor
          size="sm"
          renderRoot={(props) => (
            <Link {...props} to="/rulesets/$rulesetSlug" params={{ rulesetSlug: ruleset.slug }} target="_blank" />
          )}
        >
          <Group gap={4} component="span" wrap="nowrap">
            Read the ruleset
            <ExternalLink size={13} aria-label="opens in a new tab" />
          </Group>
        </Anchor>
      </Group>
      {preview.packed.length > 0 ? (
        <ul className={styles.packed}>
          {preview.packed.map((item, index) => (
            <PackedLine key={`${item.slot}-${index}`} item={item} />
          ))}
        </ul>
      ) : (
        <Text size="sm" c="dimmed">
          No decks or token sets are linked yet.
        </Text>
      )}
      <Stack gap="sm" className={styles.manifestFactions}>
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
    </section>
  );
}

function PackedLine({ item }: Readonly<{ item: Packed }>) {
  const label = SLOT_LABELS[item.slot as RulesetAssetSlot] ?? item.name;
  const deck = item.faceType === 'deck';
  const count = `${item.count}${item.truncated ? '+' : ''}`;
  return (
    <li className={styles.packedLine}>
      <span className={styles.packedFace} aria-hidden>
        {deck ? (
          <span className={styles.packedCard}>
            <AssetFace type="deck" data={null} name={item.name} href={item.face} />
          </span>
        ) : (
          <TokenImage src={item.face} name={item.name} shape={tokenShapeOfType(item.faceType) ?? 'round'} />
        )}
      </span>
      <span className={styles.packedWhat}>
        <Text fw={700} size="sm">
          {label}
        </Text>
        <Text size="xs" c="dimmed" lineClamp={1}>
          {item.name}
        </Text>
      </span>
      <span
        className={styles.packedCount}
        aria-label={`${count} ${item.faceType === 'board' ? 'board' : deck ? 'cards' : 'tokens'}`}
      >
        {count}
      </span>
    </li>
  );
}

function FactionGroup({ label, factions }: Readonly<{ label: ReactNode; factions: Faction[] }>) {
  return (
    <Stack gap="xs">
      {label ? <div>{label}</div> : null}
      <ul className={styles.factionRow}>
        {factions.map((faction) => (
          <li key={faction.id}>
            <span className={styles.factionDisc} aria-hidden>
              <TokenImage src={faction.token} name={faction.name} shape="round" />
            </span>
            <Text size="sm">{faction.name}</Text>
          </li>
        ))}
      </ul>
    </Stack>
  );
}
