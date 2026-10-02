/** @vitest-environment jsdom */

import { MantineProvider } from '@mantine/core';
import { emptyDraft } from '@shared/play/drafting';
import { emptyPublicControls } from '@shared/play/inventory';
import { cleanup, render, screen } from '@testing-library/react';
import { appContentTheme } from '@ui/theme';
import { afterEach, expect, test, vi } from 'vitest';

import { DraftingNotice } from './Drafting';
import type { TableProjection, TableSession } from './TableSession';

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

afterEach(cleanup);

function renderNotice(viewerSeat: string) {
  const table = {
    viewer: { viewerSeat },
    snapshot: {
      stage: 'drafting',
      draft: { ...emptyDraft(2), failure: 'The deal did not go through.' },
      controls: { ...emptyPublicControls(), seats: ['seat-1', 'seat-2'] },
    },
    canInteract: true,
    seatCommandPending: false,
  } as unknown as TableProjection;
  render(
    <MantineProvider theme={appContentTheme}>
      <DraftingNotice client={{ command: vi.fn() } as unknown as TableSession} table={table} />
    </MantineProvider>
  );
}

test('a failed deal offers the retry to a seated player only, since the Worker refuses a spectator draft command', () => {
  renderNotice('neutral');
  expect(screen.getByText('The deal did not go through.', { exact: false })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  cleanup();
  renderNotice('seat-1');
  expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
});
