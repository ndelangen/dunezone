/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { convexTest } from 'convex-test';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const NOW = Date.parse('2026-07-16T12:00:00.000Z');
const activationArgs = {
  rendererVersion: 'faction-sheet-v3' as const,
  targetPrerequisite: 'faction_sheet_targets_verify_v1' as const,
  storagePrerequisite: 'faction_sheet_publication_admissions_v1' as const,
};

afterEach(() => vi.useRealTimers());

async function recordSuccessfulPrerequisites(t: ReturnType<typeof convexTest>) {
  await t.run(async (ctx) => {
    for (const migrationId of [
      activationArgs.targetPrerequisite,
      activationArgs.storagePrerequisite,
    ]) {
      await ctx.db.insert('migration_runs', {
        migration_id: migrationId,
        state: 'success',
        is_done: true,
        processed: 1,
        latest_start: NOW - 1_000,
        latest_end: NOW,
        updated_at: new Date(NOW).toISOString(),
      });
    }
  });
}

describe('asset publisher operator controls', () => {
  test('initializes the config and quota-free singleton disabled exactly once', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const t = convexTest(schema, modules);

    await expect(
      t.mutation(internal.assetPublisherOperator.initializeDisabled, {})
    ).resolves.toMatchObject({
      changed: true,
      configStatus: 'disabled',
      publisherStatus: 'disabled',
    });
    await expect(
      t.mutation(internal.assetPublisherOperator.initializeDisabled, {})
    ).resolves.toMatchObject({ changed: false });

    const state = await t.run(async (ctx) =>
      ctx.db
        .query('asset_publisher_state')
        .withIndex('by_key', (q) => q.eq('key', 'singleton'))
        .unique()
    );
    expect(state).toMatchObject({ status: 'disabled', next_lane: 'foreground' });
    expect(state).not.toHaveProperty('daily_browser_ms');
    expect(state).not.toHaveProperty('browser_reservation_batch_token');
  });

  test('activation remains guarded and pause/disable are idempotent', async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.assetPublisherOperator.initializeDisabled, {});
    await expect(
      t.mutation(internal.assetPublisherOperator.activate, activationArgs)
    ).rejects.toThrow(/prerequisite/);

    await recordSuccessfulPrerequisites(t);
    await expect(
      t.mutation(internal.assetPublisherOperator.activate, activationArgs)
    ).resolves.toMatchObject({
      rendererVersion: 'faction-sheet-v3',
      configStatus: 'active',
      publisherStatus: 'active',
    });
    await expect(t.mutation(internal.assetPublisherOperator.pause, {})).resolves.toMatchObject({
      configStatus: 'paused',
      publisherStatus: 'paused',
    });
    await expect(t.mutation(internal.assetPublisherOperator.disable, {})).resolves.toMatchObject({
      configStatus: 'disabled',
      publisherStatus: 'disabled',
    });
  });
});

describe('asset publisher operator HTTP boundary', () => {
  test('keeps operator authority distinct from the executor secret', async () => {
    const keys = [
      'ASSET_PUBLISHER_ACTIVATION_SECRET',
      'ASSET_PUBLISHER_EXECUTOR_SECRET',
      'ASSET_PUBLISHER_RENDER_CAPABILITY_SECRET',
      'ASSET_PUBLISHER_CACHE_TOKEN_SECRET',
    ] as const;
    const prior = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    process.env.ASSET_PUBLISHER_ACTIVATION_SECRET = 'activation-secret';
    process.env.ASSET_PUBLISHER_EXECUTOR_SECRET = 'executor-secret';
    process.env.ASSET_PUBLISHER_RENDER_CAPABILITY_SECRET = 'render-secret';
    process.env.ASSET_PUBLISHER_CACHE_TOKEN_SECRET = 'cache-secret';
    try {
      const t = convexTest(schema, modules);
      const post = async (secret: string, body: unknown) =>
        t.fetch('/asset-publishing/operator', {
          method: 'POST',
          headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      expect(
        (await post('executor-secret', { schemaVersion: 1, operation: 'initialize' })).status
      ).toBe(404);
      const initialized = await post('activation-secret', {
        schemaVersion: 1,
        operation: 'initialize',
      });
      expect(initialized.status).toBe(200);
      await expect(initialized.json()).resolves.toMatchObject({
        operation: 'initialize',
        configStatus: 'disabled',
        publisherStatus: 'disabled',
      });
    } finally {
      for (const key of keys) {
        const value = prior[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});
