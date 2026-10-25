// @vitest-environment jsdom

import { afterEach, expect, test } from 'vite-plus/test';

import { fitHeight, MIN_SLOT_HEIGHT, OVERLAY_GAP, slotLimit } from './slotLimits';

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
