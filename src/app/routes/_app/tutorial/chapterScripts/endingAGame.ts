import type { GameSnapshot } from '@shared/play/protocol';

import type { GuideTask } from '../TutorialGuide';
import type { ChapterScript } from './chapterScript';
import { element, task } from './guideChecks';

/*
 * "Ending a game": agree on the winner, then declare the result.
 * The others played the turn through to the Mentat Pause before the chapter opens, as only that phase offers Determine winner.
 * One player declares the result after the table agrees on who won.
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
  ];
}

/* One line for each part of the chapter, in the order it was played. */
const learned = [
  'Determine winner waits in the Mentat Pause',
  'One player declares the result, and that finishes the game',
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
