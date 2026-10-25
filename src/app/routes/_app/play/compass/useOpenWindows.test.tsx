// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, test } from 'vite-plus/test';

import type { CompassPlayer } from './compassTable';
import { useOpenWindows } from './useOpenWindows';
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
  flush: false,
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
