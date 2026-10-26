import { STANDARD_PHASES } from '@shared/play/phases';
import type { GameSnapshot } from '@shared/play/protocol';
import { TABLE_SURFACE_Y } from '@shared/play/tableGeometry';
import { trackerArcSlots } from '@shared/play/tableTrackers';
import type { Vector3Tuple } from 'three';

import type { GuideTask } from '../TutorialGuide';
import type { ChapterScript } from './chapterScript';
import { element, nextPhaseButton, phaseOf, pressEnter, task } from './guideChecks';

/*
 * Chapter 1, "Welcome": what is on the screen and what each part means, before any of the controls.
 * The rail points at each part in turn: the board, the phase and turn in the corner chip, the phase discs and the turn wheel
 * along the board's far edge, Next phase, and the gear. Nothing on the table checks the rules or takes a step for the players,
 * so the one thing the player does is move the game on with Next phase; everything else is read and passed with Enter.
 * The controls compass waits for its own chapter.
 */

/* The disc for the phase the game is in, and the turn wheel, on the arc of trackers beside the board. */
function trackerAt(snapshot: () => GameSnapshot, kind: 'phase' | 'turn'): Vector3Tuple | null {
  const phases = snapshot().phases ?? STANDARD_PHASES;
  const current = phases.findIndex((phase) => phase.id === phaseOf(snapshot).id);
  const slot = trackerArcSlots(phases.length).find((candidate) =>
    kind === 'turn' ? candidate.kind === 'turn' : candidate.kind === 'phase' && candidate.phaseIndex === current
  );
  return slot ? [slot.position[0], slot.position[1], slot.position[2]] : null;
}

function tasks(snapshot: () => GameSnapshot): GuideTask[] {
  return [
    task({
      id: 'board',
      task: 'This is the table',
      detail:
        'The board, the decks and every player’s pieces lie on one shared table, as around a real board. Press {Enter} on your keyboard to go on.',
      anchor: { kind: 'table', point: () => [0, TABLE_SURFACE_Y, 0] },
      ...pressEnter(),
    }),
    task({
      id: 'status',
      task: 'Where the game stands',
      detail:
        'The chip in the top left shows the turn, out of the game’s last turn, and the phase the game is in, with that phase’s symbol. Press {Enter} to go on.',
      anchor: { kind: 'page', element: element('.seated-phase-status') },
      ...pressEnter(),
    }),
    task({
      id: 'phases',
      task: 'The phases of a turn',
      detail:
        'The row of discs along the far edge of the board is the turn’s phases, in order. The lit disc is the phase the game is in now. Press {Enter} to go on.',
      anchor: { kind: 'table', point: () => trackerAt(snapshot, 'phase') },
      ...pressEnter(),
    }),
    task({
      id: 'turn',
      task: 'The turn tracker',
      detail:
        'The numbered wheel at the left end of the row counts the turns; its pointer shows the turn the game is in. Press {Enter} to go on.',
      anchor: { kind: 'table', point: () => trackerAt(snapshot, 'turn') },
      ...pressEnter(),
    }),
    task({
      id: 'next',
      task: 'Move the game on yourself',
      detail:
        'Play is a table, not a referee: it never checks the rules or takes a step for you. When the table has done a phase, anyone presses Next phase, top right. Press it now, and watch the lit disc and the chip move on.',
      anchor: { kind: 'page', element: nextPhaseButton },
      begin: () => undefined,
      done: () => phaseOf(snapshot).id !== 'storm',
    }),
    task({
      id: 'gear',
      task: 'The gear',
      detail:
        'The gear beside Next phase holds the game’s settings: the table’s lighting and labels, how fast the camera pans, and leaving your seat. Press {Enter} to go on.',
      anchor: { kind: 'page', element: element('[aria-label="Game menu"]') },
      ...pressEnter(),
    }),
    task({
      id: 'bug',
      task: 'Know where bugs go',
      detail:
        'Something broken in a game? Report a bug from that game’s controls, which a later chapter opens: your words go in with the game as it stands, so we can see what you saw. Press {Enter} to finish.',
      anchor: { kind: 'page', element: element('[data-compass-launcher]') },
      ...pressEnter(),
    }),
  ];
}

/* One line for each part of the chapter, in the order it was played. */
const learned = [
  'The chip in the top left shows the turn and the phase',
  'The discs along the board are the phases; the numbered wheel counts the turns',
  'Play is a table, not a referee: you move the game on with Next phase',
  'The gear holds the game’s settings',
  'In a game, Report a bug on the controls sends your words with the game',
];

export const welcome: ChapterScript = { slug: 'welcome', checkpoint: 'turn-1-storm', tasks, learned };
