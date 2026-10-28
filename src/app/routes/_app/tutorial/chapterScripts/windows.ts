import type { GuideTask } from '../TutorialGuide';
import type { ChapterScript } from './chapterScript';
import { element as first, openedWindow, task, viaCompass, windowShown } from './guideChecks';

/*
 * "Windows": Space opens a compass over the table, a window opens in the middle,
 * and it can be pinned to the bottom-left or bottom-right slot to stay open while the player plays.
 * Each window also has a letter of its own, which the compass shows beside it, so the chapter ends on one.
 * Every task is read from the screen, so it moves on only once the player has done it with the controls.
 */

const COMPASS = 'dialog[aria-label="Controls compass"]';
const compassOpen = () => document.querySelector(COMPASS) !== null;
/*
 * Inside the open compass only: with the hand pinned bottom left, an arrow to the Controls button would run across it,
 * so these tasks say which keys to press and the arrow comes once the compass is open.
 */
const inCompass = (selector: string) => () => document.querySelector(`${COMPASS} ${selector}`);
/* Where a window shows: in the middle of the table or in one of the two slots. */
const windowAt = (where: 'centre' | 'left' | 'right', key: string) =>
  document.querySelector(`[data-side="${where}"][data-window="${key}"]`) !== null;
const slotHeight = (side: 'left' | 'right') =>
  document.querySelector(`[data-side="${side}"]`)?.getBoundingClientRect().height ?? 0;
const RESIZE_GRIP = '[data-side="right"] button[aria-label^="Resize"]';
/*
 * Resizing counts only once the player took hold of the grip, and once the chat grew or ran into the overlay above it:
 * on a short window the chat may already be as tall as it can be, and the bounce tells the player so.
 */
const resizedTaller = () => ({
  begin: () => {
    const watch = { grabbed: false, from: slotHeight('right'), stop: new AbortController() };
    const grab = (event: Event) => {
      if (event.target instanceof Element && event.target.closest(RESIZE_GRIP)) {
        watch.grabbed = true;
      }
    };
    for (const type of ['pointerdown', 'keydown']) {
      document.addEventListener(type, grab, { capture: true, signal: watch.stop.signal });
    }
    return watch;
  },
  done: (watch: { grabbed: boolean; from: number }) =>
    watch.grabbed &&
    (slotHeight('right') >= watch.from + 40 || document.querySelector('[data-side="right"][data-bounce]') !== null),
  finish: (watch: { stop: AbortController }) => watch.stop.abort(),
});
const showing = (view: string) =>
  document.querySelector(`[aria-label^="Focus on ${view}"]`)?.getAttribute('aria-pressed') === 'true';

const nothing = () => undefined;
/*
 * A window's (?) explains it on hover or focus. The task counts once the player has pointed at one or tabbed onto it
 * and then moved away again, so it does not tick over while they are still reading (Norbert, 2026-10-25).
 */
const HELP = '[data-window] [aria-label="Help"]';
const readHelp = () => ({
  begin: () => {
    const watch = { reading: false, read: false, stop: new AbortController() };
    const onHelp = (event: Event) => event.target instanceof Element && event.target.closest(HELP) !== null;
    const look = (event: Event) => {
      watch.reading ||= onHelp(event);
    };
    const leave = (event: Event) => {
      const next = (event as FocusEvent | PointerEvent).relatedTarget;
      if (watch.reading && onHelp(event) && !(next instanceof Element && next.closest(HELP))) {
        watch.read = true;
      }
    };
    for (const type of ['pointerover', 'focusin']) {
      document.addEventListener(type, look, { capture: true, signal: watch.stop.signal });
    }
    for (const type of ['pointerout', 'focusout']) {
      document.addEventListener(type, leave, { capture: true, signal: watch.stop.signal });
    }
    return watch;
  },
  done: (watch: { read: boolean }) => watch.read,
  finish: (watch: { stop: AbortController }) => watch.stop.abort(),
});

