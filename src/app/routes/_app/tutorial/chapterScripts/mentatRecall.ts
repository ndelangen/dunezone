import type { StoredPiece } from '@shared/play/model';
import type { GameSnapshot } from '@shared/play/protocol';
import { reviewRunning } from '@shared/play/review';

import type { GuideTask } from '../TutorialGuide';
import type { ChapterScript, TablePlayers } from './chapterScript';
import { element, phaseOf, pressEnter, task } from './guideChecks';
import { KWISATZ_HADERACH } from './kwisatzHaderach';

/* A recorded tracker gives the private side-table something to inspect at both checkpoints. */
const hand: StoredPiece[] = [{ ...KWISATZ_HADERACH, hiddenZone: { x: 0.5, y: 0.5 } }];

/* Normal windows stay mounted during recall; only this controller shows the historical contents. */
const RECALL = '[data-recall-controls="true"]';
const panel = (key: string) => document.querySelector(`${RECALL} [data-window="${key}"]`);
const historySlider = () => panel('recall-history')?.querySelector('[role="slider"]');
const recallElement = (selector: string) => () => document.querySelector(`${RECALL} ${selector}`);
const returnButton = () => document.querySelector('[data-recall-return]');
const loaded = () =>
  document.querySelector(RECALL) !== null &&
  document.querySelector(`${RECALL} [aria-label="Loading recalled inventory"], ${RECALL} [role="alert"]`) === null &&
  panel('recall-history')?.querySelector('[role="status"]') == null;

/* The practice players answer through their seats, including a new proposal after an early return. */
function answerProposals(snapshot: () => GameSnapshot, players: TablePlayers, stormOnly: boolean) {
  const timer = setInterval(() => {
    const review = snapshot().review;
    if (review?.startedAt !== null) {
      return;
    }
    if (stormOnly && review.step !== 0) {
      return;
    }
    const seat = players
      .others()
      .find((seat) => review.ballots.some((ballot) => ballot.seat === seat && ballot.choice === null));
    if (seat) {
      players.act(seat, { kind: 'review-ballot', reviewId: review.id, choice: 'review' });
    }
  }, 1500);
  return () => clearInterval(timer);
}

/* While recall is closed, the arrow leads back to its restored request window or Controls. */
function recallAnchor(snapshot: () => GameSnapshot, anchor: GuideTask['anchor']): GuideTask['anchor'] {
  if (anchor.kind !== 'page') {
    return anchor;
  }
  return {
    kind: 'page',
    element: () =>
      reviewRunning(snapshot().review)
        ? anchor.element()
        : (document.querySelector('[data-window="review"]') ?? document.querySelector('[data-compass-launcher]')),
  };
}

/* A replacement recall starts fresh baselines, and every task releases its timers and listeners on Reset or exit. */
function duringRecall(snapshot: () => GameSnapshot, players: TablePlayers) {
  return <Baseline>(definition: GuideTask<Baseline>): GuideTask => {
    const anchor = definition.anchor;
    return task({
      ...definition,
      detail: `${definition.detail}\n\nIf recall closes early, ask for Storm again in the Mentat recall window. If it is closed, open it through Controls. The practice players will agree.`,
      anchor: recallAnchor(snapshot, anchor),
      begin: (view) => ({
        id: snapshot().review?.id,
        baseline: definition.begin(view),
        stop: answerProposals(snapshot, players, false),
      }),
      done: (watch, view) => {
        const review = snapshot().review;
        if (!reviewRunning(review)) {
          return false;
        }
        if (watch.id !== review.id) {
          definition.finish?.(watch.baseline);
          watch.id = review.id;
          watch.baseline = definition.begin(view);
        }
        return loaded() && definition.done(watch.baseline, view);
      },
      finish: (watch) => {
        watch.stop();
        definition.finish?.(watch.baseline);
      },
    });
  };
}

/* A saved own message says Sent; drafts, pending messages and another player's replies cannot finish the exercise. */
const sentMessages = () =>
  [...(panel('recall-chat')?.querySelectorAll('[aria-label="Conversation history"] *') ?? [])].filter(
    (element) => element.children.length === 0 && element.textContent === 'Sent'
  ).length;

