// @vitest-environment jsdom

import { MantineContext, MantineProvider } from '@mantine/core';
import { act, memo, use } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import { appContentTheme } from '../theme';
import { DarkSchemeIsland, StableMantineContext } from './DarkSchemeIsland';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

const noop = () => {};
const MANTINE_FIELDS = {
  colorScheme: 'dark',
  setColorScheme: noop,
  clearColorScheme: noop,
  getRootElement: () => undefined,
  classNamesPrefix: 'mantine',
  cssVariablesSelector: ':root',
  withStaticClasses: true,
} as const;

let container: HTMLDivElement | undefined;
let root: Root | undefined;

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
});

describe('DarkSchemeIsland', () => {
  it('keeps the Mantine context of its descendants when only its children change', () => {
    const seen: unknown[] = [];
    /* A memoised Mantine reader re-renders only when the context it reads changes. */
    const Reader = memo(function Reader() {
      seen.push(use(MantineContext));
      return null;
    });
    const render = (revision: number) =>
      act(() =>
        root!.render(
          <MantineProvider theme={appContentTheme}>
            <DarkSchemeIsland>
              <Reader />
              <span>{revision}</span>
            </DarkSchemeIsland>
          </MantineProvider>
        )
      );
    render(1);
    render(2);
    render(3);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ colorScheme: 'dark', cssVariablesSelector: '[data-scheme-dark]' });
  });

  it('hands its descendants a new context once one of its fields changes', () => {
    const seen: { colorScheme: string }[] = [];
    const Reader = memo(function Reader() {
      seen.push(use(MantineContext)!);
      return null;
    });
    /* The island's provider passes fixed callbacks; a provider with Mantine's defaults would make new ones on every render. */
    const fixed = { ...MANTINE_FIELDS };
    /* A context above the stable one, new on every render, changing a field the island's own provider never changes. */
    const Above = ({ scheme }: { scheme: 'dark' | 'light' }) => {
      return (
        <MantineContext value={{ ...fixed, colorScheme: scheme }}>
          <StableMantineContext>
            <Reader />
          </StableMantineContext>
        </MantineContext>
      );
    };
    const render = (scheme: 'dark' | 'light') => act(() => root!.render(<Above scheme={scheme} />));
    render('dark');
    render('dark');
    render('light');
    expect(seen.map((value) => value.colorScheme)).toEqual(['dark', 'light']);
  });
});