/* The compass and the hand it opens, what the window is for, and pinning it into a slot. */
const windowTasks = (): GuideTask[] => [
  task({
    id: 'open-compass',
    task: 'Open the controls',
    detail: 'Press {Space} to open the controls. Press {Escape} or click outside to close them.',
    anchor: { kind: 'page', element: first('[data-compass-launcher]') },
    begin: nothing,
    done: compassOpen,
  }),
  task({
    id: 'hand',
    task: 'Open your hand',
    detail: 'Your hand is on the left. Press {←}, then {Space} to open it.',
    anchor: { kind: 'page', element: viaCompass('hand') },
    begin: nothing,
    done: () => windowAt('centre', 'hand'),
  }),
  task({
    id: 'help',
    task: 'Read a window hint',
    detail:
      'Hover over the question mark beside the window title to read its help text. Move the pointer away when you are done.',
    anchor: { kind: 'page', element: first(HELP) },
    ...readHelp(),
  }),
  task({
    id: 'pin-hand',
    task: 'Keep your hand open',
    detail:
      'Use the left pin beside the window title to keep your hand open in the bottom left. Unpinned windows close when you click the table.',
    anchor: { kind: 'page', element: first('[aria-label="Pin to the bottom left"]') },
    begin: nothing,
    done: () => windowAt('left', 'hand'),
  }),
];

/* The chat pinned on the right and made taller, then the search, unpinning, and the chat back with its letter. */
const slotTasks = (): GuideTask[] => [
  task({
    id: 'table-chat',
    task: 'Open the table chat',
    detail: 'Press {Space}, {→}, then {Space} to open table chat. Everyone at the table can read these messages.',
    anchor: { kind: 'page', element: inCompass('[data-spot="table"]') },
    begin: nothing,
    done: () => windowAt('centre', 'table-chat'),
  }),
  task({
    id: 'pin-chat',
    task: 'Pin the chat to the bottom right',
    detail:
      'Use the right pin beside the chat title. Each corner holds one window, so pinning a new one there replaces the old one.',
    anchor: { kind: 'page', element: first('[aria-label="Pin to the bottom right"]') },
    begin: nothing,
    done: () => windowAt('right', 'table-chat'),
  }),
  task({
    id: 'resize',
    task: 'Make the chat taller',
    detail:
      'Drag the grip above the pinned chat upward to make it taller. Double-click the grip to restore its original height.',
    anchor: { kind: 'page', element: first(RESIZE_GRIP) },
    ...resizedTaller(),
  }),
  task({
    id: 'search',
    task: 'Search the controls',
    detail: 'Press {Space} and type "right" to find the right camera view. Press {Enter} to select it.',
    anchor: { kind: 'page', element: inCompass('[aria-label="Search controls"]') },
    begin: nothing,
    done: () => showing('right'),
  }),
  task({
    id: 'unpin',
    task: 'Unpin table chat',
    detail: 'Press the crossed-out pin in the chat title to close the pinned window.',
    anchor: { kind: 'page', element: first('[data-side="right"] [aria-label="Unpin"]') },
    begin: nothing,
    /* Whatever ended up pinned bottom right, the slot is empty once it is unpinned. */
    done: () => document.querySelector('[data-side="right"]') === null,
  }),
  task({
    id: 'letter',
    task: 'Open chat with a shortcut',
    detail:
      'Click the table, then press {G} to open table chat. Each window has a shortcut shown in the controls. You can also hold {Space}, tap a direction and release it to open a window.',
    anchor: { kind: 'page', element: first('[data-compass-launcher]') },
    ...openedWindow(windowShown('table-chat')),
  }),
];

const tasks = () => [...windowTasks(), ...slotTasks()];

/* One line for each part of the chapter, in the order it was played. */
const learned = [
  '{Space} opens the compass over the table',
  'Left is your hand, twice left your private side-table',
  'Right is the table chat, twice right your ally',
  'Up is your battle plan, down the search',
  'The (?) beside a window’s name says what it is for',
  'Pin a window to the bottom left or right to keep it open',
  'Drag a pinned window’s top edge to resize it',
  'Type anything on the compass to find it',
  'One letter opens each window: {H}, {J}, {G}, {F} and {B}',
];

export const windows: ChapterScript = { slug: 'windows', checkpoint: 'turn-1-storm', tasks, learned };
