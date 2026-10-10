import { AllianceRefusal, applyAlliance, emptyAlliances } from '../../src/shared/play/alliances';
import type { AllianceAction } from '../../src/shared/play/alliances';
import { nextSnapshot } from '../../src/shared/play/commands';
import { tableForViewer } from '../../src/shared/play/protocol';
import { GameRejection } from '../../src/shared/play/rejection';
import { SPECTATOR_SEAT } from '../../src/shared/play/schema';
import type { StoredSnapshot } from './state';

/** Room supplies the acting faction; alliances form and break only while the game is in play. */
export function allianceCommand(
  snapshot: StoredSnapshot,
  factionId: string,
  action: AllianceAction,
  now: number
): StoredSnapshot {
  if (snapshot.stage !== 'play') {
    throw new GameRejection('Alliances form only while the game is in play.');
  }
  const before = snapshot.alliances ?? emptyAlliances();
  const factions = snapshot.roster?.seats.flatMap(({ faction }) => (faction ? [faction.id] : [])) ?? [];
  try {
    const alliances = applyAlliance(before, action, { factionId, factions, now });
    if (alliances === before) {
      return snapshot;
    }
    return { ...nextSnapshot(snapshot, tableForViewer(snapshot, SPECTATOR_SEAT)), alliances };
  } catch (error) {
    if (error instanceof AllianceRefusal) {
      throw new GameRejection(error.message);
    }
    throw error;
  }
}
