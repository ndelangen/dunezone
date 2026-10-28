import { factionTokenRingAngle, factionTokenStackKey, isFactionToken } from '@shared/play/factionToken';
import { STANDARD_PHASES } from '@shared/play/phases';
import type { GameSnapshot } from '@shared/play/protocol';
import { TABLE_SURFACE_Y } from '@shared/play/tableGeometry';
import { trackerArcSlots } from '@shared/play/tableTrackers';
import { TUTORIAL_RECIPE } from '@shared/tutorial/recipe';
import type { Vector3Tuple } from 'three';

import type { GuideTask } from '../TutorialGuide';
import type { ChapterScript } from './chapterScript';
import { closeGameMenu, element, gameMenuButton, nextPhaseButton, phaseOf, pressEnter, task } from './guideChecks';

/*
 * "Welcome": what is on the screen and what each part means, before any of the controls.
 * The rail points at each part in turn: the board, each player's faction token on a tour round the table,
 * the phase and turn in the corner chip, the phase discs and the turn wheel along the board's far edge, Next phase, and the gear. Nothing on the table checks the rules or takes a step for the players,
 * so the player moves the game on with Next phase, and copies the game's link from the gear to invite the others;
 * everything else is read and passed with Enter.
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

/* The gear menu's button that copies the game's link, once the menu is open. */
const copyLink = () =>
  [...document.querySelectorAll('[role="menu"] button')].find((button) =>
    /game link/i.test(button.textContent ?? '')
  ) ?? null;

/* How long the arrow rests on each stop as it goes round once. */
const TOUR_STOP_MS = 1200;

/*
 * The arrow's tour of a row of things on the table: one stop at a time, once through, then it rests on the last.
 * It runs by the clock from the moment its step starts, so Enter at any point ends the step and the tour with it.
 */
function tour(stops: () => readonly Vector3Tuple[]) {
  let startedAt = 0;
  const point = (): Vector3Tuple | null => {
    const all = stops();
    const step = Math.floor((performance.now() - startedAt) / TOUR_STOP_MS);
    return all[Math.min(step, all.length - 1)] ?? null;
  };
  const enter = pressEnter();
  return {
    point,
    begin: () => {
      startedAt = performance.now();
      return enter.begin();
    },
    done: enter.done,
    finish: enter.finish,
  };
}

const pointOf = (position: readonly number[]): Vector3Tuple => [position[0]!, position[1]!, position[2]!];

/* Every faction token once round the table, from the one after the learner's, so the tour ends on theirs. */
function tokenStops(snapshot: () => GameSnapshot): Vector3Tuple[] {
  const tokens = snapshot().table.pieces.filter(isFactionToken);
  const mine = snapshot().roster?.seats.find((seat) => seat.id === TUTORIAL_RECIPE.learner)?.faction?.id;
  const own = tokens.find((piece) => mine !== undefined && piece.stackKey === factionTokenStackKey(mine));
  const from = own ? factionTokenRingAngle(own.position as Vector3Tuple) : 0;
  const round = (piece: (typeof tokens)[number]) =>
    (factionTokenRingAngle(piece.position as Vector3Tuple) - from + Math.PI * 4 - 1e-6) % (Math.PI * 2);
  return [...tokens].sort((a, b) => round(a) - round(b)).map((piece) => pointOf(piece.position));
}

/* Every phase disc in the turn's order, then the disc of the phase the game is in. */
function phaseStops(snapshot: () => GameSnapshot): Vector3Tuple[] {
  const discs = trackerArcSlots((snapshot().phases ?? STANDARD_PHASES).length)
    .filter((slot) => slot.kind === 'phase')
    .map((slot) => pointOf(slot.position));
  const current = trackerAt(snapshot, 'phase');
  return current ? [...discs, current] : discs;
}

function tasks(snapshot: () => GameSnapshot): GuideTask[] {
  const tokens = tour(() => tokenStops(snapshot));
  const phases = tour(() => phaseStops(snapshot));
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
      id: 'players',
      task: 'The players',
      detail:
        'Every player has a faction token at their place around the board; the arrow goes round them once, ending on yours. Press {Enter} to go on.',
      anchor: { kind: 'table', point: tokens.point },
      begin: tokens.begin,
      done: tokens.done,
      finish: tokens.finish,
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
        'The row of discs along the far edge of the board is the turn’s phases; the arrow walks them in order, ending on the lit disc, the phase the game is in now. Press {Enter} to go on.',
      anchor: { kind: 'table', point: phases.point },
      begin: phases.begin,
      done: phases.done,
      finish: phases.finish,
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
      id: 'share',
      task: 'Copy the game link',
      detail:
        'The gear beside Next phase holds the game’s settings: the table’s lighting and labels, how fast the camera pans, and leaving your seat. It also holds the game’s link, which is how you invite the others: open the gear and press Copy game link, then send it to them.',
      anchor: { kind: 'page', element: () => copyLink() ?? gameMenuButton() },
      /*
       * Next phase can keep the focus once pressed, so a habitual Enter here would move the game on again:
       * the step lets go of that focus and takes Enter off the button while it runs.
       */
      begin: () => {
        const watch = { refused: false, stop: new AbortController() };
        const guard = (event: KeyboardEvent) => {
          if (event.key === 'Enter' && event.target === nextPhaseButton()) {
            event.preventDefault();
            event.stopPropagation();
          }
        };
        window.addEventListener('keydown', guard, { capture: true, signal: watch.stop.signal });
        (nextPhaseButton() as HTMLElement | null)?.blur();
        return watch;
      },
      done: (watch: { refused: boolean; stop: AbortController }) => {
        if ((copyLink()?.textContent ?? '').includes('copied')) {
          return true;
        }
        /* A browser that refuses the clipboard shows the link to copy by hand; the step waits until the menu closes, so the player can. */
        watch.refused ||= [...document.querySelectorAll('[role="alert"]')].some((alert) =>
          alert.textContent?.startsWith('Could not copy')
        );
        return watch.refused && copyLink() === null;
      },
      /* The open menu would stand over the chapter's closing screen, so the gear closes it once the link is copied. */
      finish: (watch: { refused: boolean; stop: AbortController }) => {
        watch.stop.abort();
        closeGameMenu();
      },
    }),
  ];
}

/* One line for each part of the chapter, in the order it was played. */
const learned = [
  'Each player’s faction token marks their place around the board',
  'The chip in the top left shows the turn and the phase',
  'The discs along the board are the phases; the numbered wheel counts the turns',
  'Play is a table, not a referee: you move the game on with Next phase',
  'The gear holds the game’s settings and the link that invites the others',
];

export const welcome: ChapterScript = { slug: 'welcome', checkpoint: 'turn-1-storm', tasks, learned };
