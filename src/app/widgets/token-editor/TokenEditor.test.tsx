/** @vitest-environment jsdom */

import { MantineProvider } from '@mantine/core';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { appContentTheme } from '@ui/theme';
import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';

import { initialTokenDraft, TokenEditor } from './TokenEditor';
import type { TokenChapter, TokenDraft } from './TokenEditor';

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

const TYPE = 'token-disc';

/** The draft is real state, because what is guarded here is what survives a re-render. */
function Harness({ expose }: { expose: (state: { draft: TokenDraft; setDraft: (next: TokenDraft) => void }) => void }) {
  const [draft, setDraft] = useState<TokenDraft>(initialTokenDraft(TYPE));
  const [chapter, setChapter] = useState<TokenChapter>('identity');
  expose({ draft, setDraft });
  return (
    <MantineProvider theme={appContentTheme} forceColorScheme="light">
      <TokenEditor
        draft={draft}
        patch={(update) => setDraft((previous) => ({ ...previous, ...update }))}
        type={TYPE}
        chapter={chapter}
        onChapterChange={setChapter}
        onSettle={() => {}}
        backPicker={() => null}
        backProof={null}
      />
    </MantineProvider>
  );
}

/**
 * Storage is strict and the draft remembers («The stored shape of three back modes», section 2).
 *
 * The reference arm first returned a bare `{ mode: 'reference' }` on re-entry, dropping the target the author had picked.
 * Nothing on screen said so: the route keeps its own picked state, so the name and the proof carried on showing the pick while the draft no longer held it, and a save would have written a different target than the one displayed.
 * That gap is why this is pinned.
 */
it('keeps the picked target across a trip through another back mode', () => {
  let state = { draft: initialTokenDraft(TYPE), setDraft: (_next: TokenDraft) => {} };
  render(<Harness expose={(next) => (state = next)} />);
  const tile = (name: string) => screen.getByRole('radio', { name }) as HTMLInputElement;

  fireEvent.click(tile("Another token's back"));
  /* Standing in for the picker, which lives in the route and writes the target into the draft. */
  act(() => state.setDraft({ ...state.draft, back: { mode: 'reference', asset_id: 'the-picked-token' } }));

  fireEvent.click(tile('Same as front'));
  fireEvent.click(tile("Another token's back"));

  expect(state.draft.back).toEqual({ mode: 'reference', asset_id: 'the-picked-token' });
});
