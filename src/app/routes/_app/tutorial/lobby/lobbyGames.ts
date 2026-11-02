import type { playLobbyEntrySchema } from '@shared/play/directory';
import { normalizePlayGameSlug } from '@shared/play/gameNamePolicy';
import { DEFAULT_LAST_TURN } from '@shared/play/lastTurn';
import { DEFAULT_TABLE_SEAT_COUNT } from '@shared/play/tableSettings';
import type { z } from 'zod';

import type { CreateGameDraft } from '@app/widgets/create-game/CreateGamePass';
import type { LobbyGames } from '@app/widgets/play-lobby/PlayLobby';

import type { TutorialSetup } from '../setup/tutorialSetup';

type LobbyEntry = z.infer<typeof playLobbyEntrySchema>;
export const TUTORIAL_RULESET = {
  id: 'tutorial-dreamrules',
  slug: 'dreamrules',
  name: 'Dreamrules',
  objection: null,
  selectable: true,
} as const;
export const FRIEND_GAME = 'Midnight Caladan tea break';
export const FRIEND_ADDRESS = normalizePlayGameSlug(FRIEND_GAME);
export const FRIEND_SEATS = ['seat-2', 'seat-4', 'seat-6'];

/** Several open tables, with the chosen friend at one of them. */
export function sampleLobby(setup: TutorialSetup): LobbyGames {
  const people = setup.checkpoints.drafting.players;
  const roster = (
    setup.checkpoints['turn-1-storm'].stored as {
      roster: { seats: { id: string; faction: { id: string; name: string; color: string } | null }[] };
    }
  ).roster;
  const factionFor = (seat: string) => {
    const faction = roster.seats.find((entry) => entry.id === seat)?.faction;
    const token = faction && setup.factions[faction.id];
    return faction && token
      ? {
          name: faction.name,
          color: faction.color,
          token: { logo: token.logo, background: token.background },
          won: false,
        }
      : null;
  };
  const entry = (name: string, indexes: readonly number[], seatCount: number, dealt = false): LobbyEntry => ({
    gameId: normalizePlayGameSlug(name),
    slug: normalizePlayGameSlug(name),
    name,
    rulesetName: TUTORIAL_RULESET.name,
    stage: dealt ? 'play' : 'drafting',
    seatCount,
    seatsFilled: indexes.length,
    viewerSeated: false,
    phase: dealt ? 22 : null,
    lastActivityAt: Date.now(),
    result: null,
    players: indexes.map((index) => ({
      displayName: people[index]!.name,
      avatarUrl: people[index]!.avatar,
      viewer: false,
      faction: dealt ? factionFor(people[index]!.seat) : null,
    })),
  });
  return {
    ongoing: [
      entry('Arrakeen picnic', [0, 2, 4], 3, true),
      entry(FRIEND_GAME, [1, 3, 5], 6),
      entry('Gom Jabbar party', [0, 2, 4], 4),
      entry('Giedi Prime dinner ambush', [2, 4], 6),
    ],
    past: [],
  };
}

export const initialLobbyDraft = (): CreateGameDraft => ({
  generatedName: 'Arrakeen picnic',
  custom: false,
  customName: '',
  rulesetId: '',
  minimumPlayers: DEFAULT_TABLE_SEAT_COUNT,
  lastTurn: DEFAULT_LAST_TURN,
  refusal: null,
});
