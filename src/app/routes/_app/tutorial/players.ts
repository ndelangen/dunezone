import { TUTORIAL_PLAYERS } from '@shared/tutorial/players';
import type { TutorialPlayer } from '@shared/tutorial/players';
import { createContext, useContext, useState } from 'react';

import type { ChapterScript } from './chapterScripts/chapterScript';
import type { TutorialSetup } from './setup/tutorialSetup';

/** Stories supply a fixed roster; each tutorial visit shuffles the same public profiles. */
export const TutorialPlayersContext = createContext<readonly TutorialPlayer[] | null>(null);

export function shuffledPlayers(random: () => number = Math.random): TutorialPlayer[] {
  const players = [...TUTORIAL_PLAYERS];
  for (let index = players.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [players[index], players[other]] = [players[other]!, players[index]!];
  }
  return players;
}

export type TutorialViewer = { slug: string; username: string | null } | null;

export function withoutViewer(people: readonly TutorialPlayer[], viewer: TutorialViewer) {
  return people.filter(
    (person) => person.slug !== viewer?.slug && person.name.toLowerCase() !== viewer?.username?.toLowerCase()
  );
}

export function useTutorialPlayers(viewer: TutorialViewer) {
  const fixed = useContext(TutorialPlayersContext);
  return useState(() => withoutViewer(fixed ?? shuffledPlayers(), viewer))[0];
}

/** Relabel the recording without changing its seats, accounts, factions or moves. */
export function seatTutorialPlayers(
  setup: TutorialSetup,
  people: readonly TutorialPlayer[],
  chapter: Pick<ChapterScript, 'playAs' | 'watch'> = {}
): TutorialSetup {
  if (people.length < 6 || new Set(people.map((person) => person.slug)).size !== people.length) {
    throw new Error('A tutorial needs six distinct other players.');
  }
  const roster = (
    setup.checkpoints['turn-1-storm'].stored as {
      roster: { seats: { id: string; faction: { name: string } | null }[] };
    }
  ).roster;
  const ownSeat = chapter.watch
    ? 'neutral'
    : chapter.playAs
      ? roster.seats.find((seat) => seat.faction?.name === chapter.playAs)!.id
      : 'seat-1';
  const seats = [...setup.checkpoints.drafting.players.map((player) => player.seat), 'neutral'];
  let next = 0;
  const cast = seats.map((seat) => (seat === ownSeat ? { name: 'You', slug: null, avatar: null } : people[next++]!));
  const recordedPlayers = setup.checkpoints['turn-1-storm'].players;
  const substitutions = new Map(recordedPlayers.map((person) => [person.name, cast[seats.indexOf(person.seat)]!.name]));
  const playerNames = recordedPlayers.map((person) => person.name.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`));
  const names = new RegExp(String.raw`\b(${playerNames.join('|')})\b`, 'g');
  const relabel = (text: string) => text.replace(names, (name) => substitutions.get(name)!);
  const checkpoints = Object.fromEntries(
    Object.entries(setup.checkpoints).map(([key, point]) => [
      key,
      {
        ...point,
        players: seats.map((seat, index) => ({ seat, ...cast[index]! })),
        viewers: Object.fromEntries(
          Object.entries(point.viewers).map(([seat, viewer]) => [
            seat,
            {
              ...viewer,
              displayName: cast[seats.indexOf(seat)]?.name ?? relabel(viewer.displayName),
            },
          ])
        ),
      },
    ])
  );
  return {
    ...setup,
    checkpoints: checkpoints as TutorialSetup['checkpoints'],
    log: JSON.parse(relabel(JSON.stringify(setup.log))) as TutorialSetup['log'],
  };
}
