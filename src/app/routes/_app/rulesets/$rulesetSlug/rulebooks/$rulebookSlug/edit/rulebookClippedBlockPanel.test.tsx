// @vitest-environment jsdom

import { MantineProvider, TextInput } from '@mantine/core';
import type { RulebookBlockKind } from '@shared/rulebooks/contents';
import { cleanup, render, screen } from '@testing-library/react';
import { appContentTheme } from '@ui/theme';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { RulebookClippedBlockPanel } from './rulebookClippedBlockPanel';

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

function panel(clippedKind: RulebookBlockKind | undefined) {
  return (
    <MantineProvider theme={appContentTheme} forceColorScheme="light">
      <RulebookClippedBlockPanel clippedKind={clippedKind}>
        <TextInput aria-label="Caption" defaultValue="" />
      </RulebookClippedBlockPanel>
    </MantineProvider>
  );
}

describe('RulebookClippedBlockPanel', () => {
  /* A late clipping measurement must not replace the editor the author is typing into, or the edit in flight lands on a detached field. */
  test.each([
    ['appears', undefined, 'referenced-illustration'],
    ['goes', 'referenced-illustration', undefined],
  ] as const)('keeps the focused editor field when the clipped notice %s', (_, before, after) => {
    const view = render(panel(before));
    const field = screen.getByRole('textbox', { name: 'Caption' });
    field.focus();

    view.rerender(panel(after));

    expect(screen.getByRole('textbox', { name: 'Caption' })).toBe(field);
    expect(field.isConnected).toBe(true);
    expect(document.activeElement).toBe(field);
  });
});
