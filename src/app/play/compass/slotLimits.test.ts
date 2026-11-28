// @vitest-environment jsdom

import { afterEach, expect, test } from 'vite-plus/test';

import { EDGE_GAP, fitHeight, MIN_SLOT_HEIGHT, OVERLAY_GAP, slotBottom, slotLimit } from './slotLimits';

afterEach(() => {
  document.body.replaceChildren();
});

type Box = Readonly<{ left: number; top: number; width: number; height: number }>;

/* An element at a place on screen, as the layout would put it; jsdom lays nothing out itself. */
function placed(tag: string, box: Box, className?: string) {
  const element = document.createElement(tag);
  if (className) {
    element.className = className;
  }
  element.getBoundingClientRect = () =>
    ({ ...box, right: box.left + box.width, bottom: box.top + box.height, x: box.left, y: box.top }) as DOMRect;
  return element;
}

/* The table, 1500 wide and 900 tall, with a slot pinned bottom left and whatever is drawn over it. */
function table(...overlays: HTMLElement[]) {
  const root = placed('div', { left: 0, top: 0, width: 1500, height: 900 });
  Object.defineProperty(root, 'clientWidth', { value: 1500 });
  const slot = placed('section', { left: 16, top: 436, width: 400, height: 448 });
  root.append(slot, ...overlays);
  document.body.append(root);
  return { root, slot };
}

test('with nothing drawn over its columns a slot may grow to the table’s top edge', () => {
  const { root, slot } = table();
  expect(slotLimit(root, slot)).toBe(884 - OVERLAY_GAP);
});

test('a header chip over the slot’s columns is the ceiling, and a full-width header row is layout, not a chip', () => {
  const header = placed('header', { left: 0, top: 12, width: 1500, height: 60 }, 'seated-header');
  header.append(placed('div', { left: 16, top: 12, width: 200, height: 56 }, 'seated-chip'));
  const { root, slot } = table(header);
  expect(slotLimit(root, slot)).toBe(884 - 68 - OVERLAY_GAP);
});

test('a chip beside the slot’s columns, a hidden chip and one that would leave less than the minimum do not count', () => {
  const header = placed('header', { left: 0, top: 12, width: 1500, height: 60 }, 'seated-header');
  header.append(placed('div', { left: 1200, top: 12, width: 200, height: 56 }, 'seated-chip'));
  const hidden = placed('div', { left: 16, top: 100, width: 200, height: 56 }, 'seated-chip');
  hidden.style.visibility = 'hidden';
  header.append(hidden);
  const { root, slot } = table(header, placed('div', { left: 16, top: 800, width: 100, height: 40 }, 'seated-camera'));
  expect(slotLimit(root, slot)).toBe(884 - OVERLAY_GAP);
});

test('a slot never has a limit under the minimum height', () => {
  const dial = placed('div', { left: 16, top: 700, width: 100, height: 60 }, 'seated-camera');
  const { root, slot } = table(dial);
  expect(slotLimit(root, slot)).toBe(MIN_SLOT_HEIGHT);
});

test('a height asked for stays between the minimum and the limit, and bounces past the limit', () => {
  expect(fitHeight(300.4, 500)).toEqual({ height: 300, bounced: false });
  expect(fitHeight(40, 500)).toEqual({ height: MIN_SLOT_HEIGHT, bounced: false });
  expect(fitHeight(620, 500)).toEqual({ height: 500, bounced: true });
  expect(fitHeight(500, 500)).toEqual({ height: 500, bounced: false });
});

/* The table's box and the chat bar at its bottom middle, as the layout puts them. */
const ROOT = { width: 1280, bottom: 800 };
const BAR = { width: 420, top: 800 - EDGE_GAP - 46 };

test('the slots stand beside the bar while both slots, the bar and the four gaps fit in one row', () => {
  /* 2 * 400 + 420 + 48 = 1268, inside 1280. */
  expect(slotBottom(ROOT, BAR, 400)).toBe(EDGE_GAP);
  /* 2 * 410 + 420 + 48 = 1288, a shade over. */
  expect(slotBottom(ROOT, BAR, 410)).toBe(800 - BAR.top + EDGE_GAP);
});

test('on a narrow table the slots rise to a gap above the bar, whatever the bar holds', () => {
  const narrow = { width: 760, bottom: 600 };
  expect(slotBottom(narrow, { width: 420, top: 542 }, 288)).toBe(600 - 542 + EDGE_GAP);
  /* A bar with no chats yet is short enough to share the row with two narrow slots. */
  expect(slotBottom(narrow, { width: 120, top: 542 }, 288)).toBe(EDGE_GAP);
});
