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
        'Someone disputes what happened at the start of Storm. Press {Space}, type Game log and press {Enter} to check the public events and phase changes.',
      anchor: { kind: 'page', element: element('[data-compass-launcher]') },
      begin: () => undefined,
      done: () => document.querySelector('[data-window="game-log"]') !== null,
    }),
    task({
      id: 'review-propose',
      task: 'Ask to review Storm',
      detail:
        'Press {Space}, type Table review and press {Enter}. Use Earlier checkpoint to select Turn 1, Storm, then press Ask the table to review. If you picked the wrong checkpoint, withdraw the request and try again.',
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
      task: 'Agree to a review',
      detail:
        'A review needs agreement from more than half the seated players. Your request counts as your agreement. Other players can agree or decline, and you can withdraw it. Press {Enter} to let them respond.',
      anchor: { kind: 'page', element: element('[aria-label="Table review vote"]') },
      ...pressEnter(),
    }),
    task({
      id: 'review-votes',
      task: 'Watch the review vote',
      detail:
        'The other players are agreeing now. Once a majority agrees, play pauses and everyone sees the saved public position.',
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
        'You are all looking at the Storm checkpoint. Pieces cannot move, peeking is disabled, and private hands and plans stay hidden. Use table chat or talk aloud to resolve the dispute. Press {Enter} when you are ready to resume.',
      anchor: { kind: 'page', element: element('[aria-label="Table review in progress"]') },
      ...pressEnter(),
    }),
    task({
      id: 'review-resume',
      task: 'Resume the current game',
      detail:
        'Press Resume play. Any seated player can do this. You all return to the live Spice Blow position. Reviewing an earlier position does not undo any moves.',
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
      task: 'Open the player details',
      detail:
        'Suppose the Harkonnen player has stopped responding. Click their token below the table, then click the token beside the chat title to open their details.',
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
        'Press Start removal vote beside their name. The other players will see the vote, and your Remove vote is counted automatically.',
      anchor: { kind: 'page', element: () => startButton(quietSeat()) },
      begin: () => undefined,
      done: () => vote() !== undefined,
    }),
    task({
      id: 'majority',
      task: 'How a vote is decided',
      detail: `Removing a player needs more than half the seats to vote Remove. With ${playerCount()} players, that means ${removalThreshold(playerCount())} votes. The player being removed cannot vote. A vote fails if enough players choose Keep, and removal is unavailable with fewer than three players. Press {Enter} to let the others vote.`,
      anchor: { kind: 'page', element: element(`[data-window="${FACTION_INFO}"]`) },
      ...pressEnter(),
    }),
    task({
      id: 'votes',
      task: 'Watch the others vote',
      detail:
        'Players can choose Remove or Keep, or withdraw their vote. The vote ends as soon as the result is decided.',
      anchor: { kind: 'page', element: element(`[data-window="${FACTION_INFO}"]`) },
      begin: () => voteInTurn(players, vote, seatOf),
      done: () => vote() === undefined && !seated(),
      finish: (stop) => stop(),
    }),
    task({
      id: 'vacant',
      task: 'Their seat is open',
      detail:
        'The Harkonnen seat is now open. Its faction and pieces stay on the table for a replacement player. A spectator can request the seat, and a seated player can approve them. Press {Enter} to continue.',
      anchor: { kind: 'page', element: element(`[data-window="${FACTION_INFO}"]`) },
      ...pressEnter(),
    }),
    task({
      id: 'audit',
      task: 'Read the Audit record',
      detail:
        'Press {Space}, type Audit and press {Enter}. Check the record of the review, the removal vote and the player leaving their seat.',
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
