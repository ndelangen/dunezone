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

/* jsdom does not implement the native dialog's open and close methods. */
Object.assign(HTMLDialogElement.prototype, {
  show(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  },
  close(this: HTMLDialogElement) {
    this.removeAttribute('open');
  },
});

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

test('recall retains the self token without adding live faction or player windows', () => {
  render(
    <MantineProvider>
      <CompassTableContext
        value={{
          ...table,
          recall: {
            id: 'one',
            context: 'Storm',
            loading: false,
            chat: { unread: 0 },
            panels: [
              { key: 'hand', label: 'Your recalled hand', topic: 'hand', content: <p>Frozen hand</p> },
              { key: 'recall-chat', label: 'Recall chat', topic: 'planet', content: <p>Temporary chat</p> },
            ],
          },
        }}
      >
        <CompassControls scene={null} header={null} camera={null} inert={false} panels={[]} onView={() => undefined} />
      </CompassTableContext>
    </MantineProvider>
  );
  fireEvent.click(screen.getByRole('button', { name: 'Your recalled hand, you are playing as Atreides' }));
  expect(screen.getByText('Frozen hand')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Recall chat' }));
  expect(screen.getByText('Temporary chat')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /Controls/ }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Search controls' }), { target: { value: 'Faction' } });
  expect(screen.queryByRole('option')).toBeNull();
});

test('the normal chat remains mounted across recall and returns with its own state', () => {
  let mounts = 0;
  function OrdinaryChat() {
    useEffect(() => {
      mounts += 1;
    }, []);
    return <p>Ordinary chat</p>;
  }
  const normal = { ...table, tableChat: { unread: 0 }, chat: () => <OrdinaryChat /> };
  const renderControls = (recall?: CompassTable['recall']) => (
    <MantineProvider>
      <CompassTableContext value={{ ...normal, recall }}>
        <CompassControls scene={null} header={null} camera={null} inert={false} panels={[]} onView={() => undefined} />
      </CompassTableContext>
    </MantineProvider>
  );
  const { rerender } = render(renderControls());
  fireEvent.click(screen.getByRole('button', { name: 'Table chat' }));
  const original = screen.getByText('Ordinary chat');
  rerender(renderControls({ id: 'one', context: 'Storm', loading: false, panels: [] }));
  expect(screen.getByText('Ordinary chat')).toBe(original);
  rerender(renderControls());
  expect(screen.getByText('Ordinary chat')).toBe(original);
  expect(mounts).toBe(1);
});

test('recall lists the actions it holds for a seated player, and none for an observer, who has none to hold', () => {
  const recall: CompassTable['recall'] = { id: 'one', context: 'Storm', loading: false, panels: [] };
  const controls = (players: CompassTable['players']) => (
    <MantineProvider>
      <CompassTableContext value={{ ...table, players, recall }}>
        <CompassControls scene={null} header={null} camera={null} inert={false} panels={[]} onView={() => undefined} />
      </CompassTableContext>
    </MantineProvider>
  );
  const search = () => {
    fireEvent.click(screen.getByRole('button', { name: /Controls/ }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Search controls' }), { target: { value: 'Next phase' } });
  };
  const { unmount } = render(controls(table.players));
  search();
  expect(screen.getByRole('option', { name: /Next phase/ })).toBeTruthy();
  unmount();
  render(controls([]));
  search();
  expect(screen.queryByRole('option', { name: /Next phase/ })).toBeNull();
});
