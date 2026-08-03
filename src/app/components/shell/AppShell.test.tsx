/** @vitest-environment jsdom */

import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppShell } from './AppShell';
import { PageLayout } from './PageLayout';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

vi.mock('@db/profiles', () => ({
  useCurrentProfile: () => ({ data: null }),
}));

vi.mock('@app/components/profile/ProfileLink', () => ({
  ProfileLink: () => null,
}));

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

describe('AppShell page hero', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps the hero mounted when the route-owned page layout changes', () => {
    const container = document.createElement('div');
    const root = createRoot(container);

    act(() => {
      root.render(
        <AppShell pathname="/privacy">
          <PageLayout header={<h1>Privacy policy</h1>}>
            <p>Privacy content</p>
          </PageLayout>
        </AppShell>
      );
    });
    const expandedHero = container.querySelector('header');

    expect(expandedHero).not.toBeNull();
    expect(container.querySelector('[data-page-layout-compact="true"]')).toBeNull();

    act(() => {
      root.render(
        <AppShell pathname="/assets">
          <PageLayout>
            <h2>Assets</h2>
            <p>Asset content</p>
          </PageLayout>
        </AppShell>
      );
    });

    expect(container.querySelector('header')).toBe(expandedHero);
    expect(container.querySelector('[data-page-layout-compact="true"]')).not.toBeNull();

    act(() => root.unmount());
  });

  it('releases its document-level route and scroll state on unmount', () => {
    const container = document.createElement('div');
    const root = createRoot(container);

    act(() => {
      root.render(
        <AppShell pathname="/privacy">
          <p>Privacy content</p>
        </AppShell>
      );
    });

    expect(document.documentElement.dataset.route).toBe('/privacy');
    expect(document.documentElement.hasAttribute('data-initial-animate')).toBe(true);
    expect(document.documentElement.style.getPropertyValue('--scroll-pct')).not.toBe('');

    act(() => root.unmount());

    expect(document.documentElement.hasAttribute('data-route')).toBe(false);
    expect(document.documentElement.hasAttribute('data-initial-animate')).toBe(false);
    expect(document.documentElement.style.getPropertyValue('--scroll-pct')).toBe('');
  });

  it('publishes the approved project waypoints in the footer', () => {
    const container = document.createElement('div');
    const root = createRoot(container);

    act(() => {
      root.render(
        <AppShell pathname="/privacy">
          <p>Privacy content</p>
        </AppShell>
      );
    });

    expect(
      [...container.querySelectorAll('footer nav a')].map((link) => ({
        href: link.getAttribute('href'),
        label: link.querySelector('strong')?.textContent,
      }))
    ).toEqual([
      { href: '/__storybook/', label: 'Component library' },
      { href: 'https://github.com/ndelangen/dunezone', label: 'Source code' },
      { href: '/privacy', label: 'Privacy policy' },
    ]);

    act(() => root.unmount());
  });
});