function openingTasks(snapshot: () => GameSnapshot): GuideTask[] {
  return [
    task({
      id: 'purpose',
      task: 'Look back together',
      detail:
        'Not sure what the board showed earlier? Mentat recall lets the table inspect a saved checkpoint together. It can settle a dispute or help you retrace what happened.\n\nIt does not undo moves or let you change the past. In this practice game, Storm has finished and the live game is in Spice Blow.\n\nPress {Enter} to try it.',
      anchor: { kind: 'page', element: element('[data-compass-launcher]') },
      ...pressEnter(),
    }),
    task({
      id: 'pin-live-hand',
      task: 'Keep your live hand open',
      detail:
        'Press {H} to open Hand & spice, then use its left pin to keep it open in the bottom left.\n\nRecall has its own panel layout. Your normal panels will return as you left them when play resumes.',
      anchor: {
        kind: 'page',
        element: () =>
          document.querySelector('[data-window="hand"] [aria-label="Pin to the bottom left"]') ??
          document.querySelector('[data-own-token]'),
      },
      begin: () => undefined,
      done: () => document.querySelector('[data-side="left"][data-window="hand"]') !== null,
    }),
    task({
      id: 'review-propose',
      task: 'Ask to recall Storm',
      detail:
        'Press {Space}, type Mentat recall and confirm with {Enter}.\n\nUse Earlier checkpoint to select Turn 1, Storm, then press Ask the table to recall. If you pick the wrong checkpoint, withdraw the request and try again.',
      anchor: {
        kind: 'page',
        element: () =>
          document.querySelector('[data-window="review"]') ?? document.querySelector('[data-compass-launcher]'),
      },
      begin: () => undefined,
      done: () => snapshot().review?.step === 0,
    }),
  ];
}

function consentTask(snapshot: () => GameSnapshot): GuideTask {
  let continuedReviewId: string | undefined;
  const consent = pressEnter(() => {
    const review = snapshot().review;
    if (review?.step !== 0) {
      return false;
    }
    continuedReviewId = review.id;
    return true;
  });
  return task({
    id: 'review-majority',
    task: 'Agree to recall',
    detail:
      'More than half the seated players must agree before recall starts. Your request counts as your agreement; the other players can agree or decline.\n\nYou can withdraw your request while the vote is open. Ask for Storm again if you do.\n\nPress {Enter} to let the practice players respond.',
    anchor: { kind: 'page', element: element('[aria-label="Mentat recall vote"]') },
    ...consent,
    done: (watch) =>
      snapshot().review?.step === 0 && snapshot().review?.id === continuedReviewId && consent.done(watch),
  });
}

function ballotTask(snapshot: () => GameSnapshot, players: TablePlayers): GuideTask {
  return task({
    id: 'review-votes',
    task: 'Wait for the table',
    detail:
      'The others are agreeing now. Once a majority agrees, play pauses for everyone and the table opens the same saved checkpoint.',
    waitingForPlayers: true,
    anchor: { kind: 'page', element: element('[aria-label="Mentat recall vote"]') },
    begin: () => answerProposals(snapshot, players, true),
    done: () => snapshot().review?.step === 0 && reviewRunning(snapshot().review),
    finish: (stop) => stop(),
  });
}

function inspectionTasks(snapshot: () => GameSnapshot, players: TablePlayers): GuideTask[] {
  const recalling = duringRecall(snapshot, players);
  return [
    recalling({
      id: 'frozen-table',
      task: 'Look around the frozen table',
      detail:
        'The cool tint and Mentat recall background mark a view of the past. Pieces, cards and spice are frozen: you cannot move, flip, peek, draw, deal or change them. Commands that change game contents are unavailable in search too.\n\nYou can still move your camera, show your cursor and ping with {Tab}. Your camera is personal.\n\nChoose Right on the camera dial to look from another side.',
      anchor: { kind: 'page', element: element('[aria-label^="Focus on right"]') },
      begin: () => undefined,
      done: () => document.querySelector('[aria-label^="Focus on right"]')?.getAttribute('aria-pressed') === 'true',
    }),
    recalling({
      id: 'recalled-hand',
      task: 'Inspect your recalled hand',
      detail:
        "Click your faction token to the left of Controls to open Your recalled hand.\n\nThese are your seat's cards, leaders and spice reserve at the selected checkpoint, not its current inventory. Only your seat can see them, including items recorded before a replacement player took that seat.\n\nYou cannot play, rearrange or flip the contents, or withdraw spice.",
      anchor: { kind: 'page', element: recallElement('[data-own-token]') },
      begin: () => undefined,
      done: () => Boolean(panel('hand')?.querySelector('[aria-label="Spice reserve balance"]')),
    }),
    recalling({
      id: 'recalled-side-table',
      task: 'Inspect your private side table',
      detail:
        'Press {J}, or open Controls and go left twice, to see your recalled private side table.\n\nThe Kwisatz Haderach tracker was already here at Storm. Its position and contents are frozen too. You can inspect your own recorded items, but cannot move, edit or peek at them.',
      anchor: { kind: 'page', element: recallElement('[data-compass-launcher]') },
      begin: () => undefined,
      done: () => Boolean(panel('hidden-zone')?.querySelector('figure')),
    }),
  ];
}

