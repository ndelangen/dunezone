import { alliesOf } from '@shared/play/alliances';
import { snapshotFactionLabels } from '@shared/play/factionLabels';
import { TopicIcon } from '@ui/content/TopicIcon';
import type { ReactNode } from 'react';

import type { TableProjection } from '../../../../../db/tabletop/TableSession';
import { showsAlliances } from '../../multiplayer/Alliances';
import { factionToken, FactionTokenGroup } from '../../multiplayer/FactionTokenFace';
import type { FactionToken } from '../../multiplayer/FactionTokenFace';
import { seatFaction, viewerFaction } from '../../multiplayer/tableFactions';
import { AllianceRowAction } from '../alliances/AllianceRowAction';
import { allianceStatus } from '../alliances/alliances';
import type { AllianceCommandKind } from '../alliances/alliances';
import { viewerRelation } from '../alliances/useAlliancesPanel';

/** A seat's alliance as the Faction info shows it: the faction's allies as tokens, how it stands with the viewer, and the one action that fits. */
export type SeatAlliance = Readonly<{ mark: ReactNode; status: string; action: ReactNode }>;

/** The seat's alliance, or null outside play and for a seat without a faction. */
export function seatAlliance(
  table: TableProjection,
  seat: string,
  onAction: (factionId: string, kind: AllianceCommandKind) => void
): SeatAlliance | null {
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
        onAction={(kind) => onAction(factionId, kind)}
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
