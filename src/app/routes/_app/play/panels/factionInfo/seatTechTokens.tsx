import type { TableProjection } from '../../../../../db/tabletop/TableSession';
import { seatFaction } from '../../multiplayer/tableFactions';
import { heldTechTokenPieces } from './heldTechTokenPiece';
import { HeldTechTokens } from './HeldTechTokens';

/** The tech tokens the seat's faction holds, at the allies' size in the Faction info toolbar, or null while it holds none. */
export function seatTechTokens(table: TableProjection, seat: string) {
  const factionId = seatFaction(table, seat);
  const held = factionId ? (table.snapshot.techTokens?.[factionId] ?? []) : [];
  if (!factionId || !held.length) {
    return null;
  }
  return <HeldTechTokens tokens={heldTechTokenPieces(held, factionId)} />;
}