function historyTasks(snapshot: () => GameSnapshot, players: TablePlayers): GuideTask[] {
  const recalling = duringRecall(snapshot, players);
  return [
    recalling({
      id: 'shared-history',
      task: 'Slide through time',
      detail:
        'Press {Space}, {↑}, then {Space} to open Shared history. Drag the slider to another checkpoint. The arrows move one checkpoint at a time; turn numbers mark the start of each turn.\n\nAny seated player can change this selection. Everyone follows the same checkpoint, including their own recorded inventory. Your camera and panel positions stay personal.',
      anchor: {
        kind: 'page',
        element: () => historySlider() ?? document.querySelector(`${RECALL} [data-compass-launcher]`),
      },
      begin: () => snapshot().review?.step,
      done: (step) => snapshot().review?.step !== step && Boolean(historySlider()),
    }),
    recalling({
      id: 'earlier-checkpoint',
      task: 'Step back one checkpoint',
      detail:
        "Press Earlier checkpoint to return to Storm. The arrows move one saved checkpoint at a time.\n\nThe board and every seat's recorded inventory follow the shared selection. Changing checkpoints still makes no changes to the live game.",
      anchor: { kind: 'page', element: recallElement('[aria-label="Earlier checkpoint"]') },
      begin: () => undefined,
      done: () => snapshot().review?.step === 0 && Boolean(historySlider()),
    }),
  ];
}

function conversationTasks(snapshot: () => GameSnapshot, players: TablePlayers): GuideTask[] {
  const recalling = duringRecall(snapshot, players);
  return [
    recalling({
      id: 'recall-chat',
      task: 'Send a recall message',
      detail:
        'Click Recall chat to the right of Controls. Write a message about what you found and press {Enter} to send it. Use {Shift} + {Enter} for a new line.\n\nThe seated players share this chat. It is separate from normal table chat, and belongs only to this recall. All its messages and drafts disappear when recall closes.',
      anchor: {
        kind: 'page',
        element: () =>
          panel('recall-chat')?.querySelector('[aria-label="Message"]') ??
          document.querySelector(`${RECALL} [aria-label^="Recall chat"]`),
      },
      begin: () => {
        const watch = { submitted: false, saved: sentMessages(), stop: new AbortController() };
        document.addEventListener(
          'submit',
          (event) => {
            if (event.target instanceof Element && event.target.closest(`${RECALL} [data-window="recall-chat"]`)) {
              watch.saved = sentMessages();
              watch.submitted = true;
            }
          },
          { capture: true, signal: watch.stop.signal }
        );
        return watch;
      },
      done: (watch) => watch.submitted && sentMessages() > watch.saved,
      finish: (watch) => watch.stop.abort(),
    }),
  ];
}

function returnTasks(snapshot: () => GameSnapshot): GuideTask[] {
  return [
    task({
      id: 'return',
      task: 'Return to the game',
      detail:
        'Press Return to the game in the top right. Any seated player can end recall for everyone.\n\nPlay resumes at the live Spice Blow position. Looking at Storm did not undo anything. Your normal pinned panels return, and the recall chat and its drafts are discarded.',
      anchor: { kind: 'page', element: returnButton },
      begin: () => undefined,
      done: () =>
        !snapshot().review && phaseOf(snapshot).id === 'spice-blow' && document.querySelector(RECALL) === null,
    }),
  ];
}

function tasks(snapshot: () => GameSnapshot, players: TablePlayers): GuideTask[] {
  return [
    ...openingTasks(snapshot),
    consentTask(snapshot),
    ballotTask(snapshot, players),
    ...inspectionTasks(snapshot, players),
    ...historyTasks(snapshot, players),
    ...conversationTasks(snapshot, players),
    ...returnTasks(snapshot),
  ];
}

export const mentatRecall: ChapterScript = {
  slug: 'mentat-recall',
  checkpoint: 'turn-1-storm',
  playAs: 'House Atreides',
  hand,
  opening: (players) => {
    const seat = players.others()[0];
    if (seat) {
      players.act(seat, { kind: 'phase' });
    }
  },
  tasks,
  learned: [
    'Ask for Mentat recall through Controls; more than half the seated players must agree',
    'Recall inspects a saved position together without undoing moves',
    'Game contents are frozen; cameras, cursors and pings still work',
    'Your recalled hand, private side table and spice belong to your seat at that checkpoint',
    'Shared history moves everyone through the same checkpoints',
    'Recall chat uses Enter to send and Shift + Enter for a new line; its messages disappear on return',
    'Return to the game resumes live play and restores your normal panels',
  ],
};
