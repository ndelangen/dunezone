/** @vitest-environment jsdom */

import { MantineProvider } from '@mantine/core';
import { act, cleanup, render } from '@testing-library/react';
import { appContentTheme } from '@ui/theme';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { UniqueNameInput, nameConflictComplaint } from './UniqueNameInput';
import type { NameHolder } from './UniqueNameInput';

const TAKEN: Record<string, NameHolder> = { shield: 'live' };

/** Answers like a real probe binding: mounted per settled slug, reporting from an effect. */
function FakeProbe({ slug, onAnswer }: { slug: string; onAnswer: (holder: NameHolder | null) => void }) {
  useEffect(() => {
    onAnswer(TAKEN[slug] ?? null);
  }, [slug, onAnswer]);
  return null;
}

beforeEach(() => {
  vi.useFakeTimers();
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const field = (value: string, onConflictChange: (conflict: unknown) => void, currentSlug?: string) => (
  <MantineProvider theme={appContentTheme}>
    <UniqueNameInput
      value={value}
      onChange={() => {}}
      currentSlug={currentSlug}
      onConflictChange={onConflictChange}
      probe={({ slug, onAnswer }) => <FakeProbe key={slug} slug={slug} onAnswer={onAnswer} />}
    />
  </MantineProvider>
);

describe('UniqueNameInput', () => {
  it('warns about a taken name after the settle, and the verdict never follows the author to a new name', () => {
    const onConflictChange = vi.fn();
    const view = render(field('', onConflictChange));
    view.rerender(field('Shield', onConflictChange));
    expect(view.queryByText(nameConflictComplaint({ holder: 'live', slug: 'shield' }))).toBeNull();

    act(() => vi.advanceTimersByTime(400));
    expect(view.getByText(nameConflictComplaint({ holder: 'live', slug: 'shield' }))).not.toBeNull();
    expect(onConflictChange).toHaveBeenLastCalledWith({ holder: 'live', slug: 'shield' });

    /* Switching to a free name clears the warning at once, and shield's verdict must never surface tagged with the new slug. */
    view.rerender(field('Lasgun', onConflictChange));
    expect(view.queryByText(nameConflictComplaint({ holder: 'live', slug: 'shield' }))).toBeNull();
    act(() => vi.advanceTimersByTime(400));
    expect(onConflictChange).not.toHaveBeenCalledWith(expect.objectContaining({ slug: 'lasgun' }));
    expect(onConflictChange).toHaveBeenLastCalledWith(null);
  });

  it('never questions an unchanged name on an edit page', () => {
    const onConflictChange = vi.fn();
    const view = render(field('Shield', onConflictChange, 'shield'));
    act(() => vi.advanceTimersByTime(400));
    expect(view.queryByText(nameConflictComplaint({ holder: 'live', slug: 'shield' }))).toBeNull();
    expect(onConflictChange).not.toHaveBeenCalledWith(expect.objectContaining({ slug: 'shield' }));
  });
});
