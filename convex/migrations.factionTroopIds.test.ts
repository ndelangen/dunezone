/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import aggregateTest from '@convex-dev/aggregate/test';
import migrationsTest from '@convex-dev/migrations/test';
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';

import { internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

function migrationTest() {
  const t = convexTest(schema, modules);
  aggregateTest.register(t, 'statistics');
  aggregateTest.register(t, 'profileActivity');
  aggregateTest.register(t, 'profileDiscovery');
  migrationsTest.register(t);
  return t;
}

const troop = { name: 'Regular troop', image: '/vector/troop/atreides.svg', description: '', count: 20 };
const keptId = '11111111-1111-4111-8111-111111111111';

describe('faction troop identity migration', () => {
  test('backfills missing troop identities once, keeps existing ones and every other field', async () => {
    const t = migrationTest();
    const [legacy, partial] = await t.run(async (ctx) => {
      const ownerId = await ctx.db.insert('users', { name: 'Faction owner' });
      const row = (slug: string, troops: unknown[]) =>
        ctx.db.insert('factions', {
          owner_id: ownerId,
          data: { name: slug, retiredField: 'kept', troops },
          slug,
          created_at: '2026-09-28T00:00:00.000Z',
          updated_at: '2026-09-28T00:00:00.000Z',
          is_deleted: slug === 'partial',
          group_id: null,
        });
      return await Promise.all([
        row('legacy', [troop, { ...troop, name: 'Elite troop' }]),
        row('partial', [{ ...troop, troopId: keptId }, troop]),
      ]);
    });

    await t.mutation(internal.migrations.faction_troop_ids_v1, {});
    const first = await t.run(async (ctx) =>
      Promise.all([legacy, partial].map(async (id) => (await ctx.db.get('factions', id))!))
    );
    await t.mutation(internal.migrations.faction_troop_ids_v1, { reset: true });
    await t.mutation(internal.migrations.faction_troop_ids_verify_v1, {});
    const second = await t.run(async (ctx) =>
      Promise.all([legacy, partial].map(async (id) => (await ctx.db.get('factions', id))!))
    );

    const [legacyRow, partialRow] = first;
    const legacyIds = legacyRow.data.troops.map((entry: { troopId?: string }) => entry.troopId);
    expect(new Set(legacyIds).size).toBe(2);
    expect(legacyRow.data.retiredField).toBe('kept');
    expect(legacyRow.updated_at).toBe('2026-09-28T00:00:00.000Z');
    expect(partialRow.data.troops[0].troopId).toBe(keptId);
    expect(partialRow.data.troops[1].troopId).toEqual(expect.any(String));
    expect(second.map((row) => row.data)).toEqual(first.map((row) => row.data));
    await expect(
      t.query(internal.migrations.assertReadyForNarrow, {
        required: ['faction_troop_ids_v1', 'faction_troop_ids_verify_v1'],
      })
    ).resolves.toMatchObject({ ok: true });
  });

  test('verification refuses a faction whose troops still lack identities', async () => {
    const t = migrationTest();
    await t.run(async (ctx) => {
      const ownerId = await ctx.db.insert('users', { name: 'Faction owner' });
      await ctx.db.insert('factions', {
        owner_id: ownerId,
        data: { name: 'unmigrated', troops: [troop] },
        slug: 'unmigrated',
        created_at: '2026-09-28T00:00:00.000Z',
        updated_at: '2026-09-28T00:00:00.000Z',
        is_deleted: false,
        group_id: null,
      });
    });

    await t.mutation(internal.migrations.faction_troop_ids_verify_v1, {});
    await expect(
      t.query(internal.migrations.assertReadyForNarrow, { required: ['faction_troop_ids_verify_v1'] })
    ).rejects.toThrow(/faction_troop_ids_verify_v1\(failed/);
  });
});
