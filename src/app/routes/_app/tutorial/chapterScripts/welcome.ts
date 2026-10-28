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
      task: 'Welcome to the table',
      detail:
        "Welcome! I'll show you around the table and help you get comfortable.\n\nWant to hear the steps aloud? Press {Z} to turn speaking mode on or off.\n\nPress {Enter} when you're ready to start.",
      introducesSpeakingMode: true,
      anchor: { kind: 'page', element: () => null },
      ...pressEnter(),
    }),
    task({
      id: 'board',
      task: 'Meet Arrakis',
      detail:
        "Here's Arrakis, the board at the heart of your game.\n\nThis table is a sandbox: you can move pieces freely, and the players enforce the rules together.\n\nPress {Enter} to carry on.",
      anchor: { kind: 'table', point: () => [0, TABLE_SURFACE_Y, 0] },
      ...pressEnter(),
    }),
    task({
      id: 'players',
      task: 'Meet the players',
      detail: 'Those faction tokens around the board belong to the players.\n\nClick one to take a closer look.',
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
      task: 'Where are we in the game?',
      detail:
        'The top left tells you the current phase and turn, so you can always find your place.\n\nPress {Enter} to carry on.',
      anchor: { kind: 'page', element: element('.seated-phase-status') },
      ...pressEnter(),
    }),
    task({
      id: 'phases',
      task: 'See the phases',
      detail:
        'The tracker above the board shows where you are in the turn, along with the phases before and after it.\n\nPress {Enter} to carry on.',
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
      task: 'See the turn',
      detail:
        'Just left of the phase tracker is the turn tracker. Its pointer shows the current turn.\n\nPress {Enter} to carry on.',
      anchor: { kind: 'table', point: () => trackerAt(snapshot, 'turn') },
      ...pressEnter(),
    }),
    task({
      id: 'next',
      task: 'Move to the next phase',
      detail:
        'Once everyone agrees the phase is finished, anyone can move the game on.\n\nPress Next phase in the top right and give it a try.',
      anchor: { kind: 'page', element: nextPhaseButton },
      begin: () => undefined,
      done: () => phaseOf(snapshot).id !== 'storm',
    }),
    task({
      id: 'settings',
      task: 'Open the game menu',
      detail:
        "Need to change a setting? The gear in the top right is where you'll find the game menu.\n\nClick it to open it.",
      anchor: { kind: 'page', element: gameMenuButton },
      begin: () => ({ menu: menu.begin(), stop: guardNextPhase() }),
      done: (watch) => menu.done(watch.menu),
      finish: (watch) => watch.stop.abort(),
    }),
    task({
      id: 'share',
      task: 'Share the game',
      detail:
        'A game is better with friends! In a real game, you can share this link to invite them to play or watch.\n\nClick Copy game link to finish the tutorial.',
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
