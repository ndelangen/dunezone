/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { convexTest } from 'convex-test';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { proofFaction } from '../src/app/capture/proofFaction';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { ROLLOUT_DISCOVERY_PAGE_SIZE } from './assetRollouts';
import { FACTION_SHEET_PUBLICATION_COUNTER_KEY } from './lib/factionSheetPublicationGuard';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const NOW = Date.parse('2026-07-17T10:00:00.000Z');
const BATCHES = [1, 2, 3, 4].map(
  (value) => `rollout-batch-token-${String(value).padStart(16, '0')}`
);
const CLAIMS = [1, 2, 3, 4].map(
  (value) => `rollout-claim-token-${String(value).padStart(16, '0')}`
);

afterEach(() => vi.useRealTimers());

type Seeded = {
  t: ReturnType<typeof convexTest>;
  userIds: Id<'users'>[];
  factionIds: Id<'factions'>[];
  targetIds: Id<'asset_targets'>[];
};

async function seedCurrentTargets(
  count: number,
  rendererVersion = 'faction-sheet-v0'
): Promise<Seeded> {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert('asset_type_configs', {
      asset_type: 'faction_sheet',
      status: 'active',
      active_renderer_version: 'faction-sheet-v1',
      updated_at: NOW,
    });
    await ctx.db.insert('asset_publisher_state', {
      key: 'singleton',
      status: 'active',
      cooldown_until: 0,
      daily_browser_utc_date: '2026-07-17',
      daily_browser_ms: 0,
      next_lane: 'foreground',
    });
    await ctx.db.insert('counters', {
      key: FACTION_SHEET_PUBLICATION_COUNTER_KEY,
      value: count,
    });
  });

  const userIds: Id<'users'>[] = [];
  const factionIds: Id<'factions'>[] = [];
  const targetIds: Id<'asset_targets'>[] = [];
  for (let offset = 0; offset < count; offset += 100) {
    const batchSize = Math.min(100, count - offset);
    const inserted = await t.run(async (ctx) => {
      const batchUsers: Id<'users'>[] = [];
      const batchFactions: Id<'factions'>[] = [];
      const batchTargets: Id<'asset_targets'>[] = [];
      for (let index = 0; index < batchSize; index += 1) {
        const sequence = offset + index;
        const userId = await ctx.db.insert('users', { name: `Rollout owner ${sequence}` });
        const factionId = await ctx.db.insert('factions', {
          owner_id: userId,
          data: { ...proofFaction, name: `Rollout faction ${sequence}` },
          slug: `rollout-faction-${sequence}`,
          created_at: new Date(NOW).toISOString(),
          updated_at: new Date(NOW).toISOString(),
          is_deleted: false,
          group_id: null,
        });
        const targetId = await ctx.db.insert('asset_targets', {
          faction_id: factionId,
          asset_type: 'faction_sheet',
          desired_generation: 1,
          desired_renderer_version: rendererVersion,
          published_generation: 1,
          published_renderer_version: rendererVersion,
          published_cache_token: `existing-${sequence}`,
          published_r2_etag: `etag-${sequence}`,
          published_bytes: 1_000 + sequence,
          published_at: NOW,
          first_publication_admitted: true,
          status: 'current',
          next_eligible_at: NOW,
          attempt_count: 0,
        });
        batchUsers.push(userId);
        batchFactions.push(factionId);
        batchTargets.push(targetId);
      }
      return { batchUsers, batchFactions, batchTargets };
    });
    userIds.push(...inserted.batchUsers);
    factionIds.push(...inserted.batchFactions);
    targetIds.push(...inserted.batchTargets);
  }
  return { t, userIds, factionIds, targetIds };
}

async function createPaused(
  t: Seeded['t'],
  targetRendererVersion:
    | 'faction-sheet-v1'
    | 'faction-sheet-v2'
    | 'faction-sheet-v3' = 'faction-sheet-v1'
) {
  return await t.mutation(internal.assetRollouts.createPaused, {
    targetRendererVersion,
  });
}

test('the control plane accepts v3 while retaining known rollback versions', async () => {
  const { t } = await seedCurrentTargets(1);
  await expect(createPaused(t, 'faction-sheet-v3')).resolves.toMatchObject({
    targetRendererVersion: 'faction-sheet-v3',
    status: 'paused',
  });
});

