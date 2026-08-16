/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import aggregateTest from '@convex-dev/aggregate/test';
import migrationsTest from '@convex-dev/migrations/test';
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';

import { calculateComplexity } from '../src/shared/factions/complexity';
import { assetPublishingFaction } from '../src/shared/factions/fixtures/assetPublishingFaction';
import { api, internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const now = '2026-08-16T00:00:00.000Z';

function withoutComplexity() {
  const { complexity: _complexity, ...data } = structuredClone(assetPublishingFaction);
  return data;
}

async function migrationTest() {
  const t = convexTest(schema, modules);
  aggregateTest.register(t, 'statistics');
  aggregateTest.register(t, 'profileActivity');
  aggregateTest.register(t, 'profileDiscovery');
  migrationsTest.register(t);
  const ids = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert('users', { name: 'Complexity migration owner' });
    await ctx.db.insert('profiles', {
      user_id: ownerId,
      username: 'Complexity migration owner',
      avatar_url: null,
      slug: 'complexity-migration-owner',
      created_at: now,
      updated_at: now,
    });
    const insert = async (slug: string, data: unknown, isDeleted = false) =>
      await ctx.db.insert('factions', {
        owner_id: ownerId,
        data,
        slug,
        created_at: now,
        updated_at: now,
        is_deleted: isDeleted,
        group_id: null,
      });
    return {
      absent: await insert('complexity-absent', withoutComplexity()),
      scalar: await insert('complexity-scalar', { ...withoutComplexity(), complexity: 0.7 }),
      staleGrouped: await insert('complexity-stale-grouped', {
        ...withoutComplexity(),
        complexity: { calculated: 0.01, manual: 0.4 },
      }),
      historicalAsset: await insert(
        'complexity-historical-asset',
        {
          ...withoutComplexity(),
          background: { ...withoutComplexity().background, image: '' },
        },
        true
      ),
    };
  });
  return { t, ids };
}

describe('faction grouped complexity migration', () => {
  test('backfills accurate calculated values and preserves legacy manual ratings', async () => {
    const { t, ids } = await migrationTest();
    const calculated = calculateComplexity(assetPublishingFaction.rules);

    const legacyDetail = await t.query(api.factions.getBySlug, { slug: 'complexity-scalar' });
    const legacyCatalogue = await t.query(api.factions.cataloguePage, {});
    expect(legacyDetail.faction.data.complexity).toEqual({ calculated, manual: 0.7 });
    expect(
      legacyCatalogue.factions.find((faction) => faction._id === ids.absent)?.data.complexity
    ).toEqual({ calculated });

    await t.mutation(internal.migrations.faction_complexity_grouped_v1, {});
    await t.mutation(internal.migrations.faction_complexity_grouped_verify_v1, {});

    const rows = await t.run(async (ctx) => ({
      absent: await ctx.db.get('factions', ids.absent),
      scalar: await ctx.db.get('factions', ids.scalar),
      staleGrouped: await ctx.db.get('factions', ids.staleGrouped),
      historicalAsset: await ctx.db.get('factions', ids.historicalAsset),
    }));
    expect(rows.absent?.data.complexity).toEqual({ calculated });
    expect(rows.scalar?.data.complexity).toEqual({ calculated, manual: 0.7 });
    expect(rows.staleGrouped?.data.complexity).toEqual({ calculated, manual: 0.4 });
    expect(rows.historicalAsset?.data.complexity).toEqual({ calculated });
    expect(rows.historicalAsset?.data.background.image).toBe('');
  });

  test('verification rejects inaccurate grouped values', async () => {
    const { t, ids } = await migrationTest();

    await t.mutation(internal.migrations.faction_complexity_grouped_v1, {});
    await t.run(async (ctx) => {
      const row = await ctx.db.get('factions', ids.absent);
      if (!row) {
        throw new Error('Missing migrated faction');
      }
      await ctx.db.patch(row._id, {
        data: { ...row.data, complexity: { calculated: 0.01 } },
      });
    });

    const result = await t.mutation(internal.migrations.faction_complexity_grouped_verify_v1, {});

    expect(result.Status).toMatch(/Migration failed: .*expected/);
  });
});
