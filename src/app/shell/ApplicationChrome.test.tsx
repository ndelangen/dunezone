/** @vitest-environment jsdom */

import { useMantineColorScheme } from '@mantine/core';
import { cleanup, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vite-plus/test';

import { ApplicationChrome } from './ApplicationChrome';

vi.mock('./AppRoot', () => ({ AppRoot: ({ children }: { children: ReactNode }) => children }));

function Scheme() {
  const { colorScheme } = useMantineColorScheme();
  return <span>{colorScheme}</span>;
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  document.documentElement.removeAttribute('data-mantine-color-scheme');
  vi.unstubAllGlobals();
});

it('keeps the app dark despite saved light preferences and a light OS hint', () => {
  localStorage.setItem('dunezone-color-scheme', 'light');
  localStorage.setItem('mantine-color-scheme-value', 'light');
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({ matches: false, addEventListener() {}, removeEventListener() {} })
  );
  const { getByText } = render(
    <ApplicationChrome>
      <Scheme />
    </ApplicationChrome>
  );
  expect(getByText('dark')).toBeTruthy();
  expect(document.documentElement.getAttribute('data-mantine-color-scheme')).toBe('dark');
});

it('renders dark Mantine content on the server too', () => {
  expect(
    renderToString(
      <ApplicationChrome>
        <Scheme />
      </ApplicationChrome>
    )
  ).toContain('<span>dark</span>');
});
