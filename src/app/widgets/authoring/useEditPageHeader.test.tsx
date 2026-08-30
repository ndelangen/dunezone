// @vitest-environment jsdom

import { MantineProvider } from '@mantine/core';
import { act, cleanup, render, screen } from '@testing-library/react';
import { PageLayout } from '@ui/layout/PageLayout';
import { appContentTheme } from '@ui/theme';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { useEditPageHeader } from './useEditPageHeader';
import { ValidationHeader } from './ValidationHeader';
import type { ValidationHeaderWarning } from './ValidationHeader';

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

let settle: () => void = () => undefined;

function Page({ warnings }: { warnings: ValidationHeaderWarning[] }) {
  const header = useEditPageHeader({ warnings, onFocusWarning: () => undefined });
  settle = header.settle;
  return (
    <PageLayout>
      {header.slot}
      <PageLayout.Content>
        <p>Editor</p>
      </PageLayout.Content>
    </PageLayout>
  );
}

function renderPage(warnings: ValidationHeaderWarning[]) {
  return render(
    <MantineProvider theme={appContentTheme} forceColorScheme="light">
      <Page warnings={warnings} />
    </MantineProvider>
  );
}

const band = () => document.querySelector('[data-page-layout-header-size]');

describe('the edit page header', () => {
  test('the band opens on warnings, and PageLayout recognises the slot', () => {
    renderPage([{ source: 'Backside', missing: 'a label' }]);

    /* The band's own attribute, not just the chip: a slot the layout failed to recognise would
       still render nothing here while leaving the page marked deliberately headerless. */
    expect(band()?.getAttribute('data-page-layout-header-size')).toBe('compact');
    expect(document.querySelector('[data-page-layout-compact]')).toBeNull();
    expect(screen.getByRole('button', { name: 'Backside: missing a label' })).toBeTruthy();
  });

  test('a page with no warnings is a page with no band', () => {
    renderPage([]);

    expect(band()).toBeNull();
    expect(document.querySelector('[data-page-layout-compact]')?.getAttribute('data-page-layout-compact')).toBe('true');
  });

  test('the band survives the last warning clearing, and says nothing while it waits', () => {
    const { rerender } = renderPage([{ source: 'Backside', missing: 'a label' }]);

    rerender(
      <MantineProvider theme={appContentTheme} forceColorScheme="light">
        <Page warnings={[]} />
      </MantineProvider>
    );

    /* The latch holds the band through the keystroke that cleared the warning, so the page does
       not jump; the strip inside it has nothing true to say and so says nothing. */
    expect(band()?.getAttribute('data-page-layout-header-size')).toBe('compact');
    expect(screen.queryByText('Needs attention')).toBeNull();
    expect(screen.queryByRole('button', { name: /Backside/ })).toBeNull();

    act(() => settle());

    expect(band()).toBeNull();
  });
});

/**
 * Why this is a hook returning an element rather than a component rendering one.
 *
 * `PageLayout` walks its direct children and matches on component identity, so a wrapper that renders a `PageLayout.Header` is itself the child and the layout never sees the slot.
 * That is #444, and the reason it is worth a test rather than a sentence is the shape of the failure: the page does not break visibly, it renders as a deliberately headerless page, because `data-page-layout-compact` is exactly the flag a page sets to declare itself one and the shell sizes its artwork from it.
 * If a future change to the slot walk makes wrappers work, this test fails and the hook can become the component the ticket originally asked for.
 */
describe('the shape this pattern is forced into', () => {
  function WrappedHeader({ warnings }: { warnings: ValidationHeaderWarning[] }) {
    return (
      <PageLayout.Header size="compact">
        <ValidationHeader warnings={warnings} onFocusWarning={() => undefined} />
      </PageLayout.Header>
    );
  }

  test('a wrapper component loses the slot, and the page claims it meant to have no band', () => {
    render(
      <MantineProvider theme={appContentTheme} forceColorScheme="light">
        <PageLayout>
          <WrappedHeader warnings={[{ source: 'Backside', missing: 'a label' }]} />
          <PageLayout.Content>
            <p>Editor</p>
          </PageLayout.Content>
        </PageLayout>
      </MantineProvider>
    );

    expect(band()).toBeNull();
    expect(document.querySelector('[data-page-layout-compact]')?.getAttribute('data-page-layout-compact')).toBe('true');
    expect(screen.queryByRole('button', { name: /Backside/ })).toBeNull();
  });
});
