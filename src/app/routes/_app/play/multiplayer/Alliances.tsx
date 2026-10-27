import { Group, Tooltip } from '@mantine/core';
import { alliesOf } from '@shared/play/alliances';
import { snapshotFactionLabels } from '@shared/play/factionLabels';
import { playUiColors, withAlpha } from '@shared/uiPalette';
import { TopicIcon } from '@ui/content/TopicIcon';
import type { ReactNode } from 'react';

import type { TableProjection, TableSession } from '../../../../db/tabletop/TableSession';
import { AllianceRowAction } from '../panels/alliances/AllianceRowAction';
import { allianceStatus, factionList } from '../panels/alliances/alliances';
import { sendAllianceAction, viewerRelation } from '../panels/alliances/useAlliancesPanel';
import { factionToken, FactionTokenFace, FactionTokenGroup } from './FactionTokenFace';
import type { FactionToken } from './FactionTokenFace';
import { seatFaction, viewerFaction } from './tableFactions';

/** Alliances show while the game is in play and, read-only, once it is finished, so everyone still sees who was allied at the end. */
export function showsAlliances(stage: string | undefined) {
  return stage === 'play' || stage === 'finished';
}

/** A seat's alliance as the Faction info shows it: the faction's allies as tokens, how it stands with the viewer, and the one action that fits. */
export type SeatAlliance = Readonly<{ mark: ReactNode; status: string; action: ReactNode }>;

/** The seat's alliance, or null outside play and for a seat without a faction. */
export function seatAlliance(client: TableSession, table: TableProjection, seat: string): SeatAlliance | null {
  const factionId = seatFaction(table, seat);
  if (!factionId || !showsAlliances(table.snapshot.stage)) {
    return null;
  }
  const names = snapshotFactionLabels(table.snapshot);
  const allies = alliesOf(table.snapshot.alliances, factionId).map((id) => factionToken(table, id, names));
  const relation = viewerRelation(table, factionId);
  return {
    mark: <AllianceMark allies={allies} />,
    status: allianceStatus(table.snapshot.alliances, factionId, viewerFaction(table), names),
    action: relation && (
      <AllianceRowAction
        relation={relation}
        disabled={!table.canInteract}
        onAction={(kind) => sendAllianceAction(client, table, factionId, kind)}
      />
    ),
  };
}

/* The faction's allies as their tokens, or the alliance mark while it has none. */
function AllianceMark({ allies, size = 22 }: Readonly<{ allies: readonly FactionToken[]; size?: number }>) {
  if (allies.length) {
    return <FactionTokenGroup tokens={allies} size={size} />;
  }
  return (
    <span
      style={{
        display: 'inline-flex',
        borderRadius: '50%',
        background: 'var(--color-ground)',
        color: 'var(--color-muted)',
      }}
    >
      <TopicIcon topic="alliance" size={size - 4} />
    </span>
  );
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
