// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { afterEach, beforeEach, expect, test } from 'vite-plus/test';

import { EDGE_GAP, MIN_SLOT_HEIGHT, OVERLAY_GAP, RESIZE_STEP } from './slotLimits';
import { useSlotHeights } from './useSlotHeights';

beforeEach(() => {
  localStorage.clear();
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});
afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

/*
 * The table with a header chip 68px down, a toolbar top right, a chat bar at the bottom middle,
 * and a slot pinned bottom left that is 448 tall. A 1500px table seats both slots beside the bar.
 */
function table(width = 1500) {
  const place = (element: HTMLElement, box: { left: number; top: number; width: number; height: number }) => {
    element.getBoundingClientRect = () =>
      ({ ...box, right: box.left + box.width, bottom: box.top + box.height }) as DOMRect;
    return element;
  };
  const root = place(document.createElement('div'), { left: 0, top: 0, width, height: 900 });
  Object.defineProperty(root, 'clientWidth', { value: width });
  const header = place(document.createElement('header'), { left: 0, top: 12, width: 1500, height: 60 });
  header.className = 'seated-header';
  const chip = place(document.createElement('div'), { left: 16, top: 12, width: 200, height: 56 });
  const toolbar = place(document.createElement('div'), { left: 1200, top: 12, width: 280, height: 56 });
  toolbar.className = 'seated-toolbar';
  header.append(chip, toolbar);
  const slot = place(document.createElement('section'), { left: 16, top: 436, width: 400, height: 448 });
  slot.dataset.window = 'hand';
  slot.dataset.side = 'left';
  const grip = document.createElement('button');
  slot.append(grip);
  const bar = place(document.createElement('div'), { left: width / 2 - 210, top: 842, width: 420, height: 46 });
  bar.dataset.compassBar = '';
  root.append(header, slot, bar);
  document.body.append(root);
  const limit = 884 - 68 - OVERLAY_GAP;
  return { root, slot, grip, limit };
}

function heights(root: HTMLElement) {
  return renderHook(() => useSlotHeights({ current: root }, { left: 'hand', right: null }));
}

test('a slot keeps its default height under the chip above it, and the camera dial hangs under the toolbar', () => {
  const { root, limit } = table();
  const { result } = heights(root);
  expect(result.current.styleOf('left')).toEqual({ maxHeight: limit });
  expect(result.current.styleOf('right')).toBeUndefined();
  expect(root.style.getPropertyValue('--compass-camera-top')).toBe(`${68 + OVERLAY_GAP}px`);
  expect(root.style.getPropertyValue('--compass-slot-bottom')).toBe(`${EDGE_GAP}px`);
});

test('on a table too narrow for both slots beside the bar, the slots rise above it', () => {
  const { root } = table(1000);
  heights(root);
  /* The bar's top is 842 on a 900px table, so the slots' bottoms sit a gap above it. */
  expect(root.style.getPropertyValue('--compass-slot-bottom')).toBe(`${900 - 842 + EDGE_GAP}px`);
});

test('the arrow keys nudge a slot a step at a time, stop at the limit with a bounce, never go under the minimum, and reset', () => {
  const { root, slot, limit } = table();
  const { result } = heights(root);
  act(() => result.current.nudge('left', slot, 'up'));
  expect(result.current.styleOf('left')).toEqual({ height: 448 + RESIZE_STEP });
  expect(result.current.bounce).toBeNull();

  /* The slot is now almost as tall as it may be, so the next step runs into the chip. */
  slot.getBoundingClientRect = () =>
    ({ left: 16, top: 884 - limit + 4, right: 416, bottom: 884, width: 400, height: limit - 4 }) as DOMRect;
  act(() => result.current.nudge('left', slot, 'up'));
  expect(result.current.styleOf('left')).toEqual({ height: limit });
  expect(result.current.bounce).toEqual({ side: 'left', at: 1 });

  slot.getBoundingClientRect = () =>
    ({ left: 16, top: 764, right: 416, bottom: 884, width: 400, height: 130 }) as DOMRect;
  act(() => result.current.nudge('left', slot, 'down'));
  expect(result.current.styleOf('left')).toEqual({ height: MIN_SLOT_HEIGHT });
  expect(result.current.bounce).toEqual({ side: 'left', at: 1 });

  act(() => result.current.reset('left'));
  expect(result.current.styleOf('left')).toEqual({ maxHeight: limit });
});

test('dragging the grip resizes with the pointer, bounces once per run into the limit, and ends on pointercancel too', () => {
  const { root, grip, limit } = table();
  const { result } = heights(root);
  const start = {
    clientY: 440,
    currentTarget: grip,
    preventDefault: () => {},
  } as unknown as ReactPointerEvent<HTMLElement>;
  act(() => result.current.resize('left')(start));
  const moveTo = (clientY: number) =>
    act(() => {
      window.dispatchEvent(new PointerEvent('pointermove', { clientY }));
    });
  moveTo(400);
  expect(result.current.styleOf('left')).toEqual({ height: 488 });
  moveTo(0);
  expect(result.current.styleOf('left')).toEqual({ height: limit });
  expect(result.current.bounce).toEqual({ side: 'left', at: 1 });
  moveTo(-20);
  expect(result.current.bounce).toEqual({ side: 'left', at: 1 });
  moveTo(300);
  moveTo(0);
  expect(result.current.bounce).toEqual({ side: 'left', at: 2 });
  act(() => {
    window.dispatchEvent(new PointerEvent('pointercancel'));
  });
  moveTo(400);
  expect(result.current.styleOf('left')).toEqual({ height: limit });
});

test('a dragged height is remembered for the next visit', () => {
  const { root, slot } = table();
  const first = heights(root);
  act(() => first.result.current.nudge('left', slot, 'up'));
  cleanup();
  const again = heights(root);
  expect(again.result.current.styleOf('left')).toEqual({ height: 448 + RESIZE_STEP });
});
