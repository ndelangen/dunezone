import { factionTokenRingAngle, factionTokenStackKey, isFactionToken } from '@shared/play/factionToken';
import { STANDARD_PHASES } from '@shared/play/phases';
import type { GameSnapshot } from '@shared/play/protocol';
import { TABLE_SURFACE_Y } from '@shared/play/tableGeometry';
import { trackerArcSlots } from '@shared/play/tableTrackers';
import { TUTORIAL_RECIPE } from '@shared/tutorial/recipe';
import type { Vector3Tuple } from 'three';

import type { GuideTask, GuideView } from '../TutorialGuide';
import type { ChapterScript } from './chapterScript';
import {
  closeGameMenu,
  element,
  gameMenuButton,
  nextPhaseButton,
  openedWindow,
  phaseOf,
  pressEnter,
  task,
} from './guideChecks';

/*
 * Welcome introduces the board and its trackers, then asks the learner to select a faction token,
 * advance the phase, open the game menu and copy the invitation link.
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

/* The arrow visits each stop once, starting with its task, then rests on the last stop. */
function tour(stops: () => readonly Vector3Tuple[]) {
  let startedAt = 0;
  const point = (): Vector3Tuple | null => {
    const all = stops();
    const step = Math.floor((performance.now() - startedAt) / TOUR_STOP_MS);
    return all[Math.min(step, all.length - 1)] ?? null;
  };
  return {
    point,
    begin: () => {
      startedAt = performance.now();
    },
  };
}

/* Count the token under this click, regardless of what was selected before the task began. */
function clickedFactionToken(snapshot: () => GameSnapshot, view: GuideView) {
  const watch = { clicked: false, stop: new AbortController() };
  document.addEventListener(
    'click',
    (event) => {
      if (event.button !== 0 || !(event.target instanceof HTMLCanvasElement)) {
        return;
      }
      const hit = view.pieceAt?.(event.clientX, event.clientY);
      watch.clicked ||= snapshot().table.pieces.some((piece) => piece.id === hit && isFactionToken(piece));
    },
    { capture: true, signal: watch.stop.signal }
  );
  return watch;
}

/* Enter must not advance another phase while the learner is finding the gear or copying the link. */
function guardNextPhase() {
  const stop = new AbortController();
  window.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Enter' && event.target === nextPhaseButton()) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    { capture: true, signal: stop.signal }
  );
  (nextPhaseButton() as HTMLElement | null)?.blur();
  return stop;
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
  const phaseRead = pressEnter();
  const menu = openedWindow(() => copyLink() !== null);
  return [
    task({
      id: 'speaking-mode',
      task: 'Hear the steps aloud',
      detail:
        'Welcome to the first tutorial.\n\nPress {Z} on your keyboard to toggle speaking mode on or off.\n\nPress {Enter} to start.',
      introducesSpeakingMode: true,
      anchor: { kind: 'page', element: () => null },
      ...pressEnter(),
    }),
    task({
      id: 'board',
      task: 'The board',
      detail:
        'The board shows the planet Arrakis.\n\nThis is a sandbox, so you can move troops however you want.\n\nThe players enforce the rules of the game.\n\nPress {Enter} to continue.',
      anchor: { kind: 'table', point: () => [0, TABLE_SURFACE_Y, 0] },
      ...pressEnter(),
    }),
    task({
      id: 'players',
      task: 'The players',
      detail: 'Each player has a faction token around the board.\n\nClick one of the faction tokens to continue.',
      anchor: { kind: 'table', point: tokens.point },
      begin: (view) => {
        tokens.begin();
        return clickedFactionToken(snapshot, view);
      },
      done: (watch) => watch.clicked,
      finish: (watch) => watch.stop.abort(),
    }),
    task({
      id: 'status',
      task: 'Phase and turn',
      detail: 'In the top left, you can see the current phase and turn.\n\nPress {Enter} to continue.',
      anchor: { kind: 'page', element: element('.seated-phase-status') },
      ...pressEnter(),
    }),
    task({
      id: 'phases',
      task: 'The phases of a turn',
      detail:
        'A second place to see the current phase is above the board.\n\nIt also shows past and future phases.\n\nPress {Enter} to continue.',
      anchor: { kind: 'table', point: phases.point },
      begin: () => {
        phases.begin();
        return phaseRead.begin();
      },
      done: phaseRead.done,
      finish: phaseRead.finish,
    }),
    task({
      id: 'turn',
      task: 'The turn tracker',
      detail:
        'The turn tracker is to the left of the phase tracker. Its pointer shows the current turn.\n\nPress {Enter} to continue.',
      anchor: { kind: 'table', point: () => trackerAt(snapshot, 'turn') },
      ...pressEnter(),
    }),
    task({
      id: 'next',
      task: 'Advance to the next phase',
      detail:
        'You and the other players decide when a phase is finished.\n\nPress "Next phase" in the top right to progress.',
      anchor: { kind: 'page', element: nextPhaseButton },
      begin: () => undefined,
      done: () => phaseOf(snapshot).id !== 'storm',
    }),
    task({
      id: 'settings',
      task: 'Open the game menu',
      detail: 'To change settings, look for the gear icon in the top right.\n\nClick it to open the menu.',
      anchor: { kind: 'page', element: gameMenuButton },
      begin: () => ({ menu: menu.begin(), stop: guardNextPhase() }),
      done: (watch) => menu.done(watch.menu),
      finish: (watch) => watch.stop.abort(),
    }),
    task({
      id: 'share',
      task: 'Copy the game link',
      detail:
        'What is Dune without its players?\n\nIn a real game, share this link with a friend to invite them to play or observe.\n\nClick "Copy game link" to complete this tutorial.',
      anchor: { kind: 'page', element: () => copyLink() ?? gameMenuButton() },
      begin: () => ({ refused: false, stop: guardNextPhase() }),
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
  'The speaking mode button or Z turns spoken instructions on or off',
  'Players enforce the rules in this sandbox',
  "Each player's faction token marks their place around the board",
  'The current phase and turn appear in the top left and on the trackers above the board',
  'Next phase moves the game on when everyone is ready',
  'The gear menu holds the settings and Copy game link',
];

export const welcome: ChapterScript = { slug: 'welcome', checkpoint: 'turn-1-storm', tasks, learned };
