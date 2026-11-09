// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, test } from 'vite-plus/test';

import { PREDICTION_LOCKET_STORAGE_KEY, usePredictionLocket } from './usePredictionLocket';

afterEach(() => window.localStorage.removeItem(PREDICTION_LOCKET_STORAGE_KEY));

const fremen = { id: 'fremen', name: 'Fremen' };
const atreides = { id: 'atreides', name: 'Atreides' };

test('a late lock never replaces a lock already made, here or in another tab', () => {
  const { result } = renderHook(() => usePredictionLocket());
  act(() => result.current.lock({ faction: fremen, turn: 6, timeZone: 'Europe/Amsterdam', lockedAt: 1 }));
  act(() => result.current.lock({ faction: atreides, turn: 1, timeZone: 'Europe/Amsterdam', lockedAt: 2 }));
  expect(result.current.state.locked).toMatchObject({ faction: fremen, turn: 6, lockedAt: 1 });
});

test("a lock another tab saved, before its storage event arrives here, wins over this tab's late answer", () => {
  const { result } = renderHook(() => usePredictionLocket());
  const other = { faction: null, turn: null, timeZone: 'Europe/Amsterdam', version: 2 };
  window.localStorage.setItem(
    PREDICTION_LOCKET_STORAGE_KEY,
    JSON.stringify({
      ...other,
      locked: { faction: fremen, turn: 6, timeZone: 'Europe/Amsterdam', lockedAt: 1, revealed: false },
    })
  );
  act(() => result.current.lock({ faction: atreides, turn: 1, timeZone: 'Europe/Amsterdam', lockedAt: 2 }));
  expect(result.current.state.locked).toMatchObject({ faction: fremen, turn: 6, lockedAt: 1 });
});

test('says when the prediction itself could not be saved', () => {
  const { result } = renderHook(() => usePredictionLocket());
  const setItem = Storage.prototype.setItem;
  Storage.prototype.setItem = () => {
    throw new Error('QuotaExceededError');
  };
  try {
    act(() => result.current.lock({ faction: fremen, turn: 6, timeZone: 'Europe/Amsterdam', lockedAt: 1 }));
  } finally {
    Storage.prototype.setItem = setItem;
  }
  expect(result.current.kept).toBe(false);
  expect(result.current.state.locked).toMatchObject({ faction: fremen, turn: 6 });
});

test("a pick in a stale tab never erases a lock another tab already saved", () => {
  const locking = renderHook(() => usePredictionLocket());
  const stale = renderHook(() => usePredictionLocket());
  act(() => locking.result.current.lock({ faction: fremen, turn: 6, timeZone: 'Europe/Amsterdam', lockedAt: 1 }));
  act(() => stale.result.current.pickTurn(3));
  expect(stale.result.current.state.locked).toMatchObject({ faction: fremen, turn: 6, lockedAt: 1 });
  const saved = JSON.parse(window.localStorage.getItem(PREDICTION_LOCKET_STORAGE_KEY) ?? '{}');
  expect(saved.locked).toMatchObject({ faction: fremen, turn: 6, lockedAt: 1 });
});
