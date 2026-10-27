import { Group, Stack, Text } from '@mantine/core';
import { Section } from '@ui/block/Section';

import { allianceRingStyle } from '../../multiplayer/allianceColors';
import { FactionTokenFace, FactionTokenGroup } from '../../multiplayer/FactionTokenFace';
import type { FactionToken } from '../../multiplayer/FactionTokenFace';
import { ALLIANCES_HELP } from '../../multiplayer/panelGuidance';
import { AllianceRowAction } from './AllianceRowAction';
import type { AllianceCommandKind, Relation } from './alliances';

/** One faction at the table: its token, its player, its allies and how it stands with the viewer. */
export type AllianceRow = Readonly<{
  token: FactionToken;
  /** The seat's player, or null for an open seat. */
  player: string | null;
  allies: readonly FactionToken[];
  status: string;
  /** How the viewer stands with this faction, or null when the viewer has nothing to do about it. */
  relation: Relation | null;
}>;

export type AlliancesPanelProps = Readonly<{
  rows: readonly AllianceRow[];
  /** The actions are greyed out while the viewer may not act, such as while reconnecting. */
  disabled: boolean;
  onAction: (factionId: string, kind: AllianceCommandKind) => void;
}>;

/**
 * The Alliances window: every faction at the table in seat order, its alliance, and what the viewer can do about it.
 * Like trading seats during setup, each row carries the one action that fits, so offers start here.
 */
export function AlliancesPanel({ rows, disabled, onAction }: AlliancesPanelProps) {
  return (
    <Section hiddenHeading title="Alliances" description={ALLIANCES_HELP}>
      <Stack gap="xs">
        {rows.map((row) => (
          <Group key={row.token.id} justify="space-between" gap="sm" wrap="nowrap">
            <Group gap="sm" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
              <span
                style={{
                  display: 'inline-flex',
                  flexShrink: 0,
                  ...allianceRingStyle(row.allies.flatMap((ally) => (ally.color ? [ally.color] : []))),
                }}
              >
                <FactionTokenFace token={row.token} size={32} />
              </span>
              <Stack gap={0} style={{ minWidth: 0 }}>
                <Text size="sm" fw={700} truncate>
                  {row.token.name}
                  {row.player ? ` · ${row.player}` : ' · Open seat'}
                </Text>
                <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
                  {row.allies.length > 0 && <FactionTokenGroup tokens={row.allies} size={18} />}
                  <Text size="xs" c="dimmed" truncate>
                    {row.status}
                  </Text>
                </Group>
              </Stack>
            </Group>
            <div style={{ flexShrink: 0 }}>
              {row.relation && (
                <AllianceRowAction
                  relation={row.relation}
                  disabled={disabled}
                  onAction={(kind) => onAction(row.token.id, kind)}
                />
              )}
            </div>
          </Group>
        ))}
      </Stack>
    </Section>
  );
}
