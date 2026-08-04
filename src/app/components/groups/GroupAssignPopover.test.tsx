// @vitest-environment jsdom

import { MantineProvider } from '@mantine/core';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { UserGroupMembershipWithGroup } from '@db/members';
import { appContentTheme } from '@app/theme';

import { GroupAssignPopover } from './GroupAssignPopover';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

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

globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

vi.mock('@app/members/db', () => ({
  useUserGroupMembershipGroups: (
    memberships: Array<{
      groups: { id: string; name: string; slug: string } | null;
    }>
  ) => memberships.map((membership) => membership.groups).filter(Boolean),
  useUserGroupMemberships: () => ({ data: [], isPending: false }),
}));

let container: HTMLDivElement | undefined;
let root: Root | undefined;

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount());
  }
  container?.remove();
  root = undefined;
  container = undefined;
});

describe('GroupAssignPopover', () => {
  it('places popover semantics on the focusable trigger and returns focus when closed', async () => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <MantineProvider theme={appContentTheme} forceColorScheme="light">
          <GroupAssignPopover
            disabled={false}
            userId="user-1"
            isUserPending={false}
            onChangeGroup={vi.fn(async () => undefined)}
            prefetchedMemberships={
              [
                {
                  groups: {
                    id: 'group-1',
                    name: 'Arrakeen Rules Council',
                    slug: 'arrakeen-rules-council',
                  },
                },
              ] as unknown as UserGroupMembershipWithGroup[]
            }
          />
        </MantineProvider>
      );
    });

    const trigger = container.querySelector<HTMLButtonElement>('button[aria-label="Assign group"]');
    expect(trigger).not.toBeNull();
    if (!trigger) {
      return;
    }

    expect(trigger.getAttribute('aria-haspopup')).toBe('dialog');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.hasAttribute('aria-controls')).toBe(false);

    trigger.focus();
    await act(async () => trigger.click());

    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const controlsId = trigger.getAttribute('aria-controls');
    expect(controlsId).toBeTruthy();
    await act(async () => new Promise((resolve) => setTimeout(resolve, 200)));
    expect(document.getElementById(controlsId as string)).not.toBeNull();
    const searchInput = document.querySelector<HTMLInputElement>(
      'input[placeholder="Type group name or slug…"]'
    );
    expect(searchInput).not.toBeNull();
    if (!searchInput) {
      return;
    }
    searchInput.focus();

    await act(async () => {
      searchInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
  });
});
