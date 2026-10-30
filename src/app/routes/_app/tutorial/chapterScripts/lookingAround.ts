import type { GameSnapshot } from '@shared/play/protocol';
import type { Vector3 } from 'three';

import type { GuideTask, GuideView } from '../TutorialGuide';
import type { ChapterScript, TablePlayers } from './chapterScript';
import { at, closeUpShown, dialTask, scrolled, tableDeck, task } from './guideChecks';

/*
 * "Looking around": the same table as chapter 5, seen through the camera.
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

/* A ping is counted when the table receives it, so focus navigation and repeated keys never count. */
export const pingedTwice = (pings: () => readonly number[]) => ({
  begin: () => pings().length,
  done: (start: number) => {
    const second = pings()[start + 1];
    return second !== undefined && Date.now() - second >= 1000;
  },
});

function tasks(snapshot: () => GameSnapshot, players: TablePlayers): GuideTask[] {
  /* The Spice deck lies on the right of the table, where the table lays it out. */
  const spiceDeck = () => tableDeck(snapshot, 'right');
  return [
    task({
      id: 'zoom-in',
      task: 'Look closer at Arrakis',
      detail: "Let's take a closer look! Scroll down over the board to move toward the spot under your pointer.",
      anchor: { kind: 'table', point: () => [0, 0, 0] },
      ...scrolled('in'),
    }),
    task({
      id: 'slide',
      task: 'Move across the board',
      detail: 'You can explore while zoomed in. Hold an arrow key or {W}, {A}, {S} or {D} to move the view.',
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
      'Click L on the camera dial in the top right to look at the left side of the table.'
    ),
    dialTask(
      'look-bottom',
      'bottom',
      'Look at the bottom of the table',
      'Click B on the camera dial to look at the bottom of the table.'
    ),
    dialTask(
      'look-right',
      'right',
      'Look at the right of the table',
      'Click R on the camera dial to look at the Spice deck on the right.'
    ),
    task({
      id: 'close-up',
      task: 'Read a card up close',
      detail:
        'Hover over the Spice deck and hold {Alt} to see its top card up close.\n\nRelease {Alt} when you have finished reading.',
      anchor: { kind: 'table', point: () => at(spiceDeck()) },
      ...closeUpShown(),
    }),
    dialTask('look-back', 'map', 'Go back to the map', 'Click M on the camera dial to return to the map.'),
    task({
      id: 'ping',
      task: 'Point something out',
      detail:
        "Want everyone to look at the same place? Hover over a territory and press {Tab} to send a ping. They'll see a ripple in your colour and hear it too.\n\nSend two pings to practise. Each press sends one.",
      anchor: { kind: 'table', point: () => [0, 0, 0] },
      ...pingedTwice(players.pings),
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
