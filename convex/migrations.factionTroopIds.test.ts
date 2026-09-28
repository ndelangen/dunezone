/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { describe, expect, test } from 'vitest';

import { internal } from './_generated/api';
import { factionTest, insertStoredFactions, storedFactionData } from './factions.test.fixture';

const troop = { name: 'Regular troop', image: '/vector/troop/atreides.svg', description: '', count: 20 };
const keptId = '11111111-1111-4111-8111-111111111111';

describe('faction troop identity migration', () => {
  test('backfills missing troop identities once, keeps existing ones and every other field', async () => {
    const t = factionTest();
    const ids = await insertStoredFactions(t, [
      { slug: 'legacy', data: { retiredField: 'kept', troops: [troop, { ...troop, name: 'Elite troop' }] } },
      { slug: 'partial', data: { troops: [{ ...troop, troopId: keptId }, troop] }, isDeleted: true },
    ]);

    await t.mutation(internal.migrations.faction_troop_ids_v1, {});
    const first = await storedFactionData(t, ids);
    await t.mutation(internal.migrations.faction_troop_ids_v1, { reset: true });
    await t.mutation(internal.migrations.faction_troop_ids_verify_v1, {});
    const second = await storedFactionData(t, ids);

    const [legacyRow, partialRow] = first;
    const legacyIds = legacyRow!.data.troops.map((entry: { troopId?: string }) => entry.troopId);
    expect(new Set(legacyIds).size).toBe(2);
    expect(legacyRow!.data.retiredField).toBe('kept');
    expect(legacyRow!.updated_at).toBe('2026-09-28T00:00:00.000Z');
    expect(partialRow!.data.troops[0].troopId).toBe(keptId);
    expect(partialRow!.data.troops[1].troopId).toEqual(expect.any(String));
    expect(second.map((row) => row.data)).toEqual(first.map((row) => row.data));
    await expect(
      t.query(internal.migrations.assertReadyForNarrow, {
        required: ['faction_troop_ids_v1', 'faction_troop_ids_verify_v1'],
      })
    ).resolves.toMatchObject({ ok: true });
  });

  test('verification refuses a faction whose troops still lack identities', async () => {
    const t = factionTest();
    await insertStoredFactions(t, [{ slug: 'unmigrated', data: { troops: [troop] } }]);

    await t.mutation(internal.migrations.faction_troop_ids_verify_v1, {});
    await expect(
      t.query(internal.migrations.assertReadyForNarrow, { required: ['faction_troop_ids_verify_v1'] })
    ).rejects.toThrow(/faction_troop_ids_verify_v1\(failed/);
  });
});
