import type { playLobbyEntrySchema } from '@shared/play/directory';
import { normalizePlayGameSlug } from '@shared/play/gameNamePolicy';
import type { z } from 'zod';

import type { useCreateGame } from '@db/play';
import { useLiveOperation } from '@app/db/core/live';

import type { PlayPages } from '../../play/playPages';
import type { TutorialSetup } from '../setup/tutorialSetup';

/*
 * The lobby and create pages as a lobby chapter shows them: a room of sample games seated by the recording's players,
 * one ruleset to start a game with, and a creation that stays on the chapter's page instead of reaching Convex.
 */

type LobbyEntry = z.infer<typeof playLobbyEntrySchema>;
type Player = LobbyEntry['players'][number];

const TUTORIAL_RULESET = { id: 'tutorial-dreamrules', slug: 'dreamrules', name: 'Dreamrules' } as const;
const MINUTE = 60_000;
const PHASES_PER_TURN = 9;

/* The recording's six players, with the factions the recording dealt them; the learner sits in the first seat. */
function playersOf(setup: TutorialSetup, learner: string) {
  const seats = (
    setup.checkpoints['turn-1-storm'].stored as {
      roster: { seats: { id: string; faction: { name: string; color: string } | null }[] };
    }
  ).roster.seats;
  return setup.checkpoints['turn-1-storm'].players.map((player) => ({
    player,
    viewer: player.seat === learner,
    faction: seats.find((seat) => seat.id === player.seat)?.faction ?? null,
  }));
}

/** The sample room: a game of the learner's under way, two with seats open, one trading and one finished. */
export function sampleLobby(setup: TutorialSetup, learner: string, now = Date.now()) {
  const people = playersOf(setup, learner);
  const seated = (indexes: readonly number[], withFactions: boolean, winners: readonly string[] = []): Player[] =>
    indexes.flatMap((index) => {
      const person = people[index];
      return person
        ? [
            {
              displayName: person.player.name,
              avatarUrl: person.player.avatar,
              viewer: person.viewer,
              faction:
                withFactions && person.faction
                  ? { ...person.faction, token: null, won: winners.includes(person.faction.name) }
                  : null,
            },
          ]
        : [];
    });
  const entry = (
    sequence: number,
    name: string,
    stage: LobbyEntry['stage'],
    seatCount: number,
    players: Player[],
    rest: Partial<LobbyEntry> = {}
  ): LobbyEntry => ({
    gameId: `tutorial-game-${sequence}`,
    name,
    slug: normalizePlayGameSlug(name),
    rulesetName: TUTORIAL_RULESET.name,
    stage,
    seatsFilled: players.length,
    seatCount,
    viewerSeated: players.some((player) => player.viewer),
    players,
    phase: null,
    lastActivityAt: now,
    result: null,
    ...rest,
  });
  const winners = ['Fremen', 'House Atreides'];
  return {
    status: 'ready' as const,
    ongoing: [
      entry(1, 'Arrakeen picnic', 'play', 6, seated([0, 1, 2, 3, 4, 5], true), {
        phase: 2 * PHASES_PER_TURN + 4,
        lastActivityAt: now - 4 * MINUTE,
      }),
      entry(2, 'Midnight Caladan tea break', 'drafting', 6, seated([1, 4, 5], false), {
        lastActivityAt: now - 7 * MINUTE,
      }),
      entry(3, 'Gom Jabbar party', 'swapping', 4, seated([2, 3, 4, 5], true), { lastActivityAt: now - 35 * MINUTE }),
      entry(4, 'Giedi Prime dinner ambush', 'play', 6, seated([1, 2, 3, 5], true), {
        phase: 6 * PHASES_PER_TURN + 1,
        lastActivityAt: now - 140 * MINUTE,
      }),
    ],
    past: [
      entry(5, 'Secret Shai-Hulud dance rehearsal', 'finished', 6, seated([0, 1, 2, 3, 4, 5], true, winners), {
        lastActivityAt: now - 26 * 60 * MINUTE,
        result: { kind: 'alliance', factions: winners },
      }),
    ],
  };
}

type Request = Parameters<ReturnType<typeof useCreateGame>['mutate']>[0];
type Created = Readonly<{ name: string; address: string }>;

/** Whatever name the page sends, the game it creates: a custom name as typed, else the generated one. */
const nameOf = (request: Request) => ('name' in request ? request.name.trim() : (request.generatedName ?? 'New game'));

/** The pages' sources for a lobby chapter; `go` moves the chapter between the lobby and the create page. */
export function tutorialPlayPages({
  lobby,
  go,
  created,
}: Readonly<{
  lobby: ReturnType<typeof sampleLobby>;
  go: (view: 'lobby' | 'create') => void;
  created: (game: Created) => void;
}>): PlayPages {
  let made: Created | null = null;
  const button =
    (onClick: () => void, target: string) =>
    ({ children, ...rootProps }: { children?: unknown }) => (
      <button {...rootProps} type="button" data-tutorial-target={target} onClick={onClick}>
        {children as never}
      </button>
    );
  return {
    /* The sample games keep to the lobby's schema; Convex's own type names its ids by table, which a sample has none of. */
    useLobbyGames: () => ({ data: lobby as never, isPending: false, isLoading: false }),
    useCreatableRulesets: () => {
      return {
        data: {
          access: 'allowed' as const,
          rulesets: [{ ...TUTORIAL_RULESET, objection: null, selectable: true }],
          preview: null,
        },
        isPending: false,
        isLoading: false,
      } as never;
    },
    useGameNameAvailability: (name) => ({ base: normalizePlayGameSlug(name), duplicate: false }),
    useCreateGame: () =>
      useLiveOperation(async (request: Request) => {
        const name = nameOf(request);
        made = { name, address: normalizePlayGameSlug(name) };
        return { ok: true as const, gameId: 'tutorial-new-game', slug: made.address };
      }) as ReturnType<typeof useCreateGame>,
    useOpenGame: () => () => {
      if (made) {
        created(made);
      }
    },
    createLink: button(() => go('create'), 'create'),
    /* The chapter is the tutorial already, and the sample games have no table to open. */
    tutorialLink: button(() => undefined, 'tutorial'),
    gameLink: (address) => button(() => undefined, `game:${address}`),
  };
}
