import type { playLobbyEntrySchema } from '@shared/play/directory';
import { normalizePlayGameSlug } from '@shared/play/gameNamePolicy';
import { useReducer } from 'react';
import type { ReactNode } from 'react';
import type { z } from 'zod';

import {
  CreateGamePass,
  createGameDraftReducer,
  initialCreateGameDraft,
} from '@app/widgets/create-game/CreateGamePass';
import type { CreateGameDraftEvent, CreateGameRequest } from '@app/widgets/create-game/CreateGamePass';
import { PlayLobby } from '@app/widgets/play-lobby/PlayLobby';
import type { LobbyGames } from '@app/widgets/play-lobby/PlayLobby';

import type { TutorialSetup } from '../setup/tutorialSetup';

/*
 * The lobby and create pages as a lobby chapter shows them: a room of sample games seated by the recording's players,
 * one ruleset to start a game with, and a creation that stays on the chapter's page instead of reaching Convex.
 * Each is the Play page's own widget, handed the chapter's data and callbacks where the Play page hands it Convex's.
 */

type LobbyEntry = z.infer<typeof playLobbyEntrySchema>;
type Player = LobbyEntry['players'][number];

const TUTORIAL_RULESET = {
  id: 'tutorial-dreamrules',
  slug: 'dreamrules',
  name: 'Dreamrules',
  objection: null,
  selectable: true,
} as const;
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
export function sampleLobby(setup: TutorialSetup, learner: string, now = Date.now()): LobbyGames {
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

/* A button standing in for a link the chapter keeps on its page, marked for the guide's arrow. */
const stayingLink =
  (target: string, onClick: () => void = () => undefined) =>
  ({ children, ...rootProps }: { children?: ReactNode }) => (
    <button {...rootProps} type="button" data-tutorial-target={target} onClick={onClick}>
      {children}
    </button>
  );

/**
 * The lobby with the sample games;
 * Create a game moves the chapter to the create page, and the other links stay put.
 * Until the chapter asks for it, Create a game shows disabled and says when it opens.
 */
export function TutorialLobby({
  games,
  createOpen,
  onCreate,
}: Readonly<{ games: LobbyGames; createOpen: boolean; onCreate: () => void }>) {
  return (
    <PlayLobby
      games={games}
      waiting={null}
      createLink={stayingLink('create', onCreate)}
      createDisabledReason={createOpen ? undefined : 'You’ll create a game in a later step'}
      /* The chapter is the tutorial already, and the sample games have no table to open. */
      tutorialLink={stayingLink('tutorial')}
      gameLink={(address) => stayingLink(`game:${address}`)}
    />
  );
}

type Created = Readonly<{ name: string; address: string }>;

/* Whatever name the pass sends, the game it creates: a custom name as typed, else the generated one. */
const nameOf = (request: CreateGameRequest) =>
  'name' in request ? request.name.trim() : (request.generatedName ?? 'New game');

/**
 * The create page with the chapter's one ruleset;
 * the game it creates exists on the chapter's page alone.
 * It tells the chapter which ruleset the pass holds, so a step sees the one chosen rather than what the field shows.
 */
export function TutorialCreate({
  ruleset,
  onRuleset,
  onCreated,
}: Readonly<{
  /** The ruleset the pass starts with, by name: a chapter opened past choosing one starts with it chosen. */
  ruleset: string | null;
  onRuleset: (name: string | null) => void;
  onCreated: (game: Created) => void;
}>) {
  const [draft, dispatch] = useReducer(createGameDraftReducer, undefined, () => ({
    ...initialCreateGameDraft(),
    rulesetId: ruleset === TUTORIAL_RULESET.name ? TUTORIAL_RULESET.id : '',
  }));
  /* Each change to the draft reaches the chapter as it is made, so the step sees the ruleset the pass will create the game with. */
  const change = (event: CreateGameDraftEvent) => {
    dispatch(event);
    onRuleset(createGameDraftReducer(draft, event).rulesetId === TUTORIAL_RULESET.id ? TUTORIAL_RULESET.name : null);
  };
  return (
    <CreateGamePass
      rulesets={[TUTORIAL_RULESET]}
      preview={null}
      draft={draft}
      dispatch={change}
      pending={false}
      departing={false}
      notice={null}
      failure={null}
      onCreate={(request) => {
        const name = nameOf(request);
        onCreated({ name, address: normalizePlayGameSlug(name) });
      }}
      rulesetLink={() => stayingLink('ruleset')}
    />
  );
}
