import { alliesOf } from '@shared/play/alliances';
import { snapshotFactionLabels } from '@shared/play/factionLabels';

import type { TableProjection, TableSession } from '../../../../../db/tabletop/TableSession';
import { factionToken } from '../../multiplayer/FactionTokenFace';
import { viewerFaction } from '../../multiplayer/tableFactions';
import { allianceAction, allianceStatus, relationTo } from './alliances';
import type { AllianceCommandKind, Relation } from './alliances';
import { AlliancesPanel } from './AlliancesPanel';
import type { AllianceRow, AlliancesPanelProps } from './AlliancesPanel';

type Props = Readonly<{ client: TableSession; table: TableProjection }>;

/** How the viewer stands with a faction, while the game is in play and the viewer holds a faction; alliances change only then. */
export function viewerRelation(table: TableProjection, factionId: string): Relation | null {
  const own = viewerFaction(table);
  return own && table.snapshot.stage === 'play' ? relationTo(table.snapshot.alliances, own, factionId) : null;
}

/** Sends the viewer's alliance action about a faction, naming the offer or ally the viewer saw. */
export function sendAllianceAction(
  client: TableSession,
  table: TableProjection,
  factionId: string,
  kind: AllianceCommandKind
) {
  const own = viewerFaction(table);
  const action = own && allianceAction(table.snapshot.alliances, kind, own, factionId);
  if (action) {
    client.command(action);
  }
}

/** The Alliances window's rows from the table: each seated faction in seat order. */
export function allianceRows(table: TableProjection): AllianceRow[] {
  const { snapshot } = table;
  const names = snapshotFactionLabels(snapshot);
  const own = viewerFaction(table);
  const players = snapshot.controls?.players ?? [];
  return (
    snapshot.roster?.seats.flatMap((seat) =>
      seat.faction
        ? [
            {
              token: factionToken(table, seat.faction.id, names),
              player: players.find((entry) => entry.seat === seat.id)?.name ?? null,
              allies: alliesOf(snapshot.alliances, seat.faction.id).map((id) => factionToken(table, id, names)),
              status: allianceStatus(snapshot.alliances, seat.faction.id, own, names),
              relation: viewerRelation(table, seat.faction.id),
            },
          ]
        : []
    ) ?? []
  );
}

/** The Alliances window from the table: its rows, and each row's action sent as the command it stands for. */
function useAlliancesPanel({ client, table }: Props): AlliancesPanelProps {
  return {
    rows: allianceRows(table),
    disabled: !table.canInteract,
    onAction: (factionId, kind) => sendAllianceAction(client, table, factionId, kind),
  };
}

/** The Alliances window's content at a live table. */
export function ConnectedAlliancesPanel(props: Props) {
  return <AlliancesPanel {...useAlliancesPanel(props)} />;
}
