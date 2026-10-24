import type { GuideTask } from '../TutorialGuide';
import type { ChapterScript } from './chapterScript';

/*
 * The play-test chapter "New controls" (Norbert, 2026-10-24): the stage 4 controls, where Space opens a compass over the table,
 * a window opens in the middle and can be pinned to the bottom-left or bottom-right slot, and the chats sit beside the Controls button.
 * Every task is read from the screen, so it moves on only once the player has done it with the new controls.
 */

const first = (selector: string) => () => document.querySelector(selector);
const compassOpen = () => document.querySelector('[role="dialog"][aria-label="Controls compass"]') !== null;
/* Where a window shows: in the middle of the table or in one of the two slots. */
const windowAt = (where: 'centre' | 'left' | 'right', key: string) =>
  document.querySelector(`section[data-side="${where}"][data-window="${key}"]`) !== null;
/* With the compass open the arrow points at the tile to pick, otherwise at the button that opens it. */
const viaCompass = (spot: string) => () =>
  document.querySelector(compassOpen() ? `[data-spot="${spot}"]` : '[data-compass-launcher]');
const slotHeight = (side: 'left' | 'right') =>
  document.querySelector(`section[data-side="${side}"]`)?.getBoundingClientRect().height ?? 0;
const showing = (view: string) =>
  document.querySelector(`[aria-label^="Focus on ${view}"]`)?.getAttribute('aria-pressed') === 'true';

/* Each task keeps its own kind of baseline; the guide only hands it back. */
const task = <Baseline>(definition: GuideTask<Baseline>) => definition as unknown as GuideTask;
const nothing = () => undefined;

const tasks = (): GuideTask[] => [
  task({
    id: 'open-compass',
    task: 'Open the controls',
    detail: 'Press Space. The compass opens over the table; Escape or a click outside closes it again.',
    anchor: { kind: 'page', element: first('[data-compass-launcher]') },
    begin: nothing,
    done: compassOpen,
  }),
  task({
    id: 'hand',
    task: 'Open your hand',
    detail: 'Left on the compass is your hand. Press ← then Space, or hold Space, tap ← and let go.',
    anchor: { kind: 'page', element: viaCompass('hand') },
    begin: nothing,
    done: () => windowAt('centre', 'hand'),
  }),
  task({
    id: 'pin-hand',
    task: 'Keep your hand open',
    detail:
      'A window in the middle closes when you click the table. Pin it to the bottom left with the button in its title.',
    anchor: { kind: 'page', element: first('[aria-label="Pin to the bottom left"]') },
    begin: nothing,
    done: () => windowAt('left', 'hand'),
  }),
  task({
    id: 'hidden-zone',
    task: 'Look at your hidden zone',
    detail: 'Two steps left on the compass: hold Space, tap ← twice and let go.',
    anchor: { kind: 'page', element: viaCompass('hidden') },
    begin: nothing,
    done: () => windowAt('centre', 'hidden-zone'),
  }),
  task({
    id: 'table-chat',
    task: 'Open the table chat',
    detail: 'Right on the compass is the chat everyone at the table reads. Hold Space, tap → and let go.',
    anchor: { kind: 'page', element: viaCompass('table') },
    begin: nothing,
    done: () => windowAt('centre', 'table-chat'),
  }),
  task({
    id: 'pin-chat',
    task: 'Pin the chat to the bottom right',
    detail: 'Use the other pin in the window’s title. Each slot holds one window; pinning another replaces it.',
    anchor: { kind: 'page', element: first('[aria-label="Pin to the bottom right"]') },
    begin: nothing,
    done: () => windowAt('right', 'table-chat'),
  }),
  task({
    id: 'resize',
    task: 'Make the chat taller',
    detail: 'Drag the grip on the top edge of the pinned chat upward. Double-click the grip to put it back.',
    anchor: { kind: 'page', element: first('section[data-side="right"] button[aria-label^="Resize"]') },
    begin: () => slotHeight('right'),
    done: (start: number) => slotHeight('right') >= start + 40,
  }),
  task({
    id: 'player',
    task: 'Talk to one player',
    detail:
      'The faction tokens beside Controls are your chats, one per player, with a badge when they wrote. Click one.',
    anchor: { kind: 'page', element: first('nav[aria-label="Chats"] button:nth-of-type(2)') },
    begin: nothing,
    done: () => document.querySelector('section[data-side="centre"][data-window^="player:"]') !== null,
  }),
  task({
    id: 'search',
    task: 'Look at the right bay by typing',
    detail: 'Open the controls and just type: “right” finds the camera view. Press Enter to pick it.',
    /* The search field while the compass is open, the Controls button before. */
    anchor: { kind: 'page', element: first('[aria-label="Search controls"], [data-compass-launcher]') },
    begin: nothing,
    done: () => showing('right'),
  }),
  task({
    id: 'unpin',
    task: 'Unpin your hand',
    detail: 'The crossed-out pin in the hand’s title takes it off the screen at once. Space ← brings it back any time.',
    anchor: { kind: 'page', element: first('section[data-side="left"] [aria-label="Unpin"]') },
    begin: nothing,
    done: () => !windowAt('left', 'hand'),
  }),
];

const learned = [
  'Space opens the compass over the table',
  'Left is your hand, twice left your hidden zone',
  'Right is the table chat, twice right your ally',
  'Up is your battle plan, down the search',
  'Pin a window to the bottom left or right to keep it open',
  'Drag a pinned window’s top edge to resize it',
  'The tokens beside Controls are your chats',
  'Type anything on the compass to find it',
];

export const newControls: ChapterScript = {
  slug: 'new-controls',
  checkpoint: 'turn-1-storm',
  tasks,
  learned,
  controls: 'palette-4',
};
