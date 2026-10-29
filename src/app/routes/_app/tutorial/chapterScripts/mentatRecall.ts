import type { GameSnapshot } from '@shared/play/protocol';
import { reviewRunning } from '@shared/play/review';

import type { GuideTask } from '../TutorialGuide';
import type { ChapterScript, TablePlayers } from './chapterScript';
import { element, phaseOf, pressEnter, task } from './guideChecks';
import { openRecallHistory, recallHand } from './mentatRecallOpening';

/* Normal windows stay mounted during recall; only this controller shows the historical contents. */
const RECALL = '[data-recall-controls="true"]';
const panel = (key: string) => document.querySelector(`${RECALL} [data-window="${key}"]`);
const historySlider = () => panel('recall-history')?.querySelector('[role="slider"]');
const newestStep = (snapshot: () => GameSnapshot) => snapshot().reviewCheckpoints!.at(-1)!.step;
const recallElement = (selector: string) => () => document.querySelector(`${RECALL} ${selector}`);
const returnButton = () => document.querySelector('[data-recall-return]');
const loaded = () =>
  document.querySelector(RECALL) !== null &&
  document.querySelector(`${RECALL} [aria-label="Loading recalled inventory"], ${RECALL} [role="alert"]`) === null &&
  panel('recall-history')?.querySelector('[role="status"]') == null;
const FIRST_RECALL_RECOVERY =
  'If recall closes early, ask for Storm again in the Mentat recall window. If it is closed, open it through Controls. The practice players will agree.';
