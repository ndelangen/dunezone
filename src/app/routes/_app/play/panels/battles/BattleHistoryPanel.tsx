import { Group, Stack, Text } from '@mantine/core';
import { Section } from '@ui/block/Section';

import type { TableProjection } from '../../../../../db/tabletop/TableSession';
import { BattleWheel, OUTCOME_LABELS, rosterName } from '../../multiplayer/BattleControls';
import type { FactionArtwork, FactionNames } from '../../multiplayer/BattleControls';

export type BattleHistoryPanelProps = Readonly<{
  /** The battles both sides agreed on, oldest first, each with its two revealed plans. */
  results: NonNullable<TableProjection['snapshot']['battleResults']>;
  /** Each faction's captured artwork, which dresses its wheel. */
  artwork?: FactionArtwork;
  /** Each faction's name on the roster. */
  names: FactionNames;
}>;

/** Agreed battle results, readable whatever the current battle and phase: where, who, who won, and both revealed wheels. */
export function BattleHistoryPanel({ results, artwork, names }: BattleHistoryPanelProps) {
  return (
    <Section hiddenHeading title="Battle results">
      {results.length ? (
        results.map((result) => (
          <Stack key={result.id} gap="xs">
            <Text>
              {result.territory}: {result.factions.map((id) => rosterName(id, names)).join(' against ')}.{' '}
              {OUTCOME_LABELS[result.outcome]}.
            </Text>
            <Group pt={40}>
              {result.plans.map((plan, side) => (
                <BattleWheel
                  key={side}
                  plan={plan}
                  factionId={result.factions[side]}
                  factionName={rosterName(result.factions[side], names)}
                  artwork={artwork}
                />
              ))}
            </Group>
          </Stack>
        ))
      ) : (
        <Text size="sm">No agreed battle results yet.</Text>
      )}
    </Section>
  );
}
