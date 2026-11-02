// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, test } from 'vite-plus/test';

import { factionEntry, representativeFaction } from './FactionAuthoringStoryFixtures';
import { useFactionAuthoring } from './useFactionAuthoring';

afterEach(cleanup);

function renderAuthoring() {
  return renderHook(() =>
    useFactionAuthoring({
      sessionKey: 'strength',
      initialData: representativeFaction(),
      persistence: {
        save: async (draft) => factionEntry(draft),
        isPending: false,
        error: null,
        hasSaved: false,
        reset: () => undefined,
      },
      onSaved: () => undefined,
    })
  );
}

test('a save drops strength text a leader refused, even when the strength is unchanged', async () => {
  const { result } = renderAuthoring();
  act(() => result.current.setStrengthRefusal({ leader: 0, text: '5x' }));
  expect(result.current.strengthRefusal).toEqual({ leader: 0, text: '5x' });
  await act(async () => await result.current.actions.submit());
  expect(result.current.persistence.errors).toEqual([]);
  expect(result.current.strengthRefusal).toBeNull();
});

test('a reset drops strength text a leader refused', () => {
  const { result } = renderAuthoring();
  act(() => result.current.setStrengthRefusal({ leader: 0, text: '5x' }));
  act(() => result.current.actions.reset());
  expect(result.current.strengthRefusal).toBeNull();
});
