// @vitest-environment jsdom

import { act, cleanup, fireEvent, renderHook } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vite-plus/test';

import { PANEL_WINDOWS } from '../panels/panelWindows';
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
