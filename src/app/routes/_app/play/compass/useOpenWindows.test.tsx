// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, test } from 'vite-plus/test';

import type { CompassPlayer } from './compassTable';
import { useOpenWindows } from './useOpenWindows';
import { RememberedContext } from './useRemembered';
import type { TableWindow } from './windows';

beforeEach(() => localStorage.clear());
afterEach(cleanup);

const player: CompassPlayer = {
  seat: 'seat-4',
  name: 'Ridwan',
  factionName: 'Fremen',
  token: null,
  unread: 0,
  own: false,
  canConverse: true,
  attention: false,
  ally: false,
};
const window = (key: string, extra: Partial<TableWindow> = {}): TableWindow => ({
  key,
  label: key,
  group: 'Game',
  topic: 'game',
  content: null,
  layout: 'stack',
  ...extra,
});
const windows = [window('hand'), window('battle'), window('player:seat-4', { player })];

test('showing a window opens it in the centre, asking again closes it, and a player opens on their chat', () => {
  const { result } = renderHook(() => useOpenWindows(windows, false));
  act(() => result.current.show('hand'));
  expect(result.current.centre).toEqual({ key: 'hand', tab: 'public' });
  act(() => result.current.show('hand'));
  expect(result.current.centre).toBeNull();
  act(() => result.current.show('player:seat-4'));
  expect(result.current.centre).toEqual({ key: 'player:seat-4', tab: 'conversation' });
});

test('an event reveals a window without closing it: in the centre it stays, pinned it flashes, else it opens', () => {
  const { result } = renderHook(() => useOpenWindows(windows, false));
  act(() => result.current.reveal('battle'));
  expect(result.current.centre).toEqual({ key: 'battle', tab: 'public' });
  act(() => result.current.reveal('battle'));
  expect(result.current.centre).toEqual({ key: 'battle', tab: 'public' });
  act(() => result.current.pin('left'));
  expect(result.current.slots.left).toEqual({ key: 'battle', tab: 'public' });
  expect(result.current.centre).toBeNull();
  act(() => result.current.reveal('battle'));
  expect(result.current.centre).toBeNull();
  expect(result.current.flash).toEqual({ side: 'left', at: 1 });
  expect(result.current.isOpen('battle')).toBe(true);
});

test('pinning replaces what the slot held, and unpinning empties it', () => {
  const { result } = renderHook(() => useOpenWindows(windows, false));
  act(() => result.current.show('hand'));
  act(() => result.current.pin('right'));
  act(() => result.current.show('battle'));
  act(() => result.current.pin('right'));
  expect(result.current.slots.right?.key).toBe('battle');
  act(() => result.current.unpin('right'));
  expect(result.current.slots.right).toBeNull();
});

test('a press on the table blurs the focused field before the centre window closes, so its draft commits', () => {
  const { result } = renderHook(() => useOpenWindows(windows, false));
  act(() => result.current.show('battle'));
  const field = document.body.appendChild(document.createElement('input'));
  const table = document.body.appendChild(document.createElement('canvas'));
  let openAtBlur: unknown;
  field.addEventListener('blur', () => {
    openAtBlur = result.current.centre;
  });
  field.focus();
  act(() => {
    table.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
  });
  expect(openAtBlur).toEqual({ key: 'battle', tab: 'public' });
  expect(document.activeElement).not.toBe(field);
  expect(result.current.centre).toBeNull();
  field.remove();
  table.remove();
});

test('revealing a pinned window lights its slot and leaves the centre window open', () => {
  const { result } = renderHook(() => useOpenWindows(windows, false));
  act(() => result.current.show('hand'));
  act(() => result.current.pin('left'));
  act(() => result.current.show('player:seat-4'));
  act(() => result.current.reveal('hand'));
  expect(result.current.centre).toEqual({ key: 'player:seat-4', tab: 'conversation' });
  expect(result.current.flash).toEqual({ side: 'left', at: 1 });
});

test('a player window opened on a removal vote follows its target to the seat they trade into', () => {
  const voted = (seat: string) => window(`player:${seat}`, { player: { ...player, seat, vote: 'vote-1' } });
  const { result, rerender } = renderHook(({ list }) => useOpenWindows(list, false), {
    initialProps: {
      list: [window('hand'), voted('seat-4'), window('player:seat-2', { player: { ...player, seat: 'seat-2' } })],
    },
  });
  act(() => result.current.show('player:seat-4', 'public'));
  act(() => result.current.pin('left'));
  act(() => result.current.show('player:seat-4', 'public'));
  rerender({ list: [window('hand'), window('player:seat-4', { player }), voted('seat-2')] });
  expect(result.current.slots.left?.key).toBe('player:seat-2');
  expect(result.current.isOpen('player:seat-2')).toBe(true);
});

test('a tutorial remembers nothing: it neither reads nor overwrites the game layout', () => {
  localStorage.setItem('dunezone-compass:slots', JSON.stringify({ left: { key: 'hand', tab: 'public' }, right: null }));
  const { result } = renderHook(() => useOpenWindows(windows, false), {
    wrapper: ({ children }) => <RememberedContext value={false}>{children}</RememberedContext>,
  });
  expect(result.current.slots.left).toBeNull();
  act(() => result.current.show('battle'));
  act(() => result.current.pin('right'));
  expect(JSON.parse(localStorage.getItem('dunezone-compass:slots') ?? 'null')).toEqual({
    left: { key: 'hand', tab: 'public' },
    right: null,
  });
});

test('a window following a vote onto a player already open elsewhere leaves them shown once', () => {
  const voted = (seat: string) => window(`player:${seat}`, { player: { ...player, seat, vote: 'vote-1' } });
  const plain = (seat: string) => window(`player:${seat}`, { player: { ...player, seat } });
  const { result, rerender } = renderHook(({ list }) => useOpenWindows(list, false), {
    initialProps: { list: [voted('seat-4'), plain('seat-2')] },
  });
  act(() => result.current.show('player:seat-4', 'public'));
  act(() => result.current.pin('left'));
  act(() => result.current.show('player:seat-2', 'public'));
  act(() => result.current.pin('right'));
  rerender({ list: [plain('seat-4'), voted('seat-2')] });
  expect(result.current.slots.left?.key).toBe('player:seat-2');
  expect(result.current.slots.right).toBeNull();
});
