// @vitest-environment jsdom

import { MantineProvider } from '@mantine/core';
import { act, cleanup, render, screen } from '@testing-library/react';
import { PageLayout } from '@ui/layout/PageLayout';
import { appContentTheme } from '@ui/theme';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { useEditPageHeader } from './useEditPageHeader';
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

let settle = () => undefined as void;

function Page({ warnings }: { warnings: ValidationHeaderWarning[] }) {
  const header = useEditPageHeader({ id: 'warnings', warnings, onFocusWarning: () => undefined });
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
