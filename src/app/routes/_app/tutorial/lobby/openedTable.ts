import { emptySnapshot } from '@shared/play/commands';
import { emptyDraft } from '@shared/play/drafting';
import { normalizePlayGameSlug } from '@shared/play/gameNamePolicy';
import { emptyPublicControls } from '@shared/play/inventory';
import { SPECTATOR_SEAT } from '@shared/play/schema';
import { isTableSeatCount } from '@shared/play/tableSettings';

import { storedSnapshotSchema } from '../../../../../../workers/game/state';
import type { LobbyState } from '../chapterScripts/chapterScript';
import { startAt } from '../setup/tutorialSetup';
import type { TutorialSetup } from '../setup/tutorialSetup';
import type { TableStart } from '../table/localTable';
import { FRIEND_GAME, FRIEND_SEATS } from './lobbyGames';

export function openedIdentity(opened: NonNullable<LobbyState['opened']>) {
  const name =
    opened.kind === 'found'
      ? FRIEND_GAME
      : 'name' in opened.request
        ? opened.request.name.trim()
        : (opened.request.generatedName ?? 'New game');
  return { name, address: normalizePlayGameSlug(name), rulesetName: 'Dreamrules' };
}

/** A new game starts with its creator alone; a found game keeps exactly the lobby card's players. */
export function openedTable(
  setup: TutorialSetup,
  opened: NonNullable<LobbyState['opened']>,
  origin: string
): TableStart {
  const base = startAt(setup, 'drafting', origin);
  const { seats, seat, count, lastTurn } =
    opened.kind === 'created'
      ? { seats: ['seat-1'], seat: 'seat-1', count: opened.request.minimumPlayers, lastTurn: opened.request.lastTurn }
      : { seats: FRIEND_SEATS, seat: SPECTATOR_SEAT, count: 6, lastTurn: 10 };
  if (!isTableSeatCount(count)) {
    throw new Error('Unsupported seat count.');
  }
  const players = base.players.filter((player) => seats.includes(player.seat));
  const viewers = Object.fromEntries(
    Object.entries(base.viewers).filter(([viewerSeat]) => seats.includes(viewerSeat) || viewerSeat === seat)
  );
  const roster = { seatCount: count, seats: seats.map((id, position) => ({ id, position, faction: null })) };
  const empty = emptySnapshot();
  return {
    ...base,
    players,
    viewers,
    seat,
    log: {},
    stored: storedSnapshotSchema.parse({
      ...empty,
      stage: 'drafting',
      roster,
      controls: { ...emptyPublicControls(), seats, players },
      draft: emptyDraft(count, base.stored.draft?.factions ?? [], Date.now()),
      lastTurn,
    }),
    draft: { minimumPlayers: count, deal: [] },
  };
}
