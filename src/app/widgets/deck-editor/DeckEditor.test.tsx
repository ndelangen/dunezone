/** @vitest-environment jsdom */

import { MantineProvider } from '@mantine/core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { appContentTheme } from '@ui/theme';
import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';

import { DeckEditor, INITIAL_DECK_DRAFT } from './DeckEditor';
import type { DeckChapter, DeckDraft } from './DeckEditor';

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

globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

afterEach(cleanup);

/** The draft is real state, because the defect this guards was the control failing to survive a re-render. */
function Harness() {
  const [draft, setDraft] = useState<DeckDraft>(INITIAL_DECK_DRAFT);
  const [chapter, setChapter] = useState<DeckChapter>('identity');
  return (
    <MantineProvider theme={appContentTheme} forceColorScheme="light">
      <DeckEditor
        draft={draft}
        patch={(update) => setDraft((previous) => ({ ...previous, ...update }))}
        chapter={chapter}
        onChapterChange={setChapter}
        onSettle={() => {}}
        members={[]}
        onCountChange={null}
        cardPicker={null}
        backPicker={null}
        backProof={null}
      />
    </MantineProvider>
  );
}

/**
 * The one thing a stock-or-authored control has to do, asserted through the interface rather than the state.
 *
 * A fresh deck starts on a stock cardback, so this transition is the only route to an authored one.
 * #571 broke exactly it: `selected` was derived from the draft, Custom patched nothing, and the control snapped back.
 * It survived every other kind of test here because they all reach for a stock option (see the ticket).
 *
 * The control has since become three tiles rather than a select, so this reaches for a radio instead of an option;
 * the guarantee is unchanged, which is the point of asserting the interface rather than the markup.
 */
it('reaches an authored cardback from the stock one it starts on', () => {
  const { container } = render(<Harness />);
  const tile = (name: string) => screen.getByRole('radio', { name }) as HTMLInputElement;
  /* By attribute rather than by label text: the composition panel names more than one thing 'Label'. */
  const labelField = () => container.querySelector('input[aria-label="Label"]');

  expect(tile('Stock').checked).toBe(true);
  expect(labelField()).toBeNull();

  fireEvent.click(tile('Composed here'));

  expect(tile('Composed here').checked).toBe(true);
  /* The composition fields are the point: a control reading "Composed here" over a panel that never appeared is the defect. */
  expect(labelField()).not.toBeNull();
});