const LATER_RECALL_RECOVERY =
  'If recall closes early, open Mentat recall through Controls if needed. Move its slider all the way right and ask for Turn 3, Spice Blow. The practice players will agree. Shared history opens with the new recall; pin it to the bottom right, then continue this exercise. If you closed it, reopen it with {Space}, {↑}, {Space}.';

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
function duringRecall(snapshot: () => GameSnapshot, players: TablePlayers, recovery = FIRST_RECALL_RECOVERY) {
  return <Baseline>(definition: GuideTask<Baseline>): GuideTask => {
    const anchor = definition.anchor;
    return task({
      ...definition,
      detail: `${definition.detail}\n\n${recovery}`,
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

/* Only the saved own-message badge marks delivery; message text cannot finish the exercise. */
const sentMessages = () =>
  panel('recall-chat')?.querySelectorAll('[aria-label="Conversation history"] [data-saved-own-message]').length ?? 0;

function openingTasks(snapshot: () => GameSnapshot): GuideTask[] {
  return [
    task({
      id: 'purpose',
      task: 'Look back together',
      detail:
        'Not sure what the board showed earlier? Mentat recall lets the table inspect a saved checkpoint together. It can settle a dispute or help you retrace what happened.\n\nThis table has played two turns. The storm moved, cards were dealt and played, spice was spent and the private tracker advanced. There are 24 checkpoints to explore; live play is now at Turn 3, Spice Blow.\n\nRecall does not undo moves or let you change the past. Press {Enter} to try it.',
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
        'Press {Space}, type Mentat recall and confirm with {Enter}.\n\nMove the checkpoint slider all the way left to Turn 1, Storm, then press Ask the table to recall. You can focus the slider and press {Home} to reach the first checkpoint. If you pick the wrong checkpoint, withdraw the request and try again.',
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
        "Click your faction token to the left of Controls to open Your recalled hand.\n\nAt Turn 1, Storm, your reserve was 10 spice and you had no Treachery cards. These are your seat's recorded items, including anything from before a replacement player took the seat. Only your seat can see them.\n\nYou cannot play, rearrange or flip the contents, or withdraw spice. Later checkpoints will show a different hand and reserve.",
      anchor: { kind: 'page', element: recallElement('[data-own-token]') },
      begin: () => undefined,
      done: () => Boolean(panel('hand')?.querySelector('[aria-label="Spice reserve balance"]')),
    }),
    recalling({
      id: 'recalled-side-table',
      task: 'Inspect your private side table',
      detail:
        'Press {J}, or open Controls and go left twice, to see your recalled private side table.\n\nThe Kwisatz Haderach counter was on space 1 at Turn 1, Storm. Its recorded position is frozen too. You can inspect your own items, but cannot move, edit or peek at them.\n\nRemember that counter position; you will compare it with a later checkpoint.',
      anchor: { kind: 'page', element: recallElement('[data-compass-launcher]') },
      begin: () => undefined,
      done: () => Boolean(panel('hidden-zone')?.querySelector('figure')),
    }),
  ];
}

function sharedHistoryTask(snapshot: () => GameSnapshot, players: TablePlayers): GuideTask {
  return duringRecall(
    snapshot,
    players
  )({
    id: 'shared-history',
    task: 'Slide through time',
    detail:
      'Press {Space}, {↑}, then {Space} to open Shared history. Pin it to the bottom right so you can inspect inventory beside it.\n\nScrub through the checkpoints, then move all the way right to Turn 3, Spice Blow. Turn numbers mark each turn; there are also checkpoints after factions finish Shipment and Movement.\n\nEveryone follows the same checkpoint, including their recorded inventory. Any seated player can change it. Cameras and panel positions stay personal.',
    anchor: {
      kind: 'page',
      element: () => historySlider() ?? document.querySelector(`${RECALL} [data-compass-launcher]`),
    },
    begin: () => ({ step: snapshot().review?.step, moved: false }),
    done: (watch) => {
      watch.moved ||= snapshot().review?.step !== watch.step;
      return (
        watch.moved &&
        snapshot().review?.step === newestStep(snapshot) &&
        panel('recall-history')?.getAttribute('data-side') === 'right'
      );
    },
  });
}

function laterHandTask(snapshot: () => GameSnapshot, players: TablePlayers): GuideTask {
  return duringRecall(
    snapshot,
    players,
    LATER_RECALL_RECOVERY
  )({
    id: 'later-hand',
    task: 'Compare your later hand',
    detail:
      'Open Your recalled hand again with your faction token.\n\nAt Turn 3, Spice Blow, your reserve is 6 spice and you have two Treachery cards. Bidding and battles changed both during the two completed turns. The storm and public cards have changed on the table too.\n\nThese later contents are just as frozen as the earlier ones. Sliding changes which record you inspect; it never edits that record.',
    anchor: { kind: 'page', element: recallElement('[data-own-token]') },
    begin: () => undefined,
    done: () =>
      snapshot().review?.step === newestStep(snapshot) &&
      panel('hand')?.querySelector('[aria-label="Spice reserve balance"]')?.textContent === '6',
  });
}

function laterCounterTask(snapshot: () => GameSnapshot, players: TablePlayers): GuideTask {
  return duringRecall(
    snapshot,
    players,
    LATER_RECALL_RECOVERY
  )({
    id: 'later-counter',
    task: 'Compare the private tracker',
    detail:
      'Press {J} to reopen your recalled private side table.\n\nThe counter is now on space 6 of the Kwisatz Haderach card. It was on space 1 at the first checkpoint. Private positions travel through history along with the public board and hand.\n\nYou still cannot drag the counter or change anything on this recorded side table.',
    anchor: { kind: 'page', element: recallElement('[data-compass-launcher]') },
    begin: () => undefined,
    done: () =>
      snapshot().review?.step === newestStep(snapshot) &&
      Boolean(
        panel('hidden-zone')?.querySelector(
          'img[alt="Atreides Battle Loss Counter"], [aria-label^="Atreides Battle Loss Counter"]'
        )
      ),
  });
}

function earlierCheckpointTask(snapshot: () => GameSnapshot, players: TablePlayers): GuideTask {
  return duringRecall(
    snapshot,
    players,
    LATER_RECALL_RECOVERY
  )({
    id: 'earlier-checkpoint',
    task: 'Step back one checkpoint',
    detail:
      "Press Earlier checkpoint in the pinned Shared history panel to reach Turn 3, Storm. The storm has not yet made its latest move at this checkpoint.\n\nThe arrows move one saved checkpoint at a time. The board and every seat's recorded inventory follow the shared selection, with no changes to the live game.",
    anchor: {
      kind: 'page',
      element: () =>
        panel('recall-history')?.querySelector('[aria-label="Earlier checkpoint"]') ??
        document.querySelector(`${RECALL} [data-compass-launcher]`),
    },
    begin: () => undefined,
    done: () => snapshot().review?.step === newestStep(snapshot) - 1 && Boolean(historySlider()),
  });
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
        'Press Return to the game in the top right. Any seated player can end recall for everyone.\n\nPlay resumes at Turn 3, Spice Blow, with the same board, hand, spice and private tracker as before recall. Looking at older checkpoints did not undo anything. Your normal pinned panels return, and the recall chat and its drafts are discarded.',
      anchor: { kind: 'page', element: returnButton },
      begin: () => undefined,
      done: () =>
        !snapshot().review &&
        phaseOf(snapshot).turn === 3 &&
        phaseOf(snapshot).id === 'spice-blow' &&
        document.querySelector(RECALL) === null,
    }),
  ];
}

function tasks(snapshot: () => GameSnapshot, players: TablePlayers): GuideTask[] {
  return [
    ...openingTasks(snapshot),
    consentTask(snapshot),
    ballotTask(snapshot, players),
    ...inspectionTasks(snapshot, players),
    sharedHistoryTask(snapshot, players),
    laterHandTask(snapshot, players),
    laterCounterTask(snapshot, players),
    earlierCheckpointTask(snapshot, players),
    ...conversationTasks(snapshot, players),
    ...returnTasks(snapshot),
  ];
}

export const mentatRecall: ChapterScript = {
  slug: 'mentat-recall',
  checkpoint: 'turn-1-storm',
  playAs: 'House Atreides',
  hand: recallHand,
  opening: openRecallHistory,
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
