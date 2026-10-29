import type { GameSnapshot } from '@shared/play/protocol';
import { removalThreshold } from '@shared/play/removal';

import { FACTION_INFO } from '../../play/compass/windows';
import type { GuideTask } from '../TutorialGuide';
import type { ChapterScript, TablePlayers } from './chapterScript';
import { element, pressEnter, task } from './guideChecks';

/* The public log, an absent player's removal vote and the audit record. */

/* The player who has gone quiet. */
const QUIET = 'House Harkonnen';
/* How the others vote, in order, by faction: enough Remove for the majority, with one Keep on the way. */
const BALLOTS = [
  { faction: 'Fremen', choice: 'remove' },
  { faction: 'Emperor', choice: 'keep' },
  { faction: 'House Atreides', choice: 'remove' },
  { faction: 'Spacing Guild', choice: 'remove' },
] as const;
/* How long each player takes to vote, so the learner sees each ballot land. */
const BALLOT_INTERVAL_MS = 1500;

/* The quiet icon beside a player's name in their faction information; another player's window does not count. */
const startButton = (seat: string | undefined) =>
  seat === undefined
    ? null
    : document.querySelector<HTMLElement>(
        `[data-window="${FACTION_INFO}"] [data-faction-info-seat="${seat}"] [aria-label="Start removal vote"]`
      );

function tasks(snapshot: () => GameSnapshot, players: TablePlayers): GuideTask[] {
  const seats = () => snapshot().roster?.seats ?? [];
  const seatOf = (faction: string) => seats().find((seat) => seat.faction?.name === faction)?.id;
  const quietSeat = () => seatOf(QUIET);
  const vote = () => snapshot().removalVotes?.find((entry) => entry.target.seat === quietSeat());
  const seated = () => snapshot().controls?.players.some((player) => player.seat === quietSeat()) ?? false;
  const playerCount = () => snapshot().controls?.players.length ?? 0;
  return [
    task({
      id: 'game-log',
      task: 'Check what happened',
      detail:
        "Someone disputes what happened at the start of Storm. Let's check together.\n\nPress {Space}, type Game log and confirm with {Enter} to see public events and phase changes.",
      anchor: { kind: 'page', element: element('[data-compass-launcher]') },
      begin: () => undefined,
      done: () => document.querySelector('[data-window="game-log"]') !== null,
    }),
    task({
      id: 'open',
      task: 'Open player details',
      detail:
        "The Harkonnen player has stopped responding. Let's see what the table can do.\n\nClick their token below the table, then click the token beside the chat title to open their details.",
      anchor: {
        kind: 'page',
        element: () =>
          document.querySelector(`[data-window^="player:"] header button[aria-label="${QUIET} info"]`) ??
          document.querySelector(`[aria-label*=", ${QUIET}"]`),
      },
      begin: () => undefined,
      done: () => startButton(quietSeat()) !== null,
    }),
    task({
      id: 'start',
      task: 'Start a removal vote',
      detail:
        'Press Start removal vote beside their name.\n\nThe other players will see the vote, and your Remove vote is counted automatically.',
      anchor: { kind: 'page', element: () => startButton(quietSeat()) },
      begin: () => undefined,
      done: () => vote() !== undefined,
    }),
    task({
      id: 'majority',
      task: 'How a vote is decided',
      detail: `Removing a player needs more than half the seats to vote Remove. With ${playerCount()} players, that means ${removalThreshold(playerCount())} votes.\n\nThe player being removed cannot vote. A vote fails if enough players choose Keep, and removal is unavailable with fewer than three players.\n\nPress {Enter} to let the others vote.`,
      anchor: { kind: 'page', element: element(`[data-window="${FACTION_INFO}"]`) },
      ...pressEnter(),
    }),
    task({
      id: 'votes',
      task: 'Watch the others vote',
      detail:
        'Players can choose Remove or Keep, or withdraw their vote. The vote ends as soon as the result is decided.\n\nIf it fails, start another removal vote to continue this exercise.',
      anchor: { kind: 'page', element: element(`[data-window="${FACTION_INFO}"]`) },
      begin: () => voteInTurn(players, vote, seatOf),
      done: () => vote() === undefined && !seated(),
      finish: (stop) => stop(),
    }),
    task({
      id: 'audit',
      task: 'Read the Audit record',
      detail:
        "The Harkonnen seat is open. Its faction and pieces stay for a replacement, and a seated player can approve their request to join.\n\nLet's check the record. Press {Space}, type Audit and confirm with {Enter} to see the removal vote and the player leaving their seat.",
      anchor: { kind: 'page', element: element('[data-compass-launcher]') },
      begin: () => undefined,
      done: () => document.querySelector('[data-window="audit"]') !== null,
    }),
  ];
}

/*
 * The others cast their ballots one at a time, each a moment after the last.
 * They keep watching once a vote ends: a learner who turns their own ballot to Keep can sink the vote, and the next vote they start gets its ballots too.
 */
function voteInTurn(
  players: TablePlayers,
  vote: () => { id: string; ballots: readonly { seat: string; choice: string | null }[] } | undefined,
  seatOf: (faction: string) => string | undefined
) {
  const cast = () => {
    const open = vote();
    const next = BALLOTS.find(({ faction }) => {
      const seat = seatOf(faction);
      return seat && open?.ballots.find((ballot) => ballot.seat === seat)?.choice === null;
    });
    const seat = next && seatOf(next.faction);
    if (!open || !next || !seat) {
      return;
    }
    players.act(seat, { kind: 'removal-ballot', voteId: open.id, choice: next.choice });
  };
  const timer = setInterval(cast, BALLOT_INTERVAL_MS);
  return () => clearInterval(timer);
}

/* One line for each part of the chapter, in the order it was played. */
const learned = [
  'Game log records public events; Audit records seats and votes',
  'Start removal vote waits in a player’s faction information',
  'More than half of the whole table must vote Remove',
  'Enough Keep votes end a vote early',
  'A removed player’s seat opens for someone watching to take',
];

export const moderation: ChapterScript = {
  slug: 'moderation',
  checkpoint: 'turn-1-storm',
  opening: (players) => {
    const seat = players.others()[0];
    if (seat) {
      players.act(seat, { kind: 'phase' });
    }
  },
  tasks,
  learned,
};
