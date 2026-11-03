import { alliesOf } from '@shared/play/alliances';
import { snapshotFactionLabels } from '@shared/play/factionLabels';
import type { ReactNode } from 'react';

import type { TableProjection } from '../../../../../db/tabletop/TableSession';
import { showsAlliances } from '../../multiplayer/Alliances';
import { factionToken, FactionTokenGroup } from '../../multiplayer/FactionTokenFace';
import { seatFaction } from '../../multiplayer/tableFactions';
import { AllianceRowAction } from '../alliances/AllianceRowAction';
import type { AllianceCommandKind } from '../alliances/alliances';
import { viewerRelation } from '../alliances/useAlliancesPanel';

/** A seat's alliance as the Faction info toolbar shows it: the faction's allies as tokens, each named on hover, and the one action the viewer has about it. */
export type SeatAlliance = Readonly<{ allies: ReactNode; action: ReactNode }>;

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
    allies: allies.length ? <FactionTokenGroup tokens={allies} size={28} /> : null,
    action: relation && (
      <AllianceRowAction
        relation={relation}
        size="toolbar"
        disabled={!table.canInteract}
        onAction={(kind) => onAction(factionId, kind)}
      />
    ),
  };
}
