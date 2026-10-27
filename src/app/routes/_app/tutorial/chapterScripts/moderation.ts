import type { GameSnapshot } from '@shared/play/protocol';
import { removalThreshold } from '@shared/play/removal';

import { FACTION_INFO } from '../../play/compass/windows';
import type { GuideTask } from '../TutorialGuide';
import type { ChapterScript, TablePlayers } from './chapterScript';
import { element, pressEnter, task } from './guideChecks';

/*
 * Chapter 19, "Moderation": voting a player who has gone quiet for good off the table (Norbert, 2026-10-27: the whole process,
 * with the other players voting along, and the majority rule explained).
 * The learner opens the quiet player's faction information and starts the vote, then the others cast their ballots one by one
 * on the session's own rules, until the vote removes the player and their seat opens.
 */

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

const buttonNamed = (name: string) => () =>
  [...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === name) ?? null;

function tasks(snapshot: () => GameSnapshot, players: TablePlayers): GuideTask[] {
  const seats = () => snapshot().roster?.seats ?? [];
  const seatOf = (faction: string) => seats().find((seat) => seat.faction?.name === faction)?.id;
  const quietSeat = () => seatOf(QUIET);
  const vote = () => snapshot().removalVotes?.find((entry) => entry.target.seat === quietSeat());
  const seated = () => snapshot().controls?.players.some((player) => player.seat === quietSeat()) ?? false;
  const infoOpen = () => document.querySelector(`[data-window="${FACTION_INFO}"]`) !== null;
  const playerCount = () => snapshot().controls?.players.length ?? 0;
  return [
    task({
      id: 'open',
      task: 'Open the Harkonnen player’s information',
      detail:
        'The Harkonnen player has not moved or written in an hour, and the game is stuck waiting on them. Click the Harkonnen token on the chat bar under the table, then the token in the chat’s title: their faction information opens.',
      anchor: {
        kind: 'page',
        element: () =>
          document.querySelector(`[data-window^="player:"] header button[aria-label="${QUIET} info"]`) ??
          document.querySelector(`[aria-label*=", ${QUIET}"]`),
      },
      begin: () => undefined,
      done: () => infoOpen() && buttonNamed('Start removal vote')() !== null,
    }),
    task({
      id: 'start',
      task: 'Start a removal vote',
      detail:
        'Press Start removal vote. Every player sees the vote at once in this window, and the player’s token on the chat bar is marked. Starting it counts as your own Remove.',
      anchor: { kind: 'page', element: buttonNamed('Start removal vote') },
      begin: () => undefined,
      done: () => vote() !== undefined,
    }),
    task({
      id: 'majority',
      task: 'How a vote is decided',
      detail: `More than half of the whole table must vote Remove, the quiet player included, though they cannot vote on themselves. At ${playerCount()} players that is ${removalThreshold(playerCount())} Remove votes. The vote fails as soon as enough players vote Keep that it can no longer get there, and a table of fewer than three players cannot remove anyone. Press {Enter} to let the others vote.`,
      anchor: { kind: 'page', element: element(`[data-window="${FACTION_INFO}"]`) },
      ...pressEnter(),
    }),
    task({
      id: 'votes',
      task: 'Watch the others vote',
      detail:
        'Each player votes from the same window: Remove, Keep, or Withdraw to take their ballot back. The vote ends the moment the count decides it.',
      anchor: { kind: 'page', element: element(`[data-window="${FACTION_INFO}"]`) },
      begin: () => voteInTurn(players, vote, seatOf),
      done: () => vote() === undefined && !seated(),
      finish: (stop) => stop(),
    }),
    task({
      id: 'vacant',
      task: 'Their seat is open',
      detail:
        'The Harkonnen seat is empty now; its faction and pieces stay on the table. Someone watching can ask for the seat, and a player lets them in. Press {Enter} to finish.',
      anchor: { kind: 'page', element: element(`[data-window="${FACTION_INFO}"]`) },
      ...pressEnter(),
    }),
  ];
}

/* The others cast their ballots one at a time, each a moment after the last, until the vote has ended. */
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
      clearInterval(timer);
      return;
    }
    players.act(seat, { kind: 'removal-ballot', voteId: open.id, choice: next.choice });
  };
  const timer = setInterval(cast, BALLOT_INTERVAL_MS);
  return () => clearInterval(timer);
}

/* One line for each part of the chapter, in the order it was played. */
const learned = [
  'Start removal vote waits in a player’s faction information',
  'More than half of the whole table must vote Remove',
  'Enough Keep votes end a vote early',
  'A removed player’s seat opens for someone watching to take',
];

export const moderation: ChapterScript = {
  slug: 'moderation',
  checkpoint: 'turn-1-storm',
  tasks,
  learned,
};
