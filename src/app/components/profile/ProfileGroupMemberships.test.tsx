// @vitest-environment jsdom

import { MantineProvider } from '@mantine/core';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { appContentTheme } from '@app/theme';

import type { Id } from '../../../../convex/_generated/dataModel';

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

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, params }: { children: React.ReactNode; params: { groupSlug: string } }) => (
    <a href={`/groups/${params.groupSlug}`}>{children}</a>
  ),
}));

import { ProfileGroupMemberships } from './ProfileGroupMemberships';

afterEach(cleanup);

describe('Profile Group memberships', () => {
  test('renders ordered Group names as canonical slug links', () => {
    render(
      <MantineProvider theme={appContentTheme} forceColorScheme="light">
        <ProfileGroupMemberships
          groups={[
            {
              id: 'group-2' as Id<'groups'>,
              name: 'Sietch Tabr',
              slug: 'sietch-tabr',
            },
            {
              id: 'group-1' as Id<'groups'>,
              name: 'Fremen Council',
              slug: 'fremen-council',
            },
          ]}
        />
      </MantineProvider>
    );

    const links = screen.getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual(['Sietch Tabr', 'Fremen Council']);
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/groups/sietch-tabr',
      '/groups/fremen-council',
    ]);
  });

  test('renders the existing empty state when no resolvable active Groups remain', () => {
    render(
      <MantineProvider theme={appContentTheme} forceColorScheme="light">
        <ProfileGroupMemberships groups={[]} />
      </MantineProvider>
    );

    expect(screen.getByText('Not a member of any groups.')).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
  });
});
