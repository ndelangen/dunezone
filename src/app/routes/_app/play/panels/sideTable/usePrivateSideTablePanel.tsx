import { factionTokenOf } from '@shared/play/factionToken';
import type { TablePiece, Vector3Tuple } from '@shared/play/model';
import { PLAYER_RING_RADIUS } from '@shared/play/tableSettings';

import type { TableProjection, TableSession } from '../../../../../db/tabletop/TableSession';
import { viewerFaction } from '../../multiplayer/tableFactions';
import { PrivateSideTablePanel } from './PrivateSideTablePanel';

type Props = Readonly<{ client: TableSession; table: TableProjection; hand: TablePiece[] }>;

/* How far along the seats' ring from its faction token a piece placed on the table lands; the table moves it on to a clear spot. */
const BESIDE_TOKEN = 0.7;

/* Where "Place on table" plays a piece: beside the viewer's faction token, in front of its seat, or at the near edge of a table without one. */
function besideOwnToken(table: TableProjection): Vector3Tuple {
  const faction = viewerFaction(table);
  const token = faction ? factionTokenOf(table.snapshot.table.pieces, faction) : undefined;
  const angle = token
    ? Math.atan2(token.position[2], token.position[0]) + BESIDE_TOKEN / PLAYER_RING_RADIUS
    : Math.PI / 2;
  return [Math.cos(angle) * PLAYER_RING_RADIUS, 0, Math.sin(angle) * PLAYER_RING_RADIUS];
}
/** The Private side-table window's content at a live table: the viewer's hand, and the commands that lay, return and play its pieces. */
export function ConnectedPrivateSideTablePanel({ client, table, hand }: Props) {
  return (
    <PrivateSideTablePanel
      hand={hand}
      enabled={table.canHandleTable}
      onLay={(pieceId, at) => client.command({ kind: 'hand-zone', pieceId, at })}
      awaiting={(commandId) => client.awaiting(commandId)}
      onPlace={(pieceId) => client.command({ kind: 'hand-play', pieceId, position: besideOwnToken(table) })}
    />
  );
}
