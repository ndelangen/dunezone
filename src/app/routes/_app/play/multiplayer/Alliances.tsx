import { Group, Tooltip } from '@mantine/core';
import { snapshotFactionLabels } from '@shared/play/factionLabels';
import { playUiColors, withAlpha } from '@shared/uiPalette';

import type { TableProjection } from '../../../../db/tabletop/TableSession';
import { factionList } from '../panels/alliances/alliances';
import { factionToken, FactionTokenFace } from './FactionTokenFace';

/** Alliances show while the game is in play and, read-only, once it is finished, so everyone still sees who was allied at the end. */
export function showsAlliances(stage: string | undefined) {
  return stage === 'play' || stage === 'finished';
}

/**
 * Every alliance at the table as its factions' tokens side by side, beside the logo in the top bar, so it shows in every view.
 * The strip keeps to the space beside the logo and scrolls sideways when the alliances outgrow it, so the top bar never grows and the phase stays clear.
 */
export function AllianceStrip({ table }: Readonly<{ table: TableProjection }>) {
  const groups = table.snapshot.alliances?.groups ?? [];
  if (!groups.length || !showsAlliances(table.snapshot.stage)) {
    return null;
  }
  const names = snapshotFactionLabels(table.snapshot);
  return (
    <Group
      gap="xs"
      wrap="nowrap"
      aria-label="Alliances"
      style={{ flex: '0 1 auto', minWidth: 0, overflowX: 'auto', overflowY: 'hidden', scrollbarWidth: 'thin' }}
    >
      {groups.map(({ members: group }) => {
        const label = `${factionList(names, group)} are allied`;
        return (
          <Tooltip key={group.join(':')} label={label} withinPortal>
            <Group
              gap={0}
              wrap="nowrap"
              role="img"
              aria-label={label}
              style={{
                flexShrink: 0,
                padding: '2px 6px',
                borderRadius: 999,
                background: withAlpha(playUiColors.annotationGold, 0.14),
                border: `1px solid ${withAlpha(playUiColors.annotationGold, 0.55)}`,
              }}
            >
              {group.map((factionId, index) => (
                <FactionTokenFace
                  key={factionId}
                  token={factionToken(table, factionId, names)}
                  size={26}
                  style={{ marginLeft: index ? -6 : 0 }}
                />
              ))}
            </Group>
          </Tooltip>
        );
      })}
    </Group>
  );
}
