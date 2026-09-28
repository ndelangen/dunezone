/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { describe, expect, test } from 'vitest';

import { internal } from './_generated/api';
import { factionTest, insertStoredFactions, storedFactionData } from './factions.test.fixture';

const legacyLinks = { name: 'TTS', items: [{ url: 'https://example.com/board.png' }] };

describe('faction Extras references migration', () => {
  test('drops retired TTS link lists, keeps references, and records both migrations as complete', async () => {
    const t = factionTest();
    const ids = await insertStoredFactions(t, [
      { slug: 'legacy-only', data: { extras: [legacyLinks] } },
      { slug: 'mixed', data: { extras: [legacyLinks, { type: 'deck', slug: 'omens' }] } },
      { slug: 'untouched', data: {} },
    ]);

    await t.mutation(internal.migrations.faction_extras_references_v1, {});
    await t.mutation(internal.migrations.faction_extras_references_v1, { reset: true });
    await t.mutation(internal.migrations.faction_extras_references_verify_v1, {});

    expect((await storedFactionData(t, ids)).map((row) => row.data)).toEqual([
      { name: 'legacy-only' },
      { name: 'mixed', extras: [{ type: 'deck', slug: 'omens' }] },
      { name: 'untouched' },
    ]);
    await expect(
      t.query(internal.migrations.assertReadyForNarrow, {
        required: ['faction_extras_references_v1', 'faction_extras_references_verify_v1'],
      })
    ).resolves.toMatchObject({ ok: true });
  });

  test('verification refuses a row that still holds a retired link list', async () => {
    const t = factionTest();
    await insertStoredFactions(t, [{ slug: 'leftover', data: { extras: [legacyLinks] } }]);

    await t.mutation(internal.migrations.faction_extras_references_verify_v1, {});
    await expect(
      t.query(internal.migrations.assertReadyForNarrow, { required: ['faction_extras_references_verify_v1'] })
    ).rejects.toThrow(/faction_extras_references_verify_v1\(failed/);
  });
});
