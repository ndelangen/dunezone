/** @vitest-environment jsdom */

import { MantineProvider } from '@mantine/core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { appContentTheme } from '@ui/theme';
import { afterEach, expect, test } from 'vite-plus/test';

import { CompassActiveContext } from '../../compass/controlsActive';
import { stubMatchMedia } from '../../multiplayer/jsdom.test.fixture';
import { heldTechTokenPiece } from './heldTechTokenPiece';
import { HeldTechTokens } from './HeldTechTokens';

stubMatchMedia();
afterEach(cleanup);

const HEIGHLINERS = {
  back: 'https://dune.zone/tech-back.jpg',
  front: 'https://dune.zone/heighliners.jpg',
  name: 'Heighliners',
  description: 'Ship two extra troops.',
};

function mounted(active = true, token: Parameters<typeof heldTechTokenPiece>[0] = HEIGHLINERS) {
  return render(
    <MantineProvider theme={appContentTheme} forceColorScheme="dark">
      <CompassActiveContext value={active}>
        <HeldTechTokens tokens={[heldTechTokenPiece(token, 'atreides', 0)]} />
      </CompassActiveContext>
    </MantineProvider>
  );
}

test('Alt over a held tech token shows it larger with what it does', () => {
  mounted();
  fireEvent.pointerEnter(screen.getByRole('listitem', { name: 'Heighliners' }));
  fireEvent.keyDown(window, { key: 'Alt', altKey: true });
  const closeUp = document.querySelector('[data-piece-close-up]');
  expect(closeUp).not.toBeNull();
  expect(closeUp?.textContent).toContain('Ship two extra troops.');
});

test('a suspended window shows no close-up', () => {
  mounted(false);
  fireEvent.pointerEnter(screen.getByRole('listitem', { name: 'Heighliners' }));
  fireEvent.keyDown(window, { key: 'Alt', altKey: true });
  expect(document.querySelector('[data-piece-close-up]')).toBeNull();
});

test('hovering a held tech token names it and says what it does', async () => {
  mounted();
  fireEvent.mouseEnter(screen.getByRole('listitem', { name: 'Heighliners' }));
  expect(await screen.findByRole('tooltip')).toHaveProperty('textContent', 'HeighlinersShip two extra troops.');
});

test('a face-down token is named only as a tech token', () => {
  mounted(true, { back: HEIGHLINERS.back });
  expect(screen.getByRole('listitem', { name: 'Face-down tech token' })).toBeTruthy();
});

test('Alt over a face-down token shows its back larger, and nothing of its face', () => {
  mounted(true, { back: HEIGHLINERS.back });
  fireEvent.pointerEnter(screen.getByRole('listitem', { name: 'Face-down tech token' }));
  fireEvent.keyDown(window, { key: 'Alt', altKey: true });
  const closeUp = document.querySelector('[data-piece-close-up]');
  expect(closeUp?.innerHTML).toContain(HEIGHLINERS.back);
  expect(closeUp?.innerHTML).not.toContain(HEIGHLINERS.front);
});
