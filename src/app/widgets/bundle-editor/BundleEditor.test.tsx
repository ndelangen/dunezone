/** @vitest-environment jsdom */

import { MantineProvider } from '@mantine/core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { appContentTheme } from '@ui/theme';
import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';

import { BundleEditor, INITIAL_BUNDLE_DRAFT } from './BundleEditor';
import type { BundleChapter, BundleDraft } from './BundleEditor';

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
  const [draft, setDraft] = useState<BundleDraft>(INITIAL_BUNDLE_DRAFT);
  const [chapter, setChapter] = useState<BundleChapter>('identity');
  return (
    <MantineProvider theme={appContentTheme} forceColorScheme="light">
      <BundleEditor
        nameField={<input aria-label="Name" readOnly value="" />}
        draft={draft}
        patch={(update) => setDraft((previous) => ({ ...previous, ...update }))}
        chapter={chapter}
        onChapterChange={setChapter}
        onSettle={() => {}}
        members={[]}
        onCountChange={null}
        tokenPicker={null}
      />
    </MantineProvider>
  );
}

/**
 * The one thing a stock-or-authored control has to do, asserted through the interface rather than the state.
 *
 * A fresh bundle starts on a stock band, so this transition is the only route to an authored one.
 * #571 broke exactly it: `selected` was derived from the draft, Custom patched nothing, and the control snapped back.
 * It survived every other kind of test here because they all reach for a stock option (see the ticket).
 */
it('reaches an authored band from the stock one it starts on', () => {
  const { container } = render(<Harness />);
  const bandSelect = () => container.querySelector<HTMLInputElement>('input[aria-label="Band"]');
  const labelField = () => container.querySelector('input[aria-label="Label"]');

  expect(bandSelect()?.value).toBe('Tech band');
  expect(labelField()).toBeNull();

  fireEvent.click(bandSelect() as HTMLInputElement);
  fireEvent.click(screen.getByText('Custom…'));

  expect(bandSelect()?.value).toBe('Custom…');
  /* The composition fields are the point: a control reading "Custom" over a panel that never appeared is the defect. */
  expect(labelField()).not.toBeNull();
});
