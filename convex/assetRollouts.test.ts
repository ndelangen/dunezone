/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { convexTest } from 'convex-test';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { assetPublishingFaction } from '../src/game/fixtures/assetPublishingFaction';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const NOW = Date.parse('2026-07-17T10:00:00.000Z');

afterEach(() => vi.useRealTimers());

async function seedCurrentTargets(count: number) {
  const t = convexTest(schema, modules);
  const targetIds = await t.run(async (ctx) => {
    await ctx.db.insert('asset_type_configs', {
      asset_type: 'faction_sheet',
      status: 'active',
      active_renderer_version: 'faction-sheet-v1',
      updated_at: NOW,
    });
    const ids: Id<'asset_targets'>[] = [];
    for (let index = 0; index < count; index += 1) {
      const userId = await ctx.db.insert('users', { name: `Rollout owner ${index}` });
      const factionId = await ctx.db.insert('factions', {
        owner_id: userId,
        data: { ...assetPublishingFaction, name: `Rollout faction ${index}` },
        slug: `rollout-faction-${index}`,
        created_at: new Date(NOW).toISOString(),
        updated_at: new Date(NOW).toISOString(),
        is_deleted: false,
        group_id: null,
      });
      ids.push(
        await ctx.db.insert('asset_targets', {
          faction_id: factionId,
          asset_type: 'faction_sheet',
          desired_generation: 1,
          desired_renderer_version: 'faction-sheet-v0',
          published_generation: 1,
          published_renderer_version: 'faction-sheet-v0',
          published_cache_token: `existing-${index}`,
          published_r2_etag: `etag-${index}`,
          published_bytes: 1_000 + index,
          published_at: NOW,
          status: 'current',
          consecutive_render_failures: 0,
          work_lane: 'foreground',
          foreground_updated_at: NOW,
        })
      );
    }
    return ids;
  });
  return { t, targetIds };
}

async function runningRollout(t: ReturnType<typeof convexTest>) {
  const created = await t.mutation(internal.assetRollouts.createPaused, {
    targetRendererVersion: 'faction-sheet-v1',
  });
  await t.mutation(internal.assetRollouts.resume, { rolloutId: created.rolloutId });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  return created.rolloutId;
}

async function takeOne(t: ReturnType<typeof convexTest>, index: number) {
  const result = await t.mutation(internal.assetPublisher.takeWork, {
    claimTokens: [`rollout-claim-token-${String(index).padStart(16, '0')}`],
  });
  if (result.status !== 'assigned') throw new Error(`Expected rollout item: ${result.reason}`);
  return result.items[0];
}

describe('rollout compatibility with independent item claims', () => {
  test('takeWork claims rollout items when foreground work is empty', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { t } = await seedCurrentTargets(2);
    await runningRollout(t);
    const result = await t.mutation(internal.assetPublisher.takeWork, {
      claimTokens: ['rollout-claim-token-00000001', 'rollout-claim-token-00000002'],
    });
    expect(result).toMatchObject({ status: 'assigned' });
    if (result.status !== 'assigned') throw new Error('Expected assigned rollout work');
    expect(result.items).toHaveLength(2);
    expect(result.items.every((item) => item.workLane === 'rollout')).toBe(true);
  });

  test('foreground pending work retains priority over rollout work', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { t } = await seedCurrentTargets(1);
    await runningRollout(t);
    await t.run(async (ctx) => {
      const userId = await ctx.db.insert('users', { name: 'Foreground owner' });
      const factionId = await ctx.db.insert('factions', {
        owner_id: userId,
        data: { ...assetPublishingFaction, name: 'Foreground priority' },
        slug: 'foreground-priority',
        created_at: new Date(NOW).toISOString(),
        updated_at: new Date(NOW).toISOString(),
        is_deleted: false,
        group_id: null,
      });
      await ctx.db.insert('asset_targets', {
        faction_id: factionId,
        asset_type: 'faction_sheet',
        desired_generation: 1,
        desired_renderer_version: 'faction-sheet-v1',
        status: 'pending',
        consecutive_render_failures: 0,
        work_lane: 'foreground',
        foreground_updated_at: NOW,
      });
    });
    await expect(takeOne(t, 1)).resolves.toMatchObject({ workLane: 'foreground' });
  });

  test('successful completion finalizes the rollout and resets target failures', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { t, targetIds } = await seedCurrentTargets(1);
    const rolloutId = await runningRollout(t);
    const item = await takeOne(t, 1);
    await expect(
      t.mutation(internal.assetPublisher.completeItem, {
        targetId: item.targetId,
        claimToken: item.claimToken,
        generation: item.generation,
        rendererVersion: item.rendererVersion,
        r2Etag: 'rollout-etag',
        bytes: 2_000,
        cacheToken: `v1.${'a'.repeat(22)}.${'b'.repeat(43)}`,
      })
    ).resolves.toMatchObject({ status: 'completed' });
    await expect(t.query(internal.assetRollouts.progress, { rolloutId })).resolves.toMatchObject({
      activeRolloutId: null,
      rollout: {
        status: 'completed',
        counters: { pending: 0, leased: 0, succeeded: 1 },
      },
    });
    await expect(
      t.run(async (ctx) => await ctx.db.get('asset_targets', targetIds[0]))
    ).resolves.toMatchObject({
      status: 'current',
      consecutive_render_failures: 0,
      desired_renderer_version: 'faction-sheet-v1',
    });
  });

  test('the rollout keeps its separate three-attempt terminal policy without cooldown state', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { t } = await seedCurrentTargets(1);
    const rolloutId = await runningRollout(t);
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const item = await takeOne(t, attempt);
      await expect(
        t.mutation(internal.assetPublisher.failItem, {
          targetId: item.targetId,
          claimToken: item.claimToken,
          generation: item.generation,
          rendererVersion: item.rendererVersion,
          attribution: 'target',
          error: `rollout render failure ${attempt}`,
        })
      ).resolves.toMatchObject({ status: 'failed', consecutiveFailures: attempt });
    }
    await expect(t.query(internal.assetRollouts.progress, { rolloutId })).resolves.toMatchObject({
      activeRolloutId: null,
      rollout: {
        status: 'completed_with_errors',
        counters: { pending: 0, leased: 0, terminalErrors: 1 },
      },
    });
    const targets = await t.run(async (ctx) => await ctx.db.query('asset_targets').take(1));
    expect(targets[0]).toMatchObject({
      status: 'current',
      consecutive_render_failures: 3,
    });
  });
});
