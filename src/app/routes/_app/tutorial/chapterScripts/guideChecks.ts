import type { GameSnapshot } from '@shared/play/protocol';
import { BOARD_RADIUS } from '@shared/play/tableGeometry';
import { Vector3 } from 'three';
import type { Vector3Tuple } from 'three';

import { wheelPixels } from '@app/widgets/tabletop/wheelPixels';

import type { GuideTask, GuideView } from '../TutorialGuide';

/* What the chapters check on the table and the page, shared so each chapter reads only as its tasks. */

export type Piece = GameSnapshot['table']['pieces'][number];

export const at = (piece: { position: readonly number[] } | undefined) =>
  piece ? (piece.position as Vector3Tuple) : null;
export const element = (selector: string) => () => document.querySelector(selector);
const tabSelected = (selector: string) => document.querySelector(selector)?.getAttribute('aria-selected') === 'true';

/* Each task keeps its own kind of baseline; the guide only hands it back. */
export const task = <Baseline>(definition: GuideTask<Baseline>) => definition as unknown as GuideTask;

/*
 * A tab task counts the player pressing or arrowing onto that tab from the moment the task starts, so a tab left open by an earlier run does not count.
 * The tab must end up open as well.
 */
export const pressedTab = (selector: string) => ({
  begin: () => {
    const watch = { pressed: false, stop: new AbortController() };
    const press = (event: Event) => {
      if (event.target instanceof Element && event.target.closest(selector)) {
        watch.pressed = true;
      }
    };
    /* The tabs open as the keyboard moves onto them as well, which comes as focus without a click. */
    for (const type of ['click', 'focusin']) {
      document.addEventListener(type, press, { capture: true, signal: watch.stop.signal });
    }
    return watch;
  },
  done: (watch: { pressed: boolean }) => watch.pressed && tabSelected(selector),
  finish: (watch: { stop: AbortController }) => watch.stop.abort(),
});

export const onBoard = (piece: { position: readonly number[] }) =>
  Math.hypot(piece.position[0]!, piece.position[2]!) < BOARD_RADIUS;

/* The camera dial marks the view it shows, so a view the player chose early, even during the last task's tick, still counts. */
const showing = (view: string) => () =>
  document.querySelector(`[aria-label^="Focus on ${view}"]`)?.getAttribute('aria-pressed') === 'true';

/* A camera dial task: the band points at the dial's button for that view, and the task is done once the dial shows it. */
export const dialTask = (id: string, view: string, text: string, detail: string) =>
  task({
    id,
    task: text,
    detail,
    anchor: { kind: 'page', element: element(`[aria-label^="Focus on ${view}"]`) },
    begin: () => undefined,
    done: showing(view),
  });

const forward = new Vector3();

/*
 * How far the camera looks to reach the table, along its own line of sight, so sliding the view sideways never changes it and only a zoom does.
 * A camera that looks level or up never reaches the table, and counts as its height instead.
 */
const cameraDistance = ({ camera }: GuideView) => {
  if (!camera) {
    return 0;
  }
  camera.getWorldDirection(forward);
  return forward.y < -0.01 ? camera.position.y / -forward.y : camera.position.y;
};

/*
 * Scrolling counts only the player's own turns of the wheel over the table, in one direction, measured from where the camera was at their first turn,
 * so the camera still gliding into its opening view never does the task for them. In is closer by a sixth or more, out is further by as much.
 */
export const scrolled = (direction: 'in' | 'out') => ({
  begin: (view: GuideView) => {
    const watch = { scrolled: 0, from: null as number | null, stop: new AbortController() };
    const scroll = (event: WheelEvent) => {
      /* Counted in pixels as the camera counts it, whether the browser reports the turn in pixels, lines or pages. */
      const pixels = wheelPixels(event.deltaY, event.deltaMode) * (direction === 'in' ? 1 : -1);
      if (event.target instanceof HTMLCanvasElement && pixels > 0) {
        watch.from ??= cameraDistance(view);
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
