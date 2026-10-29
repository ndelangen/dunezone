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
  let continuedReviewId: string | undefined;
  const continueReview = pressEnter(() => {
    const review = snapshot().review;
    if (review?.step !== 0) {
      return false;
    }
    continuedReviewId = review.id;
    return true;
  });
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
      id: 'review-propose',
      task: 'Ask to recall Storm',
      detail:
        "The log isn't the only way to look back. Press {Space}, type Mentat recall and confirm with {Enter}.\n\nUse Earlier checkpoint to select Turn 1, Storm, then Ask the table to recall.\n\nIf you picked the wrong checkpoint, withdraw the request and try again.",

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
      task: 'Agree to recall',
      detail:
        'A recall needs agreement from more than half the seated players. Your request counts as your agreement.\n\nOther players can agree or decline.\n\nIf you withdraw the request, ask to recall Turn 1, Storm again.\n\nPress {Enter} to let them respond.',
      anchor: { kind: 'page', element: element('[aria-label="Mentat recall vote"]') },
      ...continueReview,
      done: (watch) =>
        snapshot().review?.step === 0 && snapshot().review?.id === continuedReviewId && continueReview.done(watch),
    }),
    task({
      id: 'review-votes',
      task: 'Wait for the others',
      detail:
        'The other players are agreeing now. Once a majority agrees, play pauses and everyone sees the saved public position.\n\nIf you withdraw the request, ask to recall Turn 1, Storm again.',

      anchor: { kind: 'page', element: element('[data-window="review"]') },
      begin: () => {
        const timer = setInterval(() => {
          const review = snapshot().review;
          if (!review || review.step !== 0 || review.startedAt !== null) {
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
      done: () => snapshot().review?.step === 0 && snapshot().review?.startedAt != null,
      finish: (stop) => stop(),
    }),
    task({
      id: 'review-resume',
      task: 'Talk it through',
      detail:
        "You're all looking at the Storm checkpoint. Everything is frozen, including your recorded hand, private side table and spice.\n\nUse Recall chat or talk aloud to settle the dispute. Recall chat is separate from table chat and disappears when you return.\n\nWhen you're ready, press Return to the game. Any seated player can do this. You'll return to the live Spice Blow position. Recalling an earlier position doesn't undo any moves.",
      anchor: {
        kind: 'page',
        element: () =>
          [...document.querySelectorAll('button')].find(
            (button) => button.textContent?.trim() === 'Return to the game'
          ) ?? null,
      },
      begin: () => undefined,
      done: () => !snapshot().review,
    }),
    task({
      id: 'open',
      task: 'Open player details',
      detail:
        "Now suppose the Harkonnen player has stopped responding. Let's see what the table can do.\n\nClick their token below the table, then click the token beside the chat title to open their details.",
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
        "The Harkonnen seat is open. Its faction and pieces stay for a replacement, and a seated player can approve their request to join.\n\nLet's check the record. Press {Space}, type Audit and confirm with {Enter} to see the recall, removal vote and player leaving their seat.",
      anchor: { kind: 'page', element: element('[data-compass-launcher]') },
      begin: () => undefined,
      done: () => document.querySelector('[data-window="audit"]') !== null,
    }),
    task({
      id: 'read-audit',
      task: 'Take a look at the record',
      detail:
        'The Audit log records who requested the vote, how players voted and when the player left. Take your time reading it.\n\nPress {Enter} when you are ready to finish.',
      anchor: { kind: 'page', element: element('[data-window="audit"]') },
      ...pressEnter(() => document.querySelector('[data-window="audit"]') !== null),
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
  'Mentat recall needs a majority to inspect one saved public position',
  'Recall pauses play; Return to the game returns everyone to the current game',
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
