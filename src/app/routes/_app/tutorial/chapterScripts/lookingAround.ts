import type { GameSnapshot } from '@shared/play/protocol';
import type { Vector3 } from 'three';

import type { GuideTask, GuideView } from '../TutorialGuide';
import type { ChapterScript } from './chapterScript';
import { at, closeUpShown, dialTask, scrolled, tableDeck, task } from './guideChecks';

/*
 * Chapter 6, "Looking around": the same table as chapter 5, seen through the camera.
 * In close with the wheel, along the board with the keys, back out, round the table with the dial, a ping for the others,
 * and a card read up close with Alt.
 * Tilting is left out: on a desktop the table has no tilt of its own, only a trackpad's two fingers.
 */

/* The keys that slide a close look, as the table names them. */
const PAN_KEYS = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowleft', 'arrowdown', 'arrowright']);

/*
 * Sliding counts the player pressing a pan key from the moment the task starts, and the camera then moving sideways
 * by a twentieth of its distance from the table's middle, so a glide left from the zoom does not do it for them.
 */
const slid = () => ({
  begin: ({ camera }: GuideView) => {
    const watch = { pressed: false, from: camera?.position.clone() ?? null, stop: new AbortController() };
    const press = (event: KeyboardEvent) => {
      if (PAN_KEYS.has(event.key.toLowerCase())) {
        watch.pressed = true;
      }
    };
    window.addEventListener('keydown', press, { capture: true, signal: watch.stop.signal });
    return watch;
  },
  done: (watch: { pressed: boolean; from: Vector3 | null }, { camera }: GuideView) =>
    watch.pressed &&
    watch.from !== null &&
    camera !== null &&
    camera.position.distanceTo(watch.from) > camera.position.length() * 0.05,
  finish: (watch: { stop: AbortController }) => watch.stop.abort(),
});

/*
 * Tab pings where the pointer is over the table, and the table claims the key when it does; a Tab it leaves alone moves the focus as usual.
 * So the task counts a Tab the table took, read once the table's own listener has had the key.
 */
const pinged = () => ({
  begin: () => {
    const watch = { pinged: false, stop: new AbortController() };
    const press = (event: KeyboardEvent) => {
      /* The compass and a piece's ring take Tab for their own focus, and the table never pings under them. */
      const covered = document.querySelector('dialog[aria-label="Controls compass"][open], [role="menu"]') !== null;
      if (event.key === 'Tab' && !event.repeat && !covered) {
        setTimeout(() => {
          watch.pinged ||= event.defaultPrevented;
        });
      }
    };
    window.addEventListener('keydown', press, { capture: true, signal: watch.stop.signal });
    return watch;
  },
  done: (watch: { pinged: boolean }) => watch.pinged,
  finish: (watch: { stop: AbortController }) => watch.stop.abort(),
});

function tasks(snapshot: () => GameSnapshot): GuideTask[] {
  /* The Spice deck lies on the right of the table, where the table lays it out. */
  const spiceDeck = () => tableDeck(snapshot, 'right');
  return [
    task({
      id: 'zoom-in',
      task: 'Look closer at Arrakis',
      detail: 'Scroll down over the board. The camera moves in toward the spot under your pointer.',
      anchor: { kind: 'table', point: () => [0, 0, 0] },
      ...scrolled('in'),
    }),
    task({
      id: 'slide',
      task: 'Slide along the board',
      detail: 'While you are in close, the arrow keys or {W}, {A}, {S} and {D} slide the view. Hold one for a moment.',
      anchor: { kind: 'table', point: () => [0, 0, 0] },
      ...slid(),
    }),
    task({
      id: 'zoom-out',
      task: 'Step back',
      detail: 'Scroll up over the board to move the camera back out.',
      anchor: { kind: 'table', point: () => [0, 0, 0] },
      ...scrolled('out'),
    }),
    dialTask(
      'look-left',
      'left',
      'Look at the left of the table',
      'The camera dial, top right of the table, jumps the view. Click its L.'
    ),
    dialTask(
      'look-bottom',
      'bottom',
      'Look at the bottom of the table',
      'B on the same dial turns to the rim below the board.'
    ),
    dialTask(
      'look-right',
      'right',
      'Look at the right of the table',
      'R on the dial turns to the right side, where the Spice deck lies.'
    ),
    task({
      id: 'close-up',
      task: 'Read a card up close',
      detail:
        'Point at the Spice deck and hold {Alt}. Its top card shows flat and large beside the pointer; read it, then let go.',
      anchor: { kind: 'table', point: () => at(spiceDeck()) },
      ...closeUpShown(),
    }),
    dialTask('look-back', 'map', 'Go back to the map', 'M on the dial brings the whole board back.'),
    task({
      id: 'ping',
      task: 'Show the others a spot',
      detail:
        'Point at any territory and press {Tab}. A ripple in your colour shows there for everyone at the table, with a sound.',
      anchor: { kind: 'table', point: () => [0, 0, 0] },
      ...pinged(),
    }),
  ];
}

/* One line for each part of the chapter, in the order it was played. */
const learned = [
  'Scroll over the board to look closer, and back to step out',
  'Slide a close look with the arrow keys or {W}, {A}, {S} and {D}',
  'Click L, R, B or M on the camera dial to jump the view',
  'Hold {Alt} over a card to read it flat and large',
  'Press {Tab} over the table to ping a spot for everyone',
];

export const lookingAround: ChapterScript = { slug: 'looking-around', checkpoint: 'turn-1-storm', tasks, learned };
