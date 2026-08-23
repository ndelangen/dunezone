/** @vitest-environment jsdom */

import { MantineProvider } from '@mantine/core';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { appContentTheme } from '@ui/theme';
import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';

import { initialTokenDraft, TokenEditor, tokenDraftWarnings } from './TokenEditor';
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

/*
 * jsdom has no layout, so an observer that never fires reports width 0 and `CanvasScale` renders no children at all.
 * This editor draws its proof inside one, so a dead stub would let an assertion about that proof pass against a DOM that never contained it.
 * Reporting a width mounts what the rail actually draws.
 */
globalThis.ResizeObserver = class ResizeObserver {
  constructor(private readonly callback: ResizeObserverCallback) {}
  observe() {
    this.callback([{ contentRect: { width: 900 } } as ResizeObserverEntry], this);
  }
  unobserve() {}
  disconnect() {}
};

afterEach(cleanup);

const TYPE = 'token-disc';

/** The draft is real state, because what is guarded here is what survives a re-render. */
function Harness({
  expose = () => {},
  onSettle = () => {},
}: {
  expose?: (state: { draft: TokenDraft; setDraft: (next: TokenDraft) => void }) => void;
  onSettle?: () => void;
}) {
  const [draft, setDraft] = useState<TokenDraft>(initialTokenDraft(TYPE));
  const [chapter, setChapter] = useState<TokenChapter>('identity');
  expose({ draft, setDraft });
  return (
    <MantineProvider theme={appContentTheme} forceColorScheme="light">
      <TokenEditor
        nameField={<input aria-label="Name" readOnly value="" />}
        draft={draft}
        patch={(update) => setDraft((previous) => ({ ...previous, ...update }))}
        type={TYPE}
        chapter={chapter}
        onChapterChange={setChapter}
        onSettle={onSettle}
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

/**
 * The draft says "chosen, nothing picked" rather than the route inferring it.
 *
 * The warning used to read a `hasBackReference` flag the route passed in, seeded from server state, so the widget needed the route to whisper what the draft already knew and the two could disagree.
 * A reference with a null target is now a state the draft holds and the warning reads directly.
 */
it('warns that a chosen reference has no token picked, from the draft alone', () => {
  expect(
    tokenDraftWarnings({ ...initialTokenDraft(TYPE), back: { mode: 'reference', asset_id: null } })
  ).toContainEqual({ source: 'Identity', missing: 'a back token', chapter: 'identity' });
  expect(
    tokenDraftWarnings({ ...initialTokenDraft(TYPE), back: { mode: 'reference', asset_id: 'picked' } })
  ).not.toContainEqual({ source: 'Identity', missing: 'a back token', chapter: 'identity' });
});

/**
 * `onSettle` is documented as firing on field blur, and the element carrying that is this editor's own, not the layout's: `WorkbenchLayout` arranges chapters beside a rail and knows nothing about drafts.
 * Pinned because the handler moved here off the layout's grid, and a wrong element fails silently.
 * Note the event: React implements `onBlur` over `focusout`, so a non-bubbling `blur` never reaches it.
 */
it('settles when focus leaves a field', () => {
  const onSettle = vi.fn();
  render(<Harness onSettle={onSettle} />);
  const name = document.querySelector('input[aria-label="Name"]');
  if (name === null) {
    throw new Error('the harness renders a name field');
  }
  fireEvent.focus(name);
  fireEvent.focusOut(name);
  expect(onSettle).toHaveBeenCalled();
});
