import type { GameSnapshot } from '@shared/play/protocol';

import type { GuideTask } from '../TutorialGuide';
import type { ChapterScript } from './chapterScript';
import { element, nextPhaseButton, openedWindow, phaseOf, task } from './guideChecks';

/*
 * Chapter 1, "Welcome": what Play is before any of its controls. It is a table, not a referee: nothing checks the rules
 * or takes a step for the players, so they move the game on themselves. Every control lives on the compass, and every
 * window says what it is for behind its (?). A bug goes in from the game it happened in, with Report a bug on the compass;
 * a tutorial table is not a game, so the chapter names it rather than sending one.
 */

const COMPASS = 'dialog[aria-label="Controls compass"][open]';
const HELP = '[data-window] [role="img"][aria-label="Help"]';

function tasks(snapshot: () => GameSnapshot): GuideTask[] {
  return [
    task({
      id: 'next',
      task: 'Move the game on yourself',
      detail:
        'Play is a table, not a referee: it never checks the rules or takes a step for you. The players move the pieces and the game, as around a real board. Press Next phase, top right.',
      anchor: { kind: 'page', element: nextPhaseButton },
      begin: () => undefined,
      done: () => phaseOf(snapshot).id !== 'storm',
    }),
    task({
      id: 'compass',
      task: 'Open the controls',
      detail:
        'Every window and command sits on one compass. Press {Space} on your keyboard, or click Controls at the bottom.',
      anchor: { kind: 'page', element: element('[data-compass-launcher]') },
      begin: () => undefined,
      done: () => document.querySelector(COMPASS) !== null,
    }),
    task({
      id: 'help',
      task: 'Ask a window what it is for',
      detail:
        'Pick any tile to open its window. Each window has a (?) beside its name: point at it to read what the window is for.',
      anchor: { kind: 'page', element: () => document.querySelector(HELP) ?? document.querySelector(COMPASS) },
      begin: () => undefined,
      done: () => document.querySelector(`${HELP}[aria-describedby]:hover, ${HELP}:focus`) !== null,
    }),
    task({
      id: 'bug',
      task: 'Know where bugs go',
      detail:
        'Something broken in a game? Open the controls there, type bug and pick Report a bug: your words go in with the game as it stands, so we can see what you saw. Tutorials are not games, so there is none here. Press {Space} once more to finish.',
      anchor: { kind: 'page', element: element('[data-compass-launcher]') },
      ...openedWindow(() => document.querySelector(COMPASS) !== null),
    }),
  ];
}

/* One line for each part of the chapter, in the order it was played. */
const learned = [
  'Play is a table, not a referee: you move the pieces and the game',
  '{Space} opens the controls',
  'The (?) beside a window’s name says what it is for',
  'In a game, Report a bug on the controls sends your words with the game',
];

export const welcome: ChapterScript = { slug: 'welcome', checkpoint: 'turn-1-storm', tasks, learned };
