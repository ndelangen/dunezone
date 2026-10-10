import { AllianceRefusal, applyAlliance, emptyAlliances } from '../../src/shared/play/alliances';
import type { AllianceAction, AllianceState } from '../../src/shared/play/alliances';
import { nextSnapshot } from '../../src/shared/play/commands';
import { tableForViewer } from '../../src/shared/play/protocol';
import { GameRejection } from '../../src/shared/play/rejection';
import { SPECTATOR_SEAT } from '../../src/shared/play/schema';
import type { StoredSnapshot } from './state';

function seatedFactions(snapshot: StoredSnapshot): string[] {
  return snapshot.roster?.seats.flatMap(({ faction }) => (faction ? [faction.id] : [])) ?? [];
}

/* The shared rules turn an alliance command away with an AllianceRefusal; the table reports it like any other rejection. */
function nextAlliances(snapshot: StoredSnapshot, factionId: string, action: AllianceAction, now: number) {
  try {
    return applyAlliance(snapshot.alliances ?? emptyAlliances(), action, {
      factionId,
      factions: seatedFactions(snapshot),
      now,
    });
  } catch (error) {
    throw error instanceof AllianceRefusal ? new GameRejection(error.message) : error;
  }
}

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
  const alliances: AllianceState = nextAlliances(snapshot, factionId, action, now);
  if (alliances === snapshot.alliances || (!snapshot.alliances && unchanged(alliances))) {
    return snapshot;
  }
  return { ...nextSnapshot(snapshot, tableForViewer(snapshot, SPECTATOR_SEAT)), alliances };
}

function unchanged(alliances: AllianceState) {
  return !alliances.groups.length && !alliances.offers.length;
}
