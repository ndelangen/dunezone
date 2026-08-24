/** @vitest-environment jsdom */

import { MantineProvider } from '@mantine/core';
import { PageLayout } from '@ui/layout/PageLayout';
import { appContentTheme } from '@ui/theme';
import { act } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppRoot } from './AppRoot';

/* The chrome renders inside `ApplicationChrome`'s Mantine provider; mirror that here. */
function chrome(children: ReactNode) {
  return <MantineProvider theme={appContentTheme}>{children}</MantineProvider>;
}

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: { children: ReactNode; to: string }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('@db/profiles', () => ({
  useCurrentProfile: () => ({ data: null }),
}));

vi.mock('@convex-dev/auth/react', () => ({
  useAuthActions: () => ({ signIn: async () => {}, signOut: async () => {} }),
}));

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

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

describe('AppRoot page header', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps the header mounted when the route-owned page layout changes', () => {
    const container = document.createElement('div');
    const root = createRoot(container);

    act(() => {
      root.render(
        chrome(
          <AppRoot>
            <PageLayout>
              <PageLayout.Header>
                <h1>Privacy policy</h1>
              </PageLayout.Header>
              <PageLayout.Content>
                <p>Privacy content</p>
              </PageLayout.Content>
            </PageLayout>
          </AppRoot>
        )
      );
    });
    const expandedHeader = container.querySelector('header');

    expect(expandedHeader).not.toBeNull();
    expect(container.querySelector('[data-page-layout-compact="true"]')).toBeNull();

    act(() => {
      root.render(
        chrome(
          <AppRoot>
            <PageLayout>
              <h2>Assets</h2>
              <p>Asset content</p>
            </PageLayout>
          </AppRoot>
        )
      );
    });

    expect(container.querySelector('header')).toBe(expandedHeader);
    expect(container.querySelector('[data-page-layout-compact="true"]')).not.toBeNull();

    act(() => root.unmount());
  });

  it('releases the scroll progress and motion verdict it publishes on unmount', () => {
    const container = document.createElement('div');
    const root = createRoot(container);

    act(() => {
      root.render(
        chrome(
          <AppRoot>
            <p>Privacy content</p>
          </AppRoot>
        )
      );
    });

    expect(document.documentElement.style.getPropertyValue('--scroll-pct')).not.toBe('');
    expect(document.documentElement.dataset.motion).toBe('ok');

    act(() => root.unmount());

    expect(document.documentElement.style.getPropertyValue('--scroll-pct')).toBe('');
    expect(document.documentElement.dataset.motion).toBeUndefined();
  });

  it('publishes the approved project waypoints in the footer', () => {
    const container = document.createElement('div');
    const root = createRoot(container);

    act(() => {
      root.render(
        chrome(
          <AppRoot>
            <p>Privacy content</p>
          </AppRoot>
        )
      );
    });

    expect(
      [...container.querySelectorAll('footer nav a')].map((link) => ({
        href: link.getAttribute('href'),
        label: link.getAttribute('aria-label'),
      }))
    ).toEqual([
      { href: '/__storybook/', label: 'Component library' },
      { href: 'https://github.com/ndelangen/dunezone', label: 'Source code' },
      { href: '/privacy', label: 'Privacy policy' },
      {
        href: 'https://discord.com/invite/dune-tabletop-624609341886169117',
        label: 'Dune Discord server',
      },
      { href: 'https://www.reddit.com/r/DuneBoardGame/', label: 'r/DuneBoardGame on Reddit' },
      {
        href: 'https://boardgamegeek.com/boardgame/283355/dune/forums/69',
        label: 'Dune forums on BoardGameGeek',
      },
    ]);
    expect(container.querySelector('footer [role="radiogroup"]')).toBeNull();

    act(() => root.unmount());
  });
});
