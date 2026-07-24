// @vitest-environment jsdom

import { MantineProvider } from '@mantine/core';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { appContentTheme } from '@app/theme';
import { defaultFaction } from '@data/defaultFaction';

import { FactionSheetReview } from './FactionSheetReview';

vi.mock('./FactionSheetPagePreview', () => ({
  factionDraftForRenderer: (faction: unknown) => faction,
  FactionSheetPagePreview: ({ pageNumber }: { pageNumber: 1 | 2 }) => (
    <div data-faction-sheet-page-preview={pageNumber} />
  ),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let container: HTMLDivElement | undefined;
let root: Root | undefined;

function getButton(name: string) {
  const button = [...(container?.querySelectorAll('button') ?? [])].find(
    (candidate) =>
      candidate.getAttribute('aria-label') === name || candidate.textContent?.trim() === name
  );
  if (!button) throw new Error(`Missing button: ${name}`);
  return button;
}

async function renderReview() {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <MantineProvider theme={appContentTheme} forceColorScheme="light">
        <FactionSheetReview faction={structuredClone(defaultFaction)}>
          <div data-testid="editor-content">Editor content</div>
        </FactionSheetReview>
      </MantineProvider>
    );
  });
}

async function clickButton(name: string) {
  await act(async () => getButton(name).click());
}

beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation(() => ({
      matches: true,
      media: '(min-width: 48em)',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  );
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn().mockImplementation((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    })
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('FactionSheetReview', () => {
  it('lazy-mounts once, closes with animation state, and retains the mounted panel', async () => {
    await renderReview();
    expect(container?.querySelector('[data-faction-review-panel]')).toBeNull();

    await clickButton('Review faction sheet');

    expect(
      container?.querySelector('[data-faction-sheet-review]')?.hasAttribute('data-review-open')
    ).toBe(true);
    const panel = container?.querySelector('[data-faction-review-panel]');
    expect(panel).not.toBeNull();
    expect(panel?.getAttribute('aria-hidden')).toBe('false');

    await clickButton('Return to editing');

    expect(
      container?.querySelector('[data-faction-sheet-review]')?.hasAttribute('data-review-open')
    ).toBe(false);
    expect(container?.querySelector('[data-faction-review-panel]')).toBe(panel);
    expect(panel?.getAttribute('aria-hidden')).toBe('true');
  });

  it('closes from the editor strip and keeps the review scroll position across reopen', async () => {
    await renderReview();
    await clickButton('Review faction sheet');

    const scroller = container?.querySelector('[data-faction-review-scroller]');
    expect(scroller).toBeInstanceOf(HTMLElement);
    if (!(scroller instanceof HTMLElement)) return;
    scroller.scrollTop = 173;

    await clickButton('Close sheet review and return to editing');
    await clickButton('Review faction sheet');

    expect(container?.querySelector('[data-faction-review-scroller]')).toBe(scroller);
    expect(scroller.scrollTop).toBe(173);
  });

  it('makes the editor inert while leaving the proof and close controls active', async () => {
    await renderReview();
    await clickButton('Review faction sheet');

    expect(container?.querySelector('[data-faction-review-editor-plane] [inert]')).not.toBeNull();
    expect(getButton('Close faction sheet review')).not.toBeNull();
    expect(container?.querySelector('[data-faction-review-proof-desk]')).not.toBeNull();
  });
});
