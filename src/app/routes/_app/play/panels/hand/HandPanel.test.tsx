/** @vitest-environment jsdom */

import { MantineProvider } from '@mantine/core';
import type { TablePiece } from '@shared/play/model';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { appContentTheme } from '@ui/theme';
import { afterEach, expect, test, vi } from 'vite-plus/test';

import { CompassActiveContext } from '../../compass/controlsActive';
import { stubMatchMedia } from '../../multiplayer/jsdom.test.fixture';
import { handGroups } from './handGroups';
import { HandPanel } from './HandPanel';
import type { HandActions } from './useHandActions';

stubMatchMedia();
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
afterEach(cleanup);

function mountedHand() {
  const piece: TablePiece = {
    id: 'snooper',
    label: 'Snooper',
    owner: 'own',
    color: '#000000',
    accent: '#000000',
    items: [
      {
        id: 'snooper-item',
        faceUp: true,
        artwork: {
          front: 'https://dune.zone/snooper.jpg',
          back: 'https://dune.zone/card-back.jpg',
          name: 'Snooper',
          type: 'card',
          backName: 'Treachery',
        },
      },
    ],
    stackKey: null,
    position: [0, 0, 0],
    orientation: 0,
    zoneId: null,
    locked: false,
    kind: 'card',
  };
  const actions: HandActions = {
    enabled: true,
    inHand: [piece],
    groups: handGroups([piece]),
    leaving: () => undefined,
    left: vi.fn(),
    playReason: undefined,
    playInFront: vi.fn(),
    toSideTable: vi.fn(),
    reorder: vi.fn(),
  };
  const view = (active: boolean) => (
    <MantineProvider theme={appContentTheme} forceColorScheme="dark">
      <CompassActiveContext value={active}>
        <HandPanel actions={actions} />
      </CompassActiveContext>
    </MantineProvider>
  );
  const rendered = render(view(true));
  const card = screen.getByRole('button', { name: 'Drag Snooper from hand' });
  return { ...rendered, card, actions, suspend: () => rendered.rerender(view(false)) };
}

test('suspending the normal hand removes its Alt portal and global key response without replacing its shelf', () => {
  const { card, actions, suspend } = mountedHand();
  fireEvent.pointerEnter(card);
  fireEvent.keyDown(window, { key: 'Alt', altKey: true });
  expect(document.querySelector('[data-piece-close-up]')).not.toBeNull();
  suspend();
  expect(document.querySelector('[data-piece-close-up]')).toBeNull();
  fireEvent.keyDown(window, { key: 'Alt', altKey: true });
  expect(document.querySelector('[data-piece-close-up]')).toBeNull();
  expect(screen.getByRole('button', { name: 'Drag Snooper from hand' })).toBe(card);
  expect(actions.playInFront).not.toHaveBeenCalled();
  expect(actions.toSideTable).not.toHaveBeenCalled();
});

test('suspending an open hand menu removes its body portal without playing or moving a piece', async () => {
  const { card, actions, suspend } = mountedHand();
  fireEvent.contextMenu(card, { clientX: 60, clientY: 70 });
  expect(await screen.findByRole('menuitem', { name: 'Play in front of me' })).toBeTruthy();
  suspend();
  expect(screen.queryByRole('menuitem')).toBeNull();
  expect(actions.playInFront).not.toHaveBeenCalled();
  expect(actions.toSideTable).not.toHaveBeenCalled();
});
