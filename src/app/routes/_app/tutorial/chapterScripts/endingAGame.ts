import type { GameSnapshot } from '@shared/play/protocol';

import type { GuideTask } from '../TutorialGuide';
import type { ChapterScript } from './chapterScript';
import { element, task } from './guideChecks';

/*
 * Chapter 18, "Ending a game": the result from Determine winner to Continue playing. Voting a player off is chapter 19, Moderation.
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
      task: 'Start determining the winner',
      detail:
        'A game ends in the Mentat Pause, where the others have taken it. Open the Phase window by typing: press {Space}, type Phase and press {Enter}. Then press Determine winner. Every player now sees that you are deciding, and anyone holding a prediction is reminded to reveal it.',
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
      task: 'Declare a winner',
      detail:
        'In the Result window, keep Faction, pick the winner under Winning faction and press Declare, at the bottom of the window. Nobody votes or confirms: the table takes your word, so agree on it out loud first.',
      anchor: { kind: 'page', element: element('[data-window="result"]') },
      begin: () => undefined,
      done: () => snapshot().stage === 'finished',
    }),
    task({
      id: 'continue',
      task: 'Take it back and play on',
      detail:
        'Declared too soon? Continue playing, top right where Next phase was, returns the game to this Mentat Pause with the table as it was.',
      anchor: { kind: 'page', element: buttonNamed('Continue playing') },
      begin: () => undefined,
      done: () => snapshot().stage === 'play' && !snapshot().result,
    }),
  ];
}

/* One line for each part of the chapter, in the order it was played. */
const learned = [
  'Determine winner waits in the Mentat Pause',
  'One player declares the result, and that finishes the game',
  'Continue playing takes a result back',
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