async function resumeAndDrainDiscovery(t: Seeded['t'], rolloutId: Id<'asset_rollouts'>) {
  await t.mutation(internal.assetRollouts.resume, { rolloutId });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const progress = await t.query(internal.assetRollouts.progress, { rolloutId });
  if (!progress.rollout) throw new Error('Expected rollout progress');
  return progress.rollout;
}

async function acquireAndClaimRollout(t: Seeded['t'], sequence = 0) {
  const acquisition = await t.mutation(internal.assetPublisher.acquireBatch, {
    batchToken: BATCHES[sequence],
  });
  expect(acquisition.status).toBe('acquired');
  const claim = await t.mutation(internal.assetPublisher.claimOne, {
    batchToken: BATCHES[sequence],
    claimToken: CLAIMS[sequence],
  });
  if (claim.status !== 'claimed') throw new Error(`Expected claim, received ${claim.status}`);
  expect(claim.workLane).toBe('rollout');
  return claim;
}

function exact(claim: Awaited<ReturnType<typeof acquireAndClaimRollout>>) {
  return {
    targetId: claim.targetId,
    batchToken: claim.batchToken,
    claimToken: claim.claimToken,
    generation: claim.generation,
    rendererVersion: claim.rendererVersion,
  };
}

async function settleAndRelease(t: Seeded['t'], batchToken: string) {
  await t.mutation(internal.assetPublisher.settleBrowserReservation, {
    batchToken,
    measuredBrowserMs: 0,
  });
  await t.mutation(internal.assetPublisher.releaseBatch, {
    batchToken,
    mode: 'after_settlement',
  });
}

