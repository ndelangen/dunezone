import { tableHandlingOpen } from '../admission';
import { accepted, nextSnapshot } from '../commands';
import { tableForViewer } from '../protocol';
import { GameRejection } from '../rejection';
import { SPECTATOR_SEAT } from '../schema';
import { applyTerritoryTint } from '../territoryTints';
import type { TerritoryTintAction } from '../territoryTints';
import type { StoredSnapshot } from './state';

/** Any seated faction may lay tints over territories while the map is on the table; tints are a sandbox, so no rule checks what they mark. */
export function territoryTintCommand(snapshot: StoredSnapshot, action: TerritoryTintAction): StoredSnapshot {
  if (!tableHandlingOpen(snapshot.stage)) {
    throw new GameRejection('Territories can be tinted only while the game is on the table.');
  }
  const { tints, message } = applyTerritoryTint(snapshot.tints ?? [], action);
  const table = accepted(tableForViewer(snapshot, SPECTATOR_SEAT), action.kind, message);
  return { ...nextSnapshot(snapshot, table), tints };
}
