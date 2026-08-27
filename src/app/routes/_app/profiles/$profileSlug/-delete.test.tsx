/** @vitest-environment jsdom */

import { MantineProvider } from '@mantine/core';
import type * as TanStackRouter from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { appContentTheme } from '@ui/theme';
import type { ComponentType, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  page: vi.fn(),
  mutate: vi.fn(),
  pickerMount: vi.fn(),
  pending: false,
  error: null as Error | null,
}));

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof TanStackRouter>();
  return {
    ...actual,
    createFileRoute: () => (options: unknown) => ({ options, useParams: () => ({ profileSlug: 'source' }) }),
    Link: ({ children, to }: { children?: ReactNode; to: string }) => <a href={to}>{children}</a>,
    /* `PageMessage.Back` is built with `createLink`, whose `useLinkProps` reads router context and
       throws without a `RouterProvider`. Mocking it to the same plain anchor `Link` already gets
       keeps this a unit test of the page rather than of the router. */
    createLink:
      () =>
      ({ children, to }: { children?: ReactNode; to: string }) => <a href={to}>{children}</a>,
  };
});

vi.mock('@db/accountDeletion', () => ({
  useAccountDeletionPage: mocks.page,
  useConfirmAccountDeletion: () => ({
    mutate: mocks.mutate,
    isPending: mocks.pending,
    isError: mocks.error !== null,
    error: mocks.error,
  }),
}));

vi.mock('@app/pickers/ProfilePicker', () => ({
  ProfilePicker: ({ onPick, onCancel }: { onPick: (profile: unknown) => void; onCancel: () => void }) => {
    mocks.pickerMount();
    return (
      <div>
        <button
          onClick={() =>
            onPick({
              profileId: 'profile-2',
              userId: 'user-2',
              slug: 'replacement',
              username: 'Replacement',
              avatarUrl: null,
            })
          }
        >
          Pick replacement
        </button>
        <button onClick={onCancel}>Cancel picker</button>
      </div>
    );
  },
}));

import { Route } from './delete';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const DeletePage = Route.options.component as ComponentType;
const activePage = {
  kind: 'active',
  profile: { slug: 'source', username: 'Source' },
  summary: [
    { kind: 'group', hasActive: true, hasDeleted: false },
    { kind: 'faction', hasActive: false, hasDeleted: true },
    { kind: 'ruleset', hasActive: false, hasDeleted: false },
  ],
};

async function renderPage() {
  let view: ReturnType<typeof render> | undefined;
  await act(async () => {
    view = render(
      <MantineProvider theme={appContentTheme}>
        <DeletePage />
      </MantineProvider>
    );
  });
  if (!view) {
    throw new Error('Delete page did not render');
  }
  await waitFor(() => expect(mocks.page).toHaveBeenCalledWith('source'));
  return view;
}

beforeEach(() => {
  mocks.page.mockReset();
  mocks.page.mockReturnValue({ data: activePage, isPending: false });
  mocks.mutate.mockReset();
  mocks.pickerMount.mockReset();
  mocks.pending = false;
  mocks.error = null;
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('account deletion page', () => {
  it('loads the summary first and mounts the replacement picker only after intent', async () => {
    const view = await renderPage();
    expect(view.getByText(/Groups: active ownership/)).not.toBeNull();
    expect(view.getByText(/Factions: no active ownership; deleted records also exist/)).not.toBeNull();
    expect(mocks.pickerMount).not.toHaveBeenCalled();

    fireEvent.click(view.getByRole('button', { name: 'Choose a replacement owner' }));
    const pickReplacement = await view.findByRole('button', { name: 'Pick replacement' });
    expect(mocks.pickerMount).toHaveBeenCalledTimes(1);
    fireEvent.click(pickReplacement);
    expect(view.getByText(/New owner:/).textContent).toContain('Replacement');
    fireEvent.click(view.getByRole('checkbox'));
    /* The button is held, not clicked: five fake-timer seconds of primary press, the application's one destructive gesture. */
    vi.useFakeTimers();
    const submit = view.getByRole('button', { name: 'Transfer ownership and delete account' });
    fireEvent.pointerDown(submit, { isPrimary: true, button: 0 });
    act(() => vi.advanceTimersByTime(5000));
    vi.useRealTimers();
    expect(mocks.mutate).toHaveBeenCalledWith({ replacementUserId: 'user-2' });
  });

  it('requires explicit confirmation for the no-replacement outcome', async () => {
    const view = await renderPage();
    const submit = view.getByRole('button', { name: 'Delete account' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.click(view.getByRole('checkbox'));
    expect(submit.disabled).toBe(false);
    /* A plain click fires nothing; the hold does. */
    fireEvent.click(submit);
    expect(mocks.mutate).not.toHaveBeenCalled();
    vi.useFakeTimers();
    fireEvent.pointerDown(submit, { isPrimary: true, button: 0 });
    act(() => vi.advanceTimersByTime(5000));
    vi.useRealTimers();
    expect(mocks.mutate).toHaveBeenCalledWith({ replacementUserId: null });
  });

  it.each([
    /* The marker moved with the words: a signed-out reader now gets the login gate rather than the
       sentence that used to serve both denial reasons, so "Log in" is what identifies this state. */
    [{ kind: 'denied', reason: 'signed_out' }, 'Log in'],
    [
      {
        kind: 'pending',
        profile: { slug: 'source', username: 'Source' },
        operation: { id: 'op-1', state: 'running', phase: 'applying', error: null, replacementUserId: null },
      },
      'Account deletion is in progress',
    ],
    [
      {
        kind: 'deleted',
        profile: { slug: 'source', username: 'Source' },
        operation: { id: 'op-1', state: 'completed', phase: 'complete', error: null, replacementUserId: null },
      },
      'Account deleted',
    ],
  ])('renders the lifecycle state without exposing the active form', async (data, heading) => {
    mocks.page.mockReturnValue({ data, isPending: false });
    const view = await renderPage();
    expect(view.getByText(heading)).not.toBeNull();
    expect(view.queryByRole('checkbox')).toBeNull();
  });

  it('keeps a failed operation fail-closed and exposes its fixed recovery state', async () => {
    mocks.page.mockReturnValue({
      data: {
        kind: 'pending',
        profile: { slug: 'source', username: 'Source' },
        operation: {
          id: 'op-1',
          state: 'failed',
          phase: 'applying',
          error: 'The replacement profile is no longer available',
          replacementUserId: 'user-2',
        },
      },
      isPending: false,
    });
    const view = await renderPage();
    expect(view.getByRole('alert').textContent).toContain('The replacement profile is no longer available');
  });
});
