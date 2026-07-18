/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';

import { internal } from './_generated/api';
import { FACTION_SHEET_TARGET_ACTIVATION_PREREQUISITE } from './lib/assetPublisherConstants';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const NOW = Date.parse('2026-07-17T12:00:00.000Z');

describe('asset publisher config authority', () => {
  test('initialize, pause, and disable mutate the asset type config', async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(internal.assetPublisherOperator.initializeDisabled, {})
    ).resolves.toMatchObject({ status: 'disabled', changed: true });
    await expect(t.mutation(internal.assetPublisherOperator.pause, {})).resolves.toMatchObject({
      status: 'paused',
      changed: true,
    });
    await expect(t.mutation(internal.assetPublisherOperator.disable, {})).resolves.toMatchObject({
      status: 'disabled',
      changed: true,
    });
  });

  test('activation fails closed until target migration is complete', async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.assetPublisherOperator.initializeDisabled, {});
    await expect(
      t.mutation(internal.assetPublisherOperator.activate, {
        rendererVersion: 'faction-sheet-v1',
      })
    ).rejects.toThrow('activation prerequisite');

    await t.run(async (ctx) => {
      await ctx.db.insert('migration_runs', {
        migration_id: FACTION_SHEET_TARGET_ACTIVATION_PREREQUISITE,
        state: 'success',
        is_done: true,
        processed: 1,
        latest_start: NOW - 1,
        latest_end: NOW,
        updated_at: new Date(NOW).toISOString(),
      });
    });
    await expect(
      t.mutation(internal.assetPublisherOperator.activate, {
        rendererVersion: 'faction-sheet-v2',
      })
    ).resolves.toMatchObject({
      status: 'active',
      rendererVersion: 'faction-sheet-v2',
      changed: true,
    });
    const config = await t.run(
      async (ctx) => await ctx.db.query('asset_type_configs').withIndex('by_asset_type').unique()
    );
    expect(config).toMatchObject({
      status: 'active',
      active_renderer_version: 'faction-sheet-v2',
    });
  });
});
