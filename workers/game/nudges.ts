import { isRecallConversation, TABLE_CONVERSATION } from '../../src/shared/play/conversations';
import type { TableRoster } from '../../src/shared/play/schema';

export type NudgeOccupant = { seat: string; userId: string; name: string };

/** Exact names only; collisions across player and faction labels make the request ambiguous. */
export function nudgeTarget(
  text: string,
  fromFactionId: string,
  peerId: string,
  roster: TableRoster,
  occupants: NudgeOccupant[]
) {
  if (isRecallConversation(peerId)) {
    return;
  }
  let name = text.trim();
  if (/^\/nudge\s+/i.test(name)) {
    name = name.replace(/^\/nudge\s+/i, '').trim();
  }
  if (name.startsWith('@')) {
    name = name.slice(1);
  }
  name = name.toLowerCase();
  if (!name) {
    return;
  }
  const matches = roster.seats.flatMap((seat) => {
    const occupant = occupants.find((entry) => entry.seat === seat.id);
    if (!seat.faction || !occupant) {
      return [];
    }
    if (seat.faction.name.toLowerCase() !== name && occupant.name.toLowerCase() !== name) {
      return [];
    }
    return [{ ...occupant, factionId: seat.faction.id }];
  });
  if (matches.length !== 1) {
    return;
  }
  const target = matches[0];
  if (target.factionId === fromFactionId || (peerId !== TABLE_CONVERSATION && peerId !== target.factionId)) {
    return;
  }
  return target;
}
