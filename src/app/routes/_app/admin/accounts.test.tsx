/** @vitest-environment jsdom */

import { MantineProvider } from '@mantine/core';
import type * as TanStackRouter from '@tanstack/react-router';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { appContentTheme } from '@ui/theme';
import type { ComponentType, ReactNode } from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';

const responses = vi.hoisted(() => ({ answeredCursor: null as string | null, requestedCursor: null as string | null }));
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof TanStackRouter>()),
  createFileRoute: () => (options: unknown) => ({ options }),
  Link: ({ children, to }: { children?: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));
vi.mock('@db/accounts', () => ({
  authProviderNames: {},
  useMergeAccounts: () => vi.fn(),
  useResumeAccountMerge: () => vi.fn(),
  /* The doorway holds the previous answer while another cursor is loading. */
  useAccountManagementPage: (cursor: string | null) => {
    responses.requestedCursor = cursor;
    return {
      isRefreshing: cursor !== responses.answeredCursor,
      profiles: {
        page: [{ userId: 'profile', name: responses.answeredCursor ?? 'First page', slug: 'profile', methods: [] }],
        continueCursor: responses.answeredCursor === null ? 'Second page' : 'Third page',
        isDone: false,
      },
      selected: [],
      operations: [],
      failedOperations: { page: [], continueCursor: '', isDone: true },
    };
  },
}));

import { Route } from './accounts.route';

const AccountsPage = Route.options.component as ComponentType;
const page = () => (
  <MantineProvider env="test" theme={appContentTheme}>
    <AccountsPage />
  </MantineProvider>
);

beforeEach(() => {
  responses.answeredCursor = null;
  responses.requestedCursor = null;
  window.matchMedia = vi
    .fn()
    .mockImplementation(() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test('rapid Next clicks keep one history entry while profile results are pending', () => {
  const view = render(page());
  const next = view.getByRole('button', { name: 'Next' });
  fireEvent.click(next);
  fireEvent.click(next);
  responses.answeredCursor = 'Second page';
  view.rerender(page());
  fireEvent.click(view.getByRole('button', { name: 'Previous' }));
  expect(responses.requestedCursor).toBeNull();
});

test('rapid Previous clicks cannot skip a page while profile results are pending', () => {
  const view = render(page());
  fireEvent.click(view.getByRole('button', { name: 'Next' }));
  responses.answeredCursor = 'Second page';
  view.rerender(page());
  fireEvent.click(view.getByRole('button', { name: 'Next' }));
  responses.answeredCursor = 'Third page';
  view.rerender(page());
  const previous = view.getByRole('button', { name: 'Previous' });
  fireEvent.click(previous);
  fireEvent.click(previous);
  expect(responses.requestedCursor).toBe('Second page');
});
