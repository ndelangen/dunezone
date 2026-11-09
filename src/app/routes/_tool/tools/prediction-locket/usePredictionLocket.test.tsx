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
