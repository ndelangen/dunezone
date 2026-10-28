import { STANDARD_PHASES, tableProgressFor } from '@shared/play/phases';
import type { GameSnapshot } from '@shared/play/protocol';
import { BOARD_RADIUS } from '@shared/play/tableGeometry';
import type { Vector3Tuple } from 'three';

import { wheelPixels } from '@app/widgets/tabletop/wheelPixels';

import type { Landing } from '../table/localTable';
import type { GuideTask, GuideView } from '../TutorialGuide';

/* What the chapters check on the table and the page, shared so each chapter reads only as its tasks. */

export type Piece = GameSnapshot['table']['pieces'][number];

export const at = (piece: { position: readonly number[] } | undefined) =>
  piece ? (piece.position as Vector3Tuple) : null;
export const element = (selector: string) => () => document.querySelector(selector);
/* The last match, as a piece just taken into the hand is listed last. */
/** The button with exactly this text inside a window, rather than the window's own frame buttons that come first. */
export const buttonIn = (windowKey: string, text: string) => (): HTMLButtonElement | null =>
  [...document.querySelectorAll<HTMLButtonElement>(`[data-window="${windowKey}"] button`)].find(
    (button) => (button.textContent?.trim() || button.getAttribute('aria-label')) === text
  ) ?? null;

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

/*
 * A task that only shows something has nothing to do on the table, so the player moves on with Enter.
 * The press is counted from the moment the task starts, and taken, so it never also presses a button
 * the focus was left on, such as Next phase; in a text field and on the tutorial's own rail Enter keeps its own meaning.
 * A caller can reject a press while its action is unavailable; Enter is still taken so it cannot activate a table control.
 */
export const pressEnter = (accept: () => boolean = () => true) => ({
  begin: () => {
    const watch = { pressed: false, stop: new AbortController() };
    const press = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.key !== 'Enter' || target?.closest('input, textarea, [contenteditable="true"], [data-tutorial-free]')) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      /* A held Enter is taken too, so it never presses a focused button, but only a fresh press moves on. */
      if (!event.repeat && accept()) {
        watch.pressed = true;
      }
    };
    window.addEventListener('keydown', press, { capture: true, signal: watch.stop.signal });
    return watch;
  },
  done: (watch: { pressed: boolean }) => watch.pressed,
  finish: (watch: { stop: AbortController }) => watch.stop.abort(),
});

/** The phase the game is in, by its id, and the turn; a fixture without its own turn plays the standard one. */
export const phaseOf = (snapshot: () => GameSnapshot) => {
  const progress = tableProgressFor(snapshot().phase, snapshot().phases ?? STANDARD_PHASES);
  return { id: progress.activePhaseId, turn: progress.turn };
};

/** The header's Next phase button. */
export const nextPhaseButton = () =>
  [...document.querySelectorAll('[aria-label="Phase navigation"] button')].find(
    (button) => button.textContent?.trim() === 'Next phase'
  ) ?? null;

/** The gear's game menu button in the header. */
export const gameMenuButton = () => document.querySelector<HTMLElement>('[aria-label="Game menu"]');

/** Closes the game menu if it is open, so it never stands over the chapter's closing screen. */
export const closeGameMenu = () => {
  if (document.querySelector('[role="menu"]')) {
    gameMenuButton()?.click();
  }
};

/*
 * A carry that grew while held, set down since the task began with every item it held in one of `stacks`.
 * {T}, or a right-click, while carrying takes the next piece from the stack under the pointer, so the carry growing is the take itself;
 * a key pressed with nothing carried, a stack picked up whole, or pieces dropped one at a time never count.
 * The table records each take and drop as it answers it, so a gesture faster than the guide's tick is still seen.
 */
export const grownCarryLanded = (landings: () => readonly Landing[], stacks: () => readonly Piece[]) => ({
  begin: () => landings().length,
  done: (seen: number) =>
    landings()
      .slice(seen)
      .some((landing) => landing.grew && stacks().some((stack) => holdsAll(stack, landing.itemIds))),
});

/** Whether a stack holds every one of these items, by id. */
export const holdsAll = (stack: Piece, itemIds: Iterable<string>) =>
  [...itemIds].every((id) => stack.items.some((item) => item.id === id));

/*
 * A press outside a piece's ring menu closes it, as a press anywhere else on the page would; a step that ends in the ring leaves it shut.
 * It is sent only while a ring is open, so no other window listener ever takes it for the player's own press.
 */
export const closePieceMenu = () => {
  if (document.querySelector('[data-radial-menu]')) {
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  }
};
