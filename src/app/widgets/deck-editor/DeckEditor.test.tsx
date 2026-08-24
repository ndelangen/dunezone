/** @vitest-environment jsdom */

import { MantineProvider } from '@mantine/core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { appContentTheme } from '@ui/theme';
import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';

import { DeckEditor, INITIAL_DECK_DRAFT } from './DeckEditor';
import type { DeckChapter, DeckDraft } from './DeckEditor';
import { STOCK_CARDBACKS } from './stockCardbacks';

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

/* `PreviewChoice` constructs a ResizeObserver without guarding for its absence, and jsdom has none.
   It never has to fire: nothing in these tests depends on a reported size. */
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
        nameField={<input aria-label="Name" readOnly value="" />}
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

/**
 * Storage is strict and the draft remembers («The stored shape of three back modes», section 2).
 *
 * The first version of this control returned the first stock back when Composed was re-entered, so a detour through the reference tile silently discarded whatever the author had composed.
 * The docblock claimed otherwise, which is why this is pinned rather than left to the comment.
 */
it('keeps a composed cardback across a trip through the reference tile', () => {
  const { container } = render(<Harness />);
  const tile = (name: string) => screen.getByRole('radio', { name }) as HTMLInputElement;
  const labelField = () => container.querySelector<HTMLInputElement>('input[aria-label="Label"]');

  fireEvent.click(tile('Composed here'));
  fireEvent.change(labelField() as HTMLInputElement, { target: { value: 'Hand of the Emperor' } });
  expect(labelField()?.value).toBe('Hand of the Emperor');

  fireEvent.click(tile("Another deck's back"));
  fireEvent.click(tile('Composed here'));

  expect(labelField()?.value).toBe('Hand of the Emperor');
});

/**
 * A draft is transiently invalid on the way to being valid, and the proof has to keep drawing through it.
 *
 * `ColorInput` commits raw input text per keystroke and repairs only on blur, so five of the six characters in a hex colour reach the draft as a value `HEXCOLOR` rejects.
 * The type says nothing about this: `CardbackData` is `z.infer<typeof CardBack>` and a regex-refined string infers as plain `string`, which is why nothing caught it until #683 made the parse real.
 * Pinned here rather than left to the docblock on `CardbackProof`, because the failure was invisible: the proof blanked to a neutral face for six keystrokes out of seven and recovered on the last one.
 */
it('draws the cardback proof while a colour is still being typed', () => {
  const emblem = STOCK_CARDBACKS[0]!.cardback.image;
  const withFirstColor = (color: string): DeckDraft => ({
    ...INITIAL_DECK_DRAFT,
    cardback: {
      mode: 'custom',
      ...STOCK_CARDBACKS[0]!.cardback,
      background: {
        ...STOCK_CARDBACKS[0]!.cardback.background,
        colors: [color, STOCK_CARDBACKS[0]!.cardback.background.colors[1]],
      },
    },
  });
  const emblemCount = (draft: DeckDraft) => {
    const { container, unmount } = render(
      <MantineProvider theme={appContentTheme} forceColorScheme="light">
        <DeckEditor
          nameField={<input aria-label="Name" readOnly value="" />}
          draft={draft}
          patch={() => {}}
          chapter="identity"
          onChapterChange={() => {}}
          onSettle={() => {}}
          members={[]}
          onCountChange={null}
          cardPicker={null}
          backPicker={null}
          backProof={null}
        />
      </MantineProvider>
    );
    const count = container.querySelectorAll(`img[src="${emblem}"]`).length;
    unmount();
    return count;
  };

  const complete = emblemCount(withFirstColor('#4B4C0D'));
  /*
   * More than one, not more than zero, and the difference is the whole guard.
   * The stock picker tile draws this same emblem once, outside the canvas, so a count of exactly one means
   * `CanvasScale` mounted nothing and there is no proof in the DOM to compare prefixes against.
   * `CardBack` draws the emblem three times, so a proof that really mounted puts the count at four.
   */
  expect(complete).toBeGreaterThan(1);
  /* Every prefix of that colour draws the same face, rather than the proof blanking and coming back. */
  for (const partial of ['#', '#4', '#4B', '#4B4', '#4B4C', '#4B4C0']) {
    expect(emblemCount(withFirstColor(partial))).toBe(complete);
  }
});
