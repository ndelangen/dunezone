/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import migrationsTest from '@convex-dev/migrations/test';
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';

import { assetPublishingFaction } from '../src/game/fixtures/assetPublishingFaction';
import { internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

describe('legacy Publication deletion migrations', () => {
  test('delete only the four legacy publication tables', async () => {
    const t = convexTest(schema, modules);
    migrationsTest.register(t);

    const seeded = await t.run(async (ctx) => {
      const ownerId = await ctx.db.insert('users', { name: 'Legacy publication owner' });
      const factionId = await ctx.db.insert('factions', {
        owner_id: ownerId,
        data: assetPublishingFaction,
        slug: 'legacy-publication-faction',
        created_at: '2026-07-25T00:00:00.000Z',
        updated_at: '2026-07-25T00:00:00.000Z',
        is_deleted: false,
        group_id: null,
      });
      const rolloutId = await ctx.db.insert('asset_rollouts', {
        asset_type: 'faction_sheet',
        target_renderer_version: 'legacy-v4',
        status: 'completed',
        cutoff_creation_time: 1,
        discovery_pages: 1,
        discovery_continuations: 0,
        discovered: 1,
        pending: 0,
        leased: 0,
        succeeded: 1,
        superseded: 0,
        cancelled: 0,
        terminal_errors: 0,
        created_at: 1,
        updated_at: 2,
      });
      const targetId = await ctx.db.insert('asset_targets', {
        faction_id: factionId,
        asset_type: 'faction_sheet',
        desired_generation: 1,
        desired_renderer_version: 'legacy-v4',
        published_generation: 1,
        published_renderer_version: 'legacy-v4',
        status: 'current',
        consecutive_render_failures: 0,
        rollout_id: rolloutId,
      });
      await ctx.db.insert('asset_rollout_items', {
        rollout_id: rolloutId,
        target_id: targetId,
        enrolled_generation: 1,
        enrolled_renderer_version: 'legacy-v4',
        state: 'succeeded',
        retry_count: 0,
        next_eligible_at: 0,
        created_at: 1,
        updated_at: 2,
      });
      await ctx.db.insert('asset_type_configs', {
        asset_type: 'faction_sheet',
        status: 'active',
        active_renderer_version: 'legacy-v4',
        active_rollout_id: rolloutId,
        updated_at: 2,
      });

      const publicationAssetId = await ctx.db.insert('publication_assets', {
        asset_type: 'faction_sheet',
        asset_id: factionId,
        cache_token: 'current-cache-token',
        published_at: 3,
      });
      const publicationJobId = await ctx.db.insert('publication_jobs', {
        asset_type: 'faction_sheet',
        asset_id: factionId,
        asset_data: assetPublishingFaction,
        status: 'pending',
        attempt_counter: 0,
        created_at: 4,
        updated_at: 4,
      });

      return { publicationAssetId, publicationJobId };
    });

    await t.mutation(internal.migrations.publication_delete_legacy_rollout_items_v1, {});
    await t.mutation(internal.migrations.publication_delete_legacy_rollouts_v1, {});
    await t.mutation(internal.migrations.publication_delete_legacy_targets_v1, {});
    await t.mutation(internal.migrations.publication_delete_legacy_type_configs_v1, {});

    const result = await t.run(async (ctx) => ({
      legacy: {
        rolloutItems: await ctx.db.query('asset_rollout_items').collect(),
        rollouts: await ctx.db.query('asset_rollouts').collect(),
        targets: await ctx.db.query('asset_targets').collect(),
        typeConfigs: await ctx.db.query('asset_type_configs').collect(),
      },
      publicationAsset: await ctx.db.get(seeded.publicationAssetId),
      publicationJob: await ctx.db.get(seeded.publicationJobId),
    }));

    expect(result.legacy).toEqual({
      rolloutItems: [],
      rollouts: [],
      targets: [],
      typeConfigs: [],
    });
    expect(result.publicationAsset).toMatchObject({
      cache_token: 'current-cache-token',
    });
    expect(result.publicationJob).toMatchObject({
      status: 'pending',
      attempt_counter: 0,
    });
  });
});
