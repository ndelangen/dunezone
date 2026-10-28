// @vitest-environment jsdom

import { MantineProvider } from '@mantine/core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, expect, test, vi } from 'vite-plus/test';

import { CompassControls } from './CompassControls';
import { CompassEpochContext } from './compassEpoch';
import { CompassTableContext } from './compassTable';
import type { CompassTable } from './compassTable';

/* jsdom has no matchMedia, which Mantine asks for. */
window.matchMedia = vi.fn().mockImplementation((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: vi.fn(),
  removeListener: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
}));

/* Nor ResizeObserver, which the slots measure with. */
globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

afterEach(cleanup);

const table: CompassTable = {
  players: [
    {
      seat: 'seat-1',
      name: 'Me',
      factionName: 'Atreides',
      token: null,
      unread: 0,
      own: true,
      canConverse: true,
      attention: false,
      ally: false,
    },
  ],
  tableChat: null,
  chat: () => null,
  factionInfo: () => null,
  nextPhase: null,
  token: null,
};

/* A new epoch starts the controls afresh, as the tutorial's Reset does, and leaves the table's scene standing: building it again is the slow part of a Reset. */
test('a new epoch closes the open window and keeps the scene mounted', () => {
  let mounts = 0;
  function Scene() {
    useEffect(() => {
      mounts += 1;
    }, []);
    return <div>The table</div>;
  }
  const controls = (epoch: number) => (
    <MantineProvider>
      <CompassTableContext.Provider value={table}>
        <CompassEpochContext value={epoch}>
          <CompassControls
            scene={<Scene />}
            header={null}
            camera={null}
            inert={false}
            panels={[{ key: 'hand', label: 'Hand & spice', topic: 'hand', content: <p>Your hand</p> }]}
            onView={() => undefined}
          />
        </CompassEpochContext>
      </CompassTableContext.Provider>
    </MantineProvider>
  );
  const { rerender } = render(controls(0));
  fireEvent.click(screen.getByRole('button', { name: 'Hand & spice, you are playing as Atreides' }));
  expect(screen.getByText('Your hand')).toBeTruthy();

  rerender(controls(1));
  expect(screen.queryByText('Your hand')).toBeNull();
  expect(screen.getByText('The table')).toBeTruthy();
  expect(mounts).toBe(1);
});
