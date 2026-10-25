import type { GameSnapshot } from '@shared/play/protocol';
import { BOARD_RADIUS } from '@shared/play/tableGeometry';
import type { Vector3Tuple } from 'three';

import { wheelPixels } from '@app/widgets/tabletop/wheelPixels';

import type { GuideTask, GuideView } from '../TutorialGuide';

/* What the chapters check on the table and the page, shared so each chapter reads only as its tasks. */

export type Piece = GameSnapshot['table']['pieces'][number];

export const at = (piece: { position: readonly number[] } | undefined) =>
  piece ? (piece.position as Vector3Tuple) : null;
export const element = (selector: string) => () => document.querySelector(selector);
/* The last match, as a piece just taken into the hand is listed last. */
export const lastElement = (selector: string) => () => [...document.querySelectorAll(selector)].at(-1) ?? null;

/* Each task keeps its own kind of baseline; the guide only hands it back. */
export const task = <Baseline>(definition: GuideTask<Baseline>) => definition as unknown as GuideTask;

/** Whether a compass window shows, in the centre or pinned in a slot. */
export const windowShown = (key: string) => () => document.querySelector(`[data-window="${key}"]`) !== null;

/*
 * A window task counts the player opening that window from the moment the task starts, so one left open by an earlier
 * run does not count until it is closed and opened again.
 */
export const openedWindow = (open: () => boolean) => ({
  begin: () => ({ was: open(), closed: false }),
  done: (watch: { was: boolean; closed: boolean }) => {
    const shown = open();
    if (!shown) {
      watch.closed = true;
    }
    return shown && (watch.closed || !watch.was);
  },
});

/* With the compass open the arrow points at one of its tiles, otherwise at the button that opens it. */
export const viaCompass = (spot: string) => () =>
  document.querySelector(
    document.querySelector('dialog[aria-label="Controls compass"]')
      ? `dialog[aria-label="Controls compass"] [data-spot="${spot}"]`
      : '[data-compass-launcher]'
  );

/*
 * Holding Alt over a card or token shows it flat beside the pointer; the close-up's own mark says it is showing.
 * The task counts once the close-up has shown and closed again, so it does not tick over while the player is still reading it.
 */
export const closeUpShown = () => ({
  begin: () => ({ seen: false }),
  done: (watch: { seen: boolean }) => {
    const showing = document.querySelector('[data-piece-close-up]') !== null;
    watch.seen ||= showing;
    return watch.seen && !showing;
  },
});

/*
 * Spice cards lying face up on their own. The table hands out cards under handles that change as they move,
 * so cards are counted by what they show rather than followed by id; a whole deck turned over is one pile, so it does not count.
 */
export const singleSpiceFaceUp = (pieces: readonly Piece[]) =>
  pieces.filter(
    (piece) => piece.items.length === 1 && piece.items[0]!.faceUp && piece.items[0]!.artwork?.type === 'card-spice'
  ).length;

/*
 * The ruleset's decks are keyed by their asset, so they are found where the table lays them out:
 * Treachery on the left of the table and Spice on the right, with the off-table stores left out.
 */
export const tableDeck = (snapshot: () => GameSnapshot, side: 'left' | 'right') =>
  snapshot().table.pieces.find(
    (piece) =>
      !piece.inventory &&
      piece.stackKey?.startsWith('deck:') &&
      Math.abs(piece.position[0]) <= BOARD_RADIUS * 2 &&
      (side === 'left' ? piece.position[0] < 0 : piece.position[0] > 0)
  );

export const onBoard = (piece: { position: readonly number[] }) =>
  Math.hypot(piece.position[0]!, piece.position[2]!) < BOARD_RADIUS;

/* The camera dial marks the view it shows, so a view the player chose early, even during the last task's tick, still counts. */
const showing = (view: string) => () =>
  document.querySelector(`[aria-label^="Focus on ${view}"]`)?.getAttribute('aria-pressed') === 'true';

/* A camera dial task: the arrow points at the dial's button for that view, and the task is done once the dial shows it. */
export const dialTask = (id: string, view: string, text: string, detail: string) =>
  task({
    id,
    task: text,
    detail,
    anchor: { kind: 'page', element: element(`[aria-label^="Focus on ${view}"]`) },
    begin: () => undefined,
    done: showing(view),
  });

/*
 * How far the camera looks to reach the table, along its own line of sight, so sliding the view sideways never changes it and only a zoom does.
 * A camera that looks level or up never reaches the table, and counts as its height instead.
 * The line of sight is read off the camera's world matrix, as Three's getWorldDirection does, so the chapter list that imports these
 * checks never loads Three itself, and the landing page keeps Three in the table's own chunk.
 */
const cameraDistance = ({ camera }: GuideView) => {
  if (!camera) {
    return 0;
  }
  camera.updateWorldMatrix(true, false);
  const [x, y, z] = camera.matrixWorld.elements.slice(8, 11) as [number, number, number];
  const down = y / Math.hypot(x, y, z);
  return down > 0.01 ? camera.position.y / down : camera.position.y;
};

/*
 * Scrolling counts only the player's own turns of the wheel over the table, measured from the camera's furthest point the other way
 * since their first turn, so the camera still gliding into its opening view never does the task for them, and a camera already
 * as far as it goes can be turned back and then the asked way. In is closer by a sixth or more, out is further by as much.
 */
export const scrolled = (direction: 'in' | 'out') => ({
  begin: (view: GuideView) => {
    const watch = { scrolled: 0, from: null as number | null, stop: new AbortController() };
    const furthest = direction === 'in' ? Math.max : Math.min;
    const scroll = (event: WheelEvent) => {
      if (!(event.target instanceof HTMLCanvasElement)) {
        return;
      }
      watch.from = furthest(watch.from ?? cameraDistance(view), cameraDistance(view));
      /* Counted in pixels as the camera counts it, whether the browser reports the turn in pixels, lines or pages. */
      const pixels = wheelPixels(event.deltaY, event.deltaMode) * (direction === 'in' ? 1 : -1);
      if (pixels > 0) {
        watch.scrolled += pixels;
      }
    };
    document.addEventListener('wheel', scroll, { capture: true, passive: true, signal: watch.stop.signal });
    return watch;
  },
  done: (watch: { scrolled: number; from: number | null }, view: GuideView) =>
    watch.from !== null &&
    watch.scrolled >= 200 &&
    (direction === 'in' ? cameraDistance(view) < watch.from * 0.85 : cameraDistance(view) > watch.from * 1.15),
  finish: (watch: { stop: AbortController }) => watch.stop.abort(),
});
