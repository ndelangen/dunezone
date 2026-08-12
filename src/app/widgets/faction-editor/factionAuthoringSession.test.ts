import { describe, expect, test, vi } from 'vitest';

import type { Faction, FactionEntry } from '@db/factions';
import { assetPublishingFaction } from '@game/fixtures/assetPublishingFaction';

import { createFactionAuthoringSession } from './factionAuthoringSession';

function makeHarness(overrides?: { save?: (draft: unknown) => Promise<FactionEntry> }) {
  const formResets: Array<{ values: Faction; options?: { keepDefaultValues?: boolean } }> = [];
  const form = {
    reset: (values: Faction, options?: { keepDefaultValues?: boolean }) => {
      formResets.push({ values, options });
    },
    markLoadedDraftDirty: vi.fn(),
  };
  const persistenceReset = vi.fn();
  const savedEntries: FactionEntry[] = [];
  const errorsLog: string[][] = [];

  const baseline = structuredClone(assetPublishingFaction);
  const save =
    overrides?.save ??
    (async (draft: unknown) => ({ data: draft, slug: 'saved' }) as unknown as FactionEntry);

  const session = createFactionAuthoringSession({
    initialData: baseline,
    form,
    persistence: { save: save as never, reset: persistenceReset },
    onSaved: (entry) => savedEntries.push(entry),
    onErrors: (errors) => errorsLog.push(errors),
  });

  return { session, formResets, form, persistenceReset, savedEntries, errorsLog, baseline };
}

describe('faction authoring session', () => {
  test('a valid save replaces the baseline with the canonical result', async () => {
    const { session, formResets, savedEntries, errorsLog } = makeHarness();
    const draft = { ...structuredClone(assetPublishingFaction), name: 'Edited' };

    await session.persistDraft(draft);

    expect(errorsLog.at(-1)).toEqual([]);
    expect(savedEntries).toHaveLength(1);
    expect(formResets.at(-1)?.values.name).toBe('Edited');
    expect(session.savedBaseline.name).toBe('Edited');
  });

  test('an invalid draft blocks persistence and exposes validation errors', async () => {
    const saveSpy = vi.fn();
    const { session, savedEntries, errorsLog } = makeHarness({ save: saveSpy as never });

    await session.persistDraft({ ...structuredClone(assetPublishingFaction), name: 42 as never });

    expect(saveSpy).not.toHaveBeenCalled();
    expect(savedEntries).toHaveLength(0);
    expect(errorsLog.at(-1)?.[0]).toMatch(/name/);
  });

  test('a failed save preserves the draft baseline and exposes a stable error', async () => {
    const { session, errorsLog, baseline } = makeHarness({
      save: async () => {
        throw new Error('Convex is unreachable');
      },
    });

    await session.persistDraft({ ...structuredClone(assetPublishingFaction), name: 'Edited' });

    expect(errorsLog.at(-1)).toEqual(['Convex is unreachable']);
    expect(session.savedBaseline.name).toBe(baseline.name);
  });

  test('loading a draft stays local: marks dirty, resets errors, never saves', () => {
    const { session, form, formResets, persistenceReset, savedEntries } = makeHarness();
    const loaded = { ...structuredClone(assetPublishingFaction), name: 'Loaded B' };

    session.loadDraft(loaded);

    expect(formResets.at(-1)).toMatchObject({
      values: { name: 'Loaded B' },
      options: { keepDefaultValues: true },
    });
    expect(form.markLoadedDraftDirty).toHaveBeenCalledOnce();
    expect(persistenceReset).toHaveBeenCalledOnce();
    expect(savedEntries).toHaveLength(0);
    expect(session.savedBaseline.name).not.toBe('Loaded B');
  });

  test('reset returns to the last saved baseline, including after a save', async () => {
    const { session, formResets } = makeHarness();
    await session.persistDraft({ ...structuredClone(assetPublishingFaction), name: 'Saved once' });
    session.loadDraft({ ...structuredClone(assetPublishingFaction), name: 'Loaded B' });

    session.reset();

    expect(formResets.at(-1)?.values.name).toBe('Saved once');
  });

  test('a save after loading a draft preserves stored extras from the loaded source', async () => {
    const { session, savedEntries } = makeHarness();
    const extras = [{ name: 'Tokens', items: [] }];
    const withExtras = { ...structuredClone(assetPublishingFaction), extras };
    session.loadDraft(withExtras);

    await session.persistDraft({ ...structuredClone(assetPublishingFaction), name: 'Edited' });

    expect(savedEntries).toHaveLength(1);
    const savedData = savedEntries[0]?.data as { extras?: unknown } | undefined;
    expect(savedData?.extras).toEqual(extras);
  });

  test('switching source replaces both baselines without saving the previous draft', () => {
    const { session, formResets, persistenceReset, savedEntries } = makeHarness();
    const next = { ...structuredClone(assetPublishingFaction), name: 'Other faction' };

    session.switchSource(next);

    expect(formResets.at(-1)?.values.name).toBe('Other faction');
    expect(session.savedBaseline.name).toBe('Other faction');
    expect(persistenceReset).toHaveBeenCalledOnce();
    expect(savedEntries).toHaveLength(0);
  });
});
