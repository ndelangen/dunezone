/** @vitest-environment jsdom */

import { MantineProvider } from '@mantine/core';
import { act, cleanup, render } from '@testing-library/react';
import { appContentTheme } from '@ui/theme';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { nameWayOut, UniqueNameInput, nameConflictComplaint } from './UniqueNameInput';
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

const field = (
  value: string,
  onConflictChange: (conflict: unknown) => void,
  currentSlug?: string,
  rename: { canRename: boolean; noun?: string } = { canRename: true },
  onChange: (name: string) => void = () => {}
) => (
  <MantineProvider theme={appContentTheme}>
    <UniqueNameInput
      value={value}
      onChange={onChange}
      currentSlug={currentSlug}
      onConflictChange={onConflictChange}
      canRename={rename.canRename}
      noun={rename.noun}
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

  it('locks the field and says why when the viewer may not rename', () => {
    const view = render(field('Shield', vi.fn(), 'shield', { canRename: false, noun: 'token' }));
    expect((view.getByLabelText('Name') as HTMLInputElement).disabled).toBe(true);
    expect(view.getByText('Only the token owner can rename it.')).not.toBeNull();
  });

  /* The open half, so the assertion above is about the flag rather than about the field always being one way. */
  it('leaves the field open and unexplained when the viewer may rename', () => {
    const view = render(field('Shield', vi.fn(), 'shield', { canRename: true, noun: 'token' }));
    expect((view.getByLabelText('Name') as HTMLInputElement).disabled).toBe(false);
    expect(view.queryByText('Only the token owner can rename it.')).toBeNull();
  });

  it('offers a way out of a taken name, and picking one writes it through onChange', () => {
    const onChange = vi.fn();
    const view = render(field('', vi.fn(), undefined, { canRename: true }, onChange));
    view.rerender(field('Shield', vi.fn(), undefined, { canRename: true }, onChange));
    /* Before the settle there is no conflict, so there is no offer either: the way out belongs to the verdict. */
    expect(view.queryByText('Try instead:')).toBeNull();

    act(() => vi.advanceTimersByTime(400));
    expect(view.getByText('Try instead:')).not.toBeNull();
    view.getByRole('button', { name: 'Try instead: Shield 2' }).click();
    expect(onChange).toHaveBeenCalledWith('Shield 2');

    /* A free name has nothing to escape from. */
    view.rerender(field('Lasgun', vi.fn(), undefined, { canRename: true }, onChange));
    act(() => vi.advanceTimersByTime(400));
    expect(view.queryByText('Try instead:')).toBeNull();
  });

  it('counts up from a name that already carries a number', () => {
    expect(nameWayOut('Shield')).toEqual(['Shield 2', 'Shield 3']);
    expect(nameWayOut('Shield 2')).toEqual(['Shield 3', 'Shield 4']);
    expect(nameWayOut('shield-7')).toEqual(['shield 8', 'shield 9']);
    expect(nameWayOut('  ')).toEqual([]);
    /* The counting branch steps aside rather than counting dishonestly. */
    expect(nameWayOut('-2')).toEqual(['-2 2', '-2 3']);
    expect(nameWayOut('Shield 99999999999999999999')).toEqual([
      'Shield 99999999999999999999 2',
      'Shield 99999999999999999999 3',
    ]);
  });

  it('never questions an unchanged name on an edit page', () => {
    const onConflictChange = vi.fn();
    const view = render(field('Shield', onConflictChange, 'shield'));
    act(() => vi.advanceTimersByTime(400));
    expect(view.queryByText(nameConflictComplaint({ holder: 'live', slug: 'shield' }))).toBeNull();
    expect(onConflictChange).not.toHaveBeenCalledWith(expect.objectContaining({ slug: 'shield' }));
  });
});
