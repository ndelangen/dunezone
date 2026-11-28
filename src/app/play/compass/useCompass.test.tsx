// @vitest-environment jsdom

import { act, cleanup, fireEvent, renderHook } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vite-plus/test';

import { PANEL_WINDOWS } from '../panels/panelWindows';
import type { CompassTable } from './compassTable';
import { useCompass } from './useCompass';

afterEach(cleanup);

const sheet = {
  ...PANEL_WINDOWS.shortcuts,
  group: PANEL_WINDOWS.shortcuts.label,
  content: null,
  layout: 'stack' as const,
};

function compass(onToggleSheet?: () => void) {
  const hook = renderHook(() =>
    useCompass({
      open: false,
      onOpen: () => {},
      inert: false,
      windows: [sheet],
      table: null,
      onView: () => {},
      onShow: () => {},
      onToggleSheet,
    })
  );
  act(() => hook.result.current.props.onQuery('shortcuts'));
  return hook;
}

test('with a way to toggle the cheat sheet, its suggestion carries ? and ? over the table toggles it', () => {
  const onToggleSheet = vi.fn();
  const { result } = compass(onToggleSheet);
  expect(result.current.props.suggestions[0]).toMatchObject({ label: 'Keyboard shortcuts', shortcut: '?' });
  fireEvent.keyDown(window, { key: '?' });
  expect(onToggleSheet).toHaveBeenCalledTimes(1);
});

test('without one, the cheat sheet is still found, with no key beside it', () => {
  const { result } = compass();
  expect(result.current.props.suggestions[0]).toMatchObject({ label: 'Keyboard shortcuts' });
  expect(result.current.props.suggestions[0]?.shortcut).toBeUndefined();
});

/* An open compass at a table that can clear every chat, with "clear all chats" typed and the cursor on it. */
function clearingCompass() {
  vi.useFakeTimers();
  const clearChats = vi.fn();
  const onOpen = vi.fn();
  const table: CompassTable = {
    players: [],
    tableChat: null,
    chat: () => null,
    factionInfo: () => null,
    clearChats,
    nextPhase: null,
    token: null,
  };
  const hook = renderHook(() =>
    useCompass({
      open: true,
      onOpen,
      inert: false,
      windows: [],
      table,
      onView: () => {},
      onShow: () => {},
    })
  );
  act(() => hook.result.current.props.onQuery('clear all chats'));
  act(() => hook.result.current.props.onSpot('search'));
  expect(hook.result.current.props.suggestions[0]).toMatchObject({ key: 'cmd:clear-chats', held: 'Clearing' });
  return { ...hook, clearChats, onOpen };
}

afterEach(() => vi.useRealTimers());

test('clearing every chat takes Enter held for five seconds, counting down on its row, as every delete does', () => {
  const { result, clearChats, onOpen } = clearingCompass();
  fireEvent.keyDown(window, { key: 'Enter' });
  expect(clearChats).not.toHaveBeenCalled();
  expect(result.current.props.held).toEqual({ key: 'cmd:clear-chats', remaining: 5 });
  act(() => {
    vi.advanceTimersByTime(1000);
  });
  /* The key repeats while held; that does not restart the countdown. */
  fireEvent.keyDown(window, { key: 'Enter', repeat: true });
  expect(result.current.props.held?.remaining).toBe(4);
  act(() => {
    vi.advanceTimersByTime(4000);
  });
  expect(clearChats).toHaveBeenCalledTimes(1);
  expect(onOpen).toHaveBeenCalledWith(false);
  expect(result.current.props.held).toBeNull();
});

test('letting go of Enter, or of the row, before the five seconds are up clears nothing', () => {
  const { result, clearChats } = clearingCompass();
  fireEvent.keyDown(window, { key: 'Enter' });
  act(() => {
    vi.advanceTimersByTime(3000);
  });
  fireEvent.keyUp(window, { key: 'Enter' });
  expect(result.current.props.held).toBeNull();
  const entry = result.current.props.suggestions[0]!;
  act(() => result.current.props.onHold(entry));
  act(() => {
    vi.advanceTimersByTime(4000);
  });
  act(() => result.current.props.onRelease());
  act(() => {
    vi.advanceTimersByTime(5000);
  });
  expect(clearChats).not.toHaveBeenCalled();
});

test('typing while it counts down lets go of it', () => {
  const { result, clearChats } = clearingCompass();
  fireEvent.keyDown(window, { key: 'Enter' });
  act(() => result.current.props.onQuery('clear all chat'));
  act(() => {
    vi.advanceTimersByTime(5000);
  });
  expect(clearChats).not.toHaveBeenCalled();
});

test('letting go of Space after steering onto it starts no countdown: a key already up holds nothing', () => {
  vi.useFakeTimers();
  const clearChats = vi.fn();
  const table: CompassTable = {
    players: [],
    tableChat: null,
    chat: () => null,
    factionInfo: () => null,
    clearChats,
    nextPhase: null,
    token: null,
  };
  let open = false;
  const hook = renderHook(() =>
    useCompass({
      open,
      onOpen: (next) => {
        open = next;
      },
      inert: false,
      windows: [],
      table,
      onView: () => {},
      onShow: () => {},
    })
  );
  fireEvent.keyDown(window, { key: ' ', code: 'Space' });
  hook.rerender();
  act(() => hook.result.current.props.onQuery('clear all chats'));
  fireEvent.keyDown(window, { key: 'ArrowDown' });
  fireEvent.keyUp(window, { key: ' ', code: 'Space' });
  expect(hook.result.current.props.held).toBeNull();
  act(() => {
    vi.advanceTimersByTime(5000);
  });
  expect(clearChats).not.toHaveBeenCalled();
});
