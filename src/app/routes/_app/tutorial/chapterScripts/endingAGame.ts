import type { GameSnapshot } from '@shared/play/protocol';

import type { GuideTask } from '../TutorialGuide';
import type { ChapterScript } from './chapterScript';
import { element, pressEnter, task } from './guideChecks';

/*
 * "Ending a game": the result from Determine winner to Continue playing. Mentat recall and player removal each have their own chapter.
 * The others played the turn through to the Mentat Pause before the chapter opens, as only that phase offers Determine winner.
 * One player declares the result and nobody confirms it, so the chapter declares, then continues the game as anyone may.
 */

/* The Mentat Pause is the turn's ninth phase. */
const PHASES_TO_PAUSE = 8;

/* A button by the words on it, or by its name when it shows only an icon. */
const buttonNamed = (name: string) => () =>
  [...document.querySelectorAll('button')].find(
    (button) => button.textContent?.trim() === name || button.getAttribute('aria-label') === name
  ) ?? null;

function tasks(snapshot: () => GameSnapshot): GuideTask[] {
  return [
    task({
      id: 'determine',
      task: 'Determine the winner',
      detail:
        "You've reached Mentat Pause. If the game is over, it's time to work out who won.\n\nPress {Space}, type Phase and confirm with {Enter}. Choose Determine winner in the window.\n\nPlayers with predictions will be reminded to reveal them.",
      anchor: {
        kind: 'page',
        element: () =>
          buttonNamed('Determine winner')() ??
          document.querySelector('[aria-label="Search controls"], [data-compass-launcher]'),
      },
      begin: () => undefined,
      done: () => Boolean(snapshot().ending),
    }),
    task({
      id: 'declare',
      task: 'Declare the result',
      detail:
        'Agree on the winner with the other players first.\n\nIn the Result window, leave Faction selected, choose a Winning faction and press Declare. This records the result immediately, without a vote.',
      anchor: { kind: 'page', element: element('[data-window="result"]') },
      begin: () => undefined,
      done: () => snapshot().stage === 'finished',
    }),
    task({
      id: 'replay',
      task: 'Look back at the game',
      detail:
        'Want to revisit how it unfolded? Press {Space}, type Replay and confirm with {Enter}.\n\nChoose Replay from start to see the saved public positions. Private hands and plans stay hidden.',
      anchor: {
        kind: 'page',
        element: () => buttonNamed('Replay from start')() ?? document.querySelector('[data-compass-launcher]'),
      },
      begin: () => undefined,
      done: () => buttonNamed('Return to live')() !== null,
    }),
    task({
      id: 'replay-step',
      task: 'Step through the saved phases',
      detail: 'Press Later phase to see the next saved position.\n\nReplay does not change the live table.',
      anchor: { kind: 'page', element: buttonNamed('Later phase') },
      begin: () => undefined,
      /* Earlier phase opens only after replay leaves its first checkpoint, even if the learner steps ahead immediately. */
      done: () => buttonNamed('Earlier phase')()?.disabled === false,
    }),
    task({
      id: 'live',
      task: 'Return to the live table',
      detail: 'Press Return to live to leave replay. The game still has the result you declared.',
      anchor: { kind: 'page', element: buttonNamed('Return to live') },
      begin: () => undefined,
      done: () => buttonNamed('Return to live')() === null && buttonNamed('Continue playing')() !== null,
    }),
    task({
      id: 'continue',
      task: 'Keep playing',
      detail:
        "Decided the game isn't over after all? Press Continue playing in the top right to clear the result and return to Mentat Pause.",
      anchor: { kind: 'page', element: buttonNamed('Continue playing') },
      begin: () => undefined,
      done: () => snapshot().stage === 'play' && !snapshot().result,
    }),
    task({
      id: 'replay-closed',
      task: 'Replay closes when play resumes',
      detail:
        'Replay is only available after a game ends. To inspect an earlier position during play, use Mentat recall, covered in its own chapter.\n\nPress {Enter} to finish.',
      anchor: { kind: 'page', element: element('[aria-label="Phase navigation"]') },
      ...pressEnter(),
    }),
  ];
}

/* One line for each part of the chapter, in the order it was played. */
const learned = [
  'Determine winner waits in the Mentat Pause',
  'One player declares the result, and that finishes the game',
  'Replay shows saved public positions once the game is finished',
  'Return to live leaves the result in place',
  'Continue playing takes a result back and closes replay',
];

export const endingAGame: ChapterScript = {
  slug: 'ending-a-game',
  checkpoint: 'turn-1-storm',
  opening: (players) => {
    const seat = players.others()[0];
    for (let step = 0; seat && step < PHASES_TO_PAUSE; step++) {
      players.act(seat, { kind: 'phase' });
    }
  },
  tasks,
  learned,
};