describe('renderer rollout control plane', () => {
  test('create-paused is fail-closed, idempotent, and transactionally unique', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { t } = await seedCurrentTargets(1);

    await expect(
      t.mutation(internal.assetRollouts.createPaused, {
        targetRendererVersion: 'operator-invented-renderer' as never,
      })
    ).rejects.toThrow();
    const [first, replay] = await Promise.all([createPaused(t), createPaused(t)]);
    expect(replay.rolloutId).toBe(first.rolloutId);
    expect(first.status).toBe('paused');
    await expect(
      t.run(async (ctx) => await ctx.db.query('asset_rollouts').take(3))
    ).resolves.toHaveLength(1);
  });

  test.each([
    25, 2_000,
  ])('discovers %i targets in exact bounded pages with one sequential continuation per nonfinal page', async (count) => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { t } = await seedCurrentTargets(count);
    const created = await createPaused(t);
    const progress = await resumeAndDrainDiscovery(t, created.rolloutId);
    const pages = Math.ceil(count / ROLLOUT_DISCOVERY_PAGE_SIZE);

    expect(progress).toMatchObject({
      status: 'running',
      discoveryPages: pages,
      discoveryContinuations: pages - 1,
      counters: {
        discovered: count,
        pending: count,
        leased: 0,
        succeeded: 0,
        superseded: 0,
        cancelled: 0,
        terminalErrors: 0,
      },
    });
    const rows = await t.run(async (ctx) => ({
      items: await ctx.db.query('asset_rollout_items').take(count + 1),
      targets: await ctx.db.query('asset_targets').take(count + 1),
    }));
    expect(rows.items).toHaveLength(count);
    expect(
      rows.targets.filter((target) => target.work_lane === 'rollout' && target.status === 'pending')
    ).toHaveLength(count);
  }, 30_000);

  test('pause/resume/cancel are idempotent and cancellation preserves published authority', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { t, targetIds } = await seedCurrentTargets(25);
    const created = await createPaused(t);
    await t.mutation(internal.assetRollouts.resume, { rolloutId: created.rolloutId });
    const paused = await t.mutation(internal.assetRollouts.pause, {
      rolloutId: created.rolloutId,
    });
    expect(paused.status).toBe('paused');
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(
      (await t.query(internal.assetRollouts.progress, { rolloutId: created.rolloutId })).rollout
        ?.counters.discovered
    ).toBe(0);

    await resumeAndDrainDiscovery(t, created.rolloutId);
    await Promise.all([
      t.mutation(internal.assetRollouts.cancel, { rolloutId: created.rolloutId }),
      t.mutation(internal.assetRollouts.cancel, { rolloutId: created.rolloutId }),
    ]);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const progress = await t.query(internal.assetRollouts.progress, {
      rolloutId: created.rolloutId,
    });
    expect(progress.rollout).toMatchObject({
      status: 'cancelled',
      counters: { pending: 0, leased: 0, cancelled: 25 },
    });
    const target = await t.run(async (ctx) => await ctx.db.get('asset_targets', targetIds[0]));
    expect(target).toMatchObject({
      desired_generation: 1,
      desired_renderer_version: 'faction-sheet-v0',
      published_generation: 1,
      published_renderer_version: 'faction-sheet-v0',
      status: 'current',
      work_lane: 'foreground',
    });
    expect(target?.rollout_id).toBeUndefined();
  });

  test('a save during discovery is enrolled once as superseded and remains foreground', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { t, userIds, factionIds, targetIds } = await seedCurrentTargets(1);
    const created = await createPaused(t);
    await t.mutation(internal.assetRollouts.resume, { rolloutId: created.rolloutId });

    vi.setSystemTime(NOW + 1);
    await t.withIdentity({ subject: userIds[0] }).mutation(api.factions.update, {
      id: factionIds[0],
      data: { ...proofFaction, name: 'Saved during rollout discovery' },
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const state = await t.run(async (ctx) => ({
      target: await ctx.db.get('asset_targets', targetIds[0]),
      items: await ctx.db.query('asset_rollout_items').take(2),
    }));
    expect(state.items).toHaveLength(1);
    expect(state.items[0]).toMatchObject({ state: 'superseded' });
    expect(state.target).toMatchObject({
      desired_generation: 2,
      desired_renderer_version: 'faction-sheet-v1',
      status: 'pending',
      work_lane: 'foreground',
    });
  });

  test('a save during a rollout claim supersedes only that item and the stale claim cannot win', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { t, userIds, factionIds, targetIds } = await seedCurrentTargets(1);
    const created = await createPaused(t);
    await resumeAndDrainDiscovery(t, created.rolloutId);
    const claim = await acquireAndClaimRollout(t);

    vi.setSystemTime(NOW + 1);
    await t.withIdentity({ subject: userIds[0] }).mutation(api.factions.update, {
      id: factionIds[0],
      data: { ...proofFaction, name: 'Saved during rollout claim' },
    });
    await expect(
      t.mutation(internal.assetPublisher.completeClaim, {
        ...exact(claim),
        r2Etag: 'stale-rollout-etag',
        bytes: 1234,
        cacheToken: `v1.${'a'.repeat(22)}.${'b'.repeat(43)}`,
      })
    ).resolves.toEqual({ status: 'stale' });

    const state = await t.run(async (ctx) => ({
      target: await ctx.db.get('asset_targets', targetIds[0]),
      items: await ctx.db.query('asset_rollout_items').take(2),
    }));
    expect(state.items[0]?.state).toBe('superseded');
    expect(state.target).toMatchObject({
      desired_generation: 2,
      desired_renderer_version: 'faction-sheet-v1',
      status: 'pending',
      work_lane: 'foreground',
    });
    expect(state.target?.published_renderer_version).toBe('faction-sheet-v0');
  });

  test('cancel waits for a leased item and bounded continuation reclaims it after exact expiry', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { t, targetIds } = await seedCurrentTargets(1);
    const created = await createPaused(t);
    await resumeAndDrainDiscovery(t, created.rolloutId);
    await acquireAndClaimRollout(t);

    await t.mutation(internal.assetRollouts.cancel, { rolloutId: created.rolloutId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const progress = await t.query(internal.assetRollouts.progress, {
      rolloutId: created.rolloutId,
    });
    expect(progress.rollout).toMatchObject({
      status: 'cancelled',
      counters: { pending: 0, leased: 0, cancelled: 1 },
    });
    const target = await t.run(async (ctx) => await ctx.db.get('asset_targets', targetIds[0]));
    expect(target).toMatchObject({
      status: 'current',
      desired_renderer_version: 'faction-sheet-v0',
      work_lane: 'foreground',
    });
    expect(target?.claim_token).toBeUndefined();
  });

  test('rollout failures retain the batch until final release and end as completed_with_errors', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { t } = await seedCurrentTargets(1);
    const created = await createPaused(t);
    await resumeAndDrainDiscovery(t, created.rolloutId);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const claim = await acquireAndClaimRollout(t, attempt);
      const failed = await t.mutation(internal.assetPublisher.failClaim, {
        ...exact(claim),
        error: `bounded rollout failure ${attempt}`,
      });
      expect(failed.status).toBe('failed');
      const owned = await t.run(
        async (ctx) => (await ctx.db.query('asset_publisher_state').take(2))[0]
      );
      expect(owned?.batch_token).toBe(BATCHES[attempt]);
      await settleAndRelease(t, BATCHES[attempt]);
      if (attempt < 2 && 'nextEligibleAt' in failed && failed.nextEligibleAt !== undefined) {
        vi.setSystemTime(failed.nextEligibleAt);
      }
    }

    const progress = await t.query(internal.assetRollouts.progress, {
      rolloutId: created.rolloutId,
    });
    expect(progress.rollout).toMatchObject({
      status: 'completed_with_errors',
      counters: { pending: 0, leased: 0, terminalErrors: 1 },
    });
    expect(progress.activeRolloutId).toBeNull();
  });

  test('a successful item checkpoint retains rollout batch ownership until exact final release', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { t } = await seedCurrentTargets(1);
    const created = await createPaused(t);
    await resumeAndDrainDiscovery(t, created.rolloutId);
    const claim = await acquireAndClaimRollout(t);

    await expect(
      t.mutation(internal.assetPublisher.completeClaim, {
        ...exact(claim),
        r2Etag: 'rollout-success-etag',
        bytes: 1_234,
        cacheToken: `v1.${'c'.repeat(22)}.${'d'.repeat(43)}`,
      })
    ).resolves.toMatchObject({ status: 'completed' });
    const owned = await t.run(
      async (ctx) => (await ctx.db.query('asset_publisher_state').take(2))[0]
    );
    expect(owned?.batch_token).toBe(BATCHES[0]);
    await settleAndRelease(t, BATCHES[0]);
    await expect(
      t.query(internal.assetRollouts.progress, { rolloutId: created.rolloutId })
    ).resolves.toMatchObject({
      activeRolloutId: null,
      rollout: {
        status: 'completed',
        counters: { pending: 0, leased: 0, succeeded: 1, terminalErrors: 0 },
      },
    });
  });

  test('terminal rollout rollback is a new paused rollout with immutable linkage', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { t } = await seedCurrentTargets(1);
    const created = await createPaused(t, 'faction-sheet-v2');
    expect(created).toMatchObject({ targetRendererVersion: 'faction-sheet-v2', status: 'paused' });
    await resumeAndDrainDiscovery(t, created.rolloutId);
    await t.mutation(internal.assetRollouts.cancel, { rolloutId: created.rolloutId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const rollback = await t.mutation(internal.assetRollouts.createRollback, {
      rollbackOfRolloutId: created.rolloutId,
      targetRendererVersion: 'faction-sheet-v1',
    });
    const replay = await t.mutation(internal.assetRollouts.createRollback, {
      rollbackOfRolloutId: created.rolloutId,
      targetRendererVersion: 'faction-sheet-v1',
    });
    expect(rollback).toMatchObject({
      status: 'paused',
      rollbackOfRolloutId: created.rolloutId,
      targetRendererVersion: 'faction-sheet-v1',
    });
    expect(replay.rolloutId).toBe(rollback.rolloutId);
  });

  test.each([
    undefined,
    'foreground',
  ] as const)('ordinary pending %s-lane work retains claim priority over an active rollout', async (workLane) => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { t } = await seedCurrentTargets(2);
    const created = await createPaused(t);
    await resumeAndDrainDiscovery(t, created.rolloutId);
    await t.run(async (ctx) => {
      const userId = await ctx.db.insert('users', { name: 'Foreground owner' });
      const factionId = await ctx.db.insert('factions', {
        owner_id: userId,
        data: { ...proofFaction, name: 'Foreground priority' },
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
        first_publication_admitted: true,
        status: 'pending',
        next_eligible_at: NOW,
        attempt_count: 0,
        ...(workLane ? { work_lane: workLane } : {}),
        foreground_updated_at: NOW,
      });
      const counter = (await ctx.db.query('counters').take(10)).find(
        (row) => row.key === FACTION_SHEET_PUBLICATION_COUNTER_KEY
      );
      if (counter) await ctx.db.patch(counter._id, { value: counter.value + 1 });
    });

    const acquisition = await t.mutation(internal.assetPublisher.acquireBatch, {
      batchToken: BATCHES[0],
    });
    expect(acquisition.status).toBe('acquired');
    const claim = await t.mutation(internal.assetPublisher.claimOne, {
      batchToken: BATCHES[0],
      claimToken: CLAIMS[0],
    });
    expect(claim).toMatchObject({ status: 'claimed', workLane: 'foreground' });
  });

  test('production-shape rows with all rollout optionals absent remain valid and foreground', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { t } = await seedCurrentTargets(1, 'faction-sheet-v1');
    const created = await createPaused(t);
    const progress = await resumeAndDrainDiscovery(t, created.rolloutId);
    expect(progress).toMatchObject({
      status: 'completed',
      counters: { discovered: 1, succeeded: 1, pending: 0, leased: 0 },
    });
  });

  test('the operator HTTP boundary is secret-scoped, strict, and returns only bounded projection', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const keys = [
      'ASSET_PUBLISHER_ACTIVATION_SECRET',
      'ASSET_PUBLISHER_POLL_SECRET',
      'ASSET_PUBLISHER_EXECUTOR_SECRET',
      'ASSET_PUBLISHER_RENDER_CAPABILITY_SECRET',
      'ASSET_PUBLISHER_CACHE_TOKEN_SECRET',
    ] as const;
    const prior = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    process.env.ASSET_PUBLISHER_ACTIVATION_SECRET = 'rollout-activation-secret';
    process.env.ASSET_PUBLISHER_POLL_SECRET = 'rollout-poll-secret';
    process.env.ASSET_PUBLISHER_EXECUTOR_SECRET = 'rollout-executor-secret';
    process.env.ASSET_PUBLISHER_RENDER_CAPABILITY_SECRET = 'rollout-render-secret';
    process.env.ASSET_PUBLISHER_CACHE_TOKEN_SECRET = 'rollout-cache-secret';
    try {
      const { t } = await seedCurrentTargets(1);
      const post = async (body: unknown, secret = 'rollout-activation-secret') =>
        await t.fetch('/asset-publishing/rollouts', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${secret}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });

      expect(
        (
          await post(
            {
              schemaVersion: 1,
              operation: 'create_paused',
              targetRendererVersion: 'faction-sheet-v1',
            },
            'rollout-poll-secret'
          )
        ).status
      ).toBe(404);
      expect(
        (
          await post({
            schemaVersion: 1,
            operation: 'create_paused',
            targetRendererVersion: 'operator-invented-renderer',
          })
        ).status
      ).toBe(400);
      expect(
        (
          await post({
            schemaVersion: 1,
            operation: 'create_paused',
            targetRendererVersion: 'faction-sheet-v1',
            dispatch: 'internal.anything',
          })
        ).status
      ).toBe(400);

      const created = await post({
        schemaVersion: 1,
        operation: 'create_paused',
        targetRendererVersion: 'faction-sheet-v2',
      });
      expect(created.status).toBe(200);
      const createdBody = (await created.json()) as { rollout: { rolloutId: string } };
      const progress = await post({
        schemaVersion: 1,
        operation: 'progress',
        rolloutId: createdBody.rollout.rolloutId,
      });
      await expect(progress.clone().json()).resolves.toMatchObject({
        effectiveMaxItems: 2,
        etaInputs: { dispatchIntervalMinutes: 15 },
      });
      expect(progress.status).toBe(200);
      const serialized = JSON.stringify(await progress.json());
      expect(serialized).toContain('remainingItems');
      expect(serialized).not.toMatch(/claimToken|batchToken|payload|last_error|lastError/);
    } finally {
      for (const key of keys) {
        const value = prior[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});
