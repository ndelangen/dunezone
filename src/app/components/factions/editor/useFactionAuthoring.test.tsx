// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { Faction, FactionEntry } from '@db/factions';
import { defaultFaction } from '@data/defaultFaction';

import { useFactionAuthoring } from './useFactionAuthoring';

function faction(name: string): Faction {
  const value = structuredClone(defaultFaction);
  value.name = name;
  return value;
}

function factionEntry(data: Faction): FactionEntry {
  const now = '2026-08-04T12:00:00.000Z';
  return {
    _id: 'faction-a' as never,
    _creationTime: Date.parse(now),
    owner_id: 'owner' as never,
    data,
    slug: 'faction-a',
    group_id: null,
    created_at: now,
    updated_at: now,
    is_deleted: false,
  };
}

describe('useFactionAuthoring', () => {
  it('loads another faction as a dirty draft while Reset restores the saved target', () => {
    const savedA = faction('Faction A');
    const loadedB = faction('Faction B');
    const persistence = {
      save: vi.fn(async (draft: Faction) => factionEntry(draft)),
      isPending: false,
      error: null,
      hasSaved: false,
      reset: vi.fn(),
    };

    const { result } = renderHook(() =>
      useFactionAuthoring({
        sessionKey: 'faction-a',
        initialData: savedA,
        persistence,
        onSaved: vi.fn(),
      })
    );

    act(() => result.current.actions.loadDraft(loadedB));

    expect(result.current.form.state.values.name).toBe('Faction B');
    expect(result.current.editing.isDirty).toBe(true);
    expect(persistence.reset).toHaveBeenCalledTimes(1);

    act(() => result.current.actions.reset());

    expect(result.current.form.state.values.name).toBe('Faction A');
    expect(result.current.editing.isDirty).toBe(false);
    expect(persistence.reset).toHaveBeenCalledTimes(2);
  });

  it('saves the loaded draft and adopts the canonical response as the new baseline', async () => {
    const savedA = faction('Faction A');
    const loadedB = faction('Faction B');
    const canonical = faction('Faction B canonical');
    const save = vi.fn(async () => factionEntry(canonical));
    const onSaved = vi.fn();

    const { result } = renderHook(() =>
      useFactionAuthoring({
        sessionKey: 'faction-a',
        initialData: savedA,
        persistence: {
          save,
          isPending: false,
          error: null,
          hasSaved: false,
          reset: vi.fn(),
        },
        onSaved,
      })
    );

    act(() => result.current.actions.loadDraft(loadedB));
    await act(async () => await result.current.actions.submit());

    expect(save).toHaveBeenCalledWith(expect.objectContaining({ name: 'Faction B' }));
    expect(result.current.form.state.values.name).toBe('Faction B canonical');
    expect(result.current.editing.isDirty).toBe(false);
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ data: canonical }));

    act(() => result.current.actions.reset());
    expect(result.current.form.state.values.name).toBe('Faction B canonical');
  });

  it('does not report a completed save as failed when the post-save callback throws', async () => {
    const savedA = faction('Faction A');
    const canonical = faction('Faction A canonical');
    const callbackError = new Error('navigation failed');

    const { result } = renderHook(() =>
      useFactionAuthoring({
        sessionKey: 'faction-a',
        initialData: savedA,
        persistence: {
          save: vi.fn(async () => factionEntry(canonical)),
          isPending: false,
          error: null,
          hasSaved: false,
          reset: vi.fn(),
        },
        onSaved: () => {
          throw callbackError;
        },
      })
    );

    await expect(act(async () => await result.current.actions.submit())).rejects.toThrow(
      callbackError
    );

    expect(result.current.form.state.values.name).toBe('Faction A canonical');
    expect(result.current.persistence.errors).toEqual([]);
  });
});
