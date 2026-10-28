import type { GameSnapshot } from '@shared/play/protocol';
import { removalThreshold } from '@shared/play/removal';

import { FACTION_INFO } from '../../play/compass/windows';
import type { GuideTask } from '../TutorialGuide';
import type { ChapterScript, TablePlayers } from './chapterScript';
import { element, pressEnter, task } from './guideChecks';

/* A disputed position and an absent player are separate exercises, each using the table's real vote. */

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
      task: 'Check the Game log',
      detail:
        'The table has moved into Spice Blow, but someone disputes the position at the start of Storm. Press {Space}, type Game log and press {Enter}. The log records public events and phase changes.',
      anchor: { kind: 'page', element: element('[data-compass-launcher]') },
      begin: () => undefined,
      done: () => document.querySelector('[data-window="game-log"]') !== null,
    }),
    task({
      id: 'review-propose',
      task: 'Ask to review Storm',
      detail:
        'Press {Space}, type Table review and press {Enter}. Use Earlier checkpoint to choose Storm in Turn 1, then Ask the table to review. If you choose another checkpoint, Withdraw and try again. Your proposal counts as your agreement.',
      anchor: {
        kind: 'page',
        element: () =>
          document.querySelector('[data-window="review"]') ?? document.querySelector('[data-compass-launcher]'),
      },
      begin: () => undefined,
      done: () => snapshot().review?.step === 0,
    }),
    task({
      id: 'review-majority',
      task: 'A review needs the table to agree',
      detail:
        'More than half of the seated players must agree before anyone looks back. Others can Agree or Decline; the proposer can Withdraw. Press {Enter} to let the others answer.',
      anchor: { kind: 'page', element: element('[aria-label="Table review vote"]') },
      ...pressEnter(),
    }),
    task({
      id: 'review-votes',
      task: 'Watch the review vote',
      detail:
        'The others agree one at a time. When the majority is reached, everyone sees the same saved public position and play pauses.',
      anchor: { kind: 'page', element: element('[data-window="review"]') },
      begin: () => {
        const timer = setInterval(() => {
          const review = snapshot().review;
          if (!review || review.startedAt !== null) {
            return;
          }
          const seat = players
            .others()
            .find((seat) => review.ballots.some((ballot) => ballot.seat === seat && ballot.choice === null));
          if (seat) {
            players.act(seat, { kind: 'review-ballot', reviewId: review.id, choice: 'review' });
          }
        }, BALLOT_INTERVAL_MS);
        return () => clearInterval(timer);
      },
      done: () => snapshot().review?.startedAt != null,
      finish: (stop) => stop(),
    }),
    task({
      id: 'review-discuss',
      task: 'Discuss the saved position',
      detail:
        'You are looking at Storm together. Nobody can move pieces or peek at cards while the review runs. Private hands and plans stay hidden. Discuss the disagreement out loud or in table chat. This view does not undo any moves. Press {Enter} when you are ready to resume.',
      anchor: { kind: 'page', element: element('[aria-label="Table review in progress"]') },
      ...pressEnter(),
    }),
    task({
      id: 'review-resume',
      task: 'Resume the current game',
      detail:
        'Press Resume play in the header or Table review window. Any seated player can resume. Everyone returns to the current Spice Blow position; the review has changed no pieces.',
      anchor: {
        kind: 'page',
        element: () =>
          [...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Resume play') ??
          null,
      },
      begin: () => undefined,
      done: () => !snapshot().review,
    }),
    task({
      id: 'open',
      task: 'Open the Harkonnen player’s information',
      detail:
        'Now a different problem: the Harkonnen player has not moved or written in an hour, and the game is stuck waiting on them. Click the Harkonnen token on the chat bar under the table, then the token in the chat’s title: their faction information opens.',
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
        'Press Start removal vote, the crossed-out person beside their name. Every player sees the vote at once in this window, and the player’s token on the chat bar is marked. Starting it counts as your own Remove.',
      anchor: { kind: 'page', element: () => startButton(quietSeat()) },
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
        'Each player votes from the same window: Remove, Keep, or Withdraw to take their ballot back. The vote ends the moment the count decides it; if it fails, start another the same way.',
      anchor: { kind: 'page', element: element(`[data-window="${FACTION_INFO}"]`) },
      begin: () => voteInTurn(players, vote, seatOf),
      done: () => vote() === undefined && !seated(),
      finish: (stop) => stop(),
    }),
    task({
      id: 'vacant',
      task: 'Their seat is open',
      detail:
        'The Harkonnen seat is empty now; its faction and pieces stay on the table. Someone watching can ask for the seat, and a player lets them in. Press {Enter} to check the record.',
      anchor: { kind: 'page', element: element(`[data-window="${FACTION_INFO}"]`) },
      ...pressEnter(),
    }),
    task({
      id: 'audit',
      task: 'Read the Audit record',
      detail:
        'Press {Space}, type Audit and press {Enter}. It records how the review and removal votes ended, and who left a seat.',
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
  'Table review needs a majority to inspect one saved public position',
  'Review pauses play; Resume play returns everyone to the current game',
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
