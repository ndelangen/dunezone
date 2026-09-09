/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import aggregateTest from '@convex-dev/aggregate/test';
import migrationsTest from '@convex-dev/migrations/test';
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';

import { assetPublishingFaction } from '../src/shared/factions/fixtures/assetPublishingFaction';
import { IdentifiedFactionStoredSchema } from '../src/shared/factions/schema';
import { internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

describe('faction member identity migration', () => {
  test('backfills existing active and deleted rosters and verifies persisted identities', async () => {
    const t = convexTest(schema, modules);
    aggregateTest.register(t, 'statistics');
    aggregateTest.register(t, 'profileActivity');
    aggregateTest.register(t, 'profileDiscovery');
    migrationsTest.register(t);
    const factionIds = await t.run(async (ctx) => {
      const ownerId = await ctx.db.insert('users', { name: 'Faction owner' });
      return await Promise.all(
        [false, true].map((is_deleted) =>
          ctx.db.insert('factions', {
            owner_id: ownerId,
            data: structuredClone(assetPublishingFaction),
            slug: is_deleted ? 'deleted-faction' : 'active-faction',
            created_at: '2026-09-01T00:00:00.000Z',
            updated_at: '2026-09-01T00:00:00.000Z',
            is_deleted,
            group_id: null,
          })
        )
      );
    });
    await t.mutation(internal.migrations.faction_member_ids_v1, {});
    const beforeRetry = await t.run(async (ctx) => Promise.all(factionIds.map((id) => ctx.db.get('factions', id))));
    await t.mutation(internal.migrations.faction_member_ids_v1, { cursor: null });
    await t.mutation(internal.migrations.faction_member_ids_verify_v1, {});
    const afterRetry = await t.run(async (ctx) => Promise.all(factionIds.map((id) => ctx.db.get('factions', id))));
    expect(afterRetry).toEqual(beforeRetry);
    for (const faction of afterRetry) {
      expect(IdentifiedFactionStoredSchema.safeParse(faction?.data).success).toBe(true);
      expect(faction?.updated_at).toBe('2026-09-01T00:00:00.000Z');
    }
    await expect(
      t.query(internal.migrations.assertReadyForNarrow, {
        required: ['faction_member_ids_v1', 'faction_member_ids_verify_v1'],
      })
    ).resolves.toMatchObject({ ok: true });
  });
});
