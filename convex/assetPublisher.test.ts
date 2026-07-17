/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { convexTest } from 'convex-test';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { proofFaction } from '../src/app/capture/proofFaction';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { createCacheSigningSecret } from './lib/assetPublisherHttp';
import { FACTION_SHEET_PUBLICATION_COUNTER_KEY } from './lib/factionSheetPublicationGuard';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const NOW = Date.parse('2026-07-16T12:00:00.000Z');
const BATCH_ONE = 'batch-token-0000000000000001';
const BATCH_TWO = 'batch-token-0000000000000002';
const CLAIM_ONE = 'claim-token-0000000000000001';
const CLAIM_TWO = 'claim-token-0000000000000002';
const CACHE_ONE = `v1.${'a'.repeat(22)}.${'b'.repeat(43)}`;
const CACHE_TWO = `v1.${'c'.repeat(22)}.${'d'.repeat(43)}`;

afterEach(() => vi.useRealTimers());

async function seed(options: { target?: boolean; publisherStatus?: 'active' | 'paused' } = {}) {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert('users', { name: 'Publisher test user' });
    const factionId = await ctx.db.insert('factions', {
      owner_id: userId,
      data: proofFaction,
      slug: 'atreides',
      created_at: new Date(NOW).toISOString(),
      updated_at: new Date(NOW).toISOString(),
      is_deleted: false,
      group_id: null,
    });
    await ctx.db.insert('asset_type_configs', {
      asset_type: 'faction_sheet',
      status: 'active',
      active_renderer_version: 'faction-sheet-v1',
      updated_at: NOW,
    });
    await ctx.db.insert('asset_publisher_state', {
      key: 'singleton',
      status: options.publisherStatus ?? 'active',
      cooldown_until: 0,
      next_lane: 'foreground',
    });
    const targetId =
      options.target === false
        ? null
        : await ctx.db.insert('asset_targets', {
            faction_id: factionId,
            asset_type: 'faction_sheet',
            desired_generation: 1,
            desired_renderer_version: 'faction-sheet-v1',
            first_publication_admitted: true,
            status: 'pending',
            next_eligible_at: NOW,
            attempt_count: 0,
          });
    await ctx.db.insert('counters', {
      key: FACTION_SHEET_PUBLICATION_COUNTER_KEY,
      value: targetId ? 1 : 0,
    });
    return { factionId, targetId };
  });
  return { t, ...ids };
}

async function addSecondTarget(t: ReturnType<typeof convexTest>) {
  await t.run(async (ctx) => {
    const userId = await ctx.db.insert('users', { name: 'Second publisher test user' });
    const factionId = await ctx.db.insert('factions', {
      owner_id: userId,
      data: { ...proofFaction, name: 'Harkonnen' },
      slug: 'harkonnen',
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
    });
    const counter = (await ctx.db.query('counters').take(10)).find(
      (row) => row.key === FACTION_SHEET_PUBLICATION_COUNTER_KEY
    );
    if (!counter) throw new Error('missing publication counter');
    await ctx.db.patch(counter._id, { value: 2 });
  });
}

function exact(claim: {
  targetId: Id<'asset_targets'>;
  batchToken: string;
  claimToken: string;
  generation: number;
  rendererVersion: string;
}) {
  return {
    targetId: claim.targetId,
    batchToken: claim.batchToken,
    claimToken: claim.claimToken,
    generation: claim.generation,
    rendererVersion: claim.rendererVersion,
  };
}

async function claim(t: ReturnType<typeof convexTest>, claimToken = CLAIM_ONE) {
  const result = await t.mutation(internal.assetPublisher.claimOne, {
    batchToken: BATCH_ONE,
    claimToken,
  });
  if (result.status !== 'claimed') throw new Error(`expected claim, got ${result.status}`);
  return result;
}

describe('paid-plan publisher ownership state machine', () => {
  test('acquire returns empty, replay, or busy without quota state', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { t: empty } = await seed({ target: false });
    await expect(
      empty.mutation(internal.assetPublisher.acquireBatch, { batchToken: BATCH_ONE })
    ).resolves.toEqual({ status: 'empty', reason: 'no_eligible_work' });

    const { t } = await seed();
    await expect(
      t.mutation(internal.assetPublisher.acquireBatch, { batchToken: BATCH_ONE })
    ).resolves.toMatchObject({ status: 'acquired', replay: false, batchToken: BATCH_ONE });
    await expect(
      t.mutation(internal.assetPublisher.acquireBatch, { batchToken: BATCH_ONE })
    ).resolves.toMatchObject({ status: 'acquired', replay: true, batchToken: BATCH_ONE });
    await expect(
      t.mutation(internal.assetPublisher.acquireBatch, { batchToken: BATCH_TWO })
    ).resolves.toMatchObject({ status: 'busy' });

    const state = await t.run(async (ctx) =>
      ctx.db
        .query('asset_publisher_state')
        .withIndex('by_key', (q) => q.eq('key', 'singleton'))
        .unique()
    );
    expect(state).not.toHaveProperty('daily_browser_ms');
    expect(state).not.toHaveProperty('browser_reservation_batch_token');
  });

  test('completes two exact claims and releases one retained batch directly', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { t } = await seed();
    await addSecondTarget(t);
    await t.mutation(internal.assetPublisher.acquireBatch, { batchToken: BATCH_ONE });

    const first = await claim(t);
    await expect(
      t.mutation(internal.assetPublisher.completeClaim, {
        ...exact(first),
        retainBatch: true,
        r2Etag: 'etag-one',
        bytes: 1_234,
        cacheToken: CACHE_ONE,
      })
    ).resolves.toMatchObject({ status: 'completed' });
    const second = await claim(t, CLAIM_TWO);
    await expect(
      t.mutation(internal.assetPublisher.completeClaim, {
        ...exact(second),
        retainBatch: true,
        r2Etag: 'etag-two',
        bytes: 2_345,
        cacheToken: CACHE_TWO,
      })
    ).resolves.toMatchObject({ status: 'completed' });
    await expect(
      t.mutation(internal.assetPublisher.releaseBatch, { batchToken: BATCH_ONE })
    ).resolves.toEqual({ status: 'released', replay: false });

    const final = await t.run(async (ctx) => ({
      targets: await ctx.db.query('asset_targets').take(3),
      snapshots: await ctx.db.query('asset_claim_snapshots').take(3),
      state: await ctx.db
        .query('asset_publisher_state')
        .withIndex('by_key', (q) => q.eq('key', 'singleton'))
        .unique(),
    }));
    expect(final.targets.filter((target) => target.status === 'current')).toHaveLength(2);
    expect(final.snapshots).toHaveLength(0);
    expect(final.state?.batch_token).toBeUndefined();
  });

  test('release remains fenced while an exact claim or snapshot owns the batch', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { t } = await seed();
    await t.mutation(internal.assetPublisher.acquireBatch, { batchToken: BATCH_ONE });
    const owned = await claim(t);
    await expect(
      t.mutation(internal.assetPublisher.releaseBatch, { batchToken: BATCH_ONE })
    ).resolves.toEqual({ status: 'stale' });
    await t.mutation(internal.assetPublisher.releaseClaim, exact(owned));
    await expect(
      t.mutation(internal.assetPublisher.releaseBatch, { batchToken: BATCH_ONE })
    ).resolves.toEqual({ status: 'stale' });
  });

  test('paused controls deny acquisition without mutating pending work', async () => {
    const { t, targetId } = await seed({ publisherStatus: 'paused' });
    await expect(
      t.mutation(internal.assetPublisher.acquireBatch, { batchToken: BATCH_ONE })
    ).resolves.toEqual({ status: 'empty', reason: 'disabled' });
    const target = targetId
      ? await t.run(async (ctx) => ctx.db.get('asset_targets', targetId))
      : null;
    expect(target).toMatchObject({ status: 'pending' });
  });
});

describe('paid-plan publisher HTTP boundary', () => {
  test('uses one executor secret and exposes no poll or settlement routes', async () => {
    const priorExecutor = process.env.ASSET_PUBLISHER_EXECUTOR_SECRET;
    process.env.ASSET_PUBLISHER_EXECUTOR_SECRET = 'executor-secret';
    try {
      const { t } = await seed();
      const acquire = await t.fetch('/asset-publishing/executor/acquire', {
        method: 'POST',
        headers: { Authorization: 'Bearer executor-secret', 'Content-Type': 'application/json' },
        body: JSON.stringify({ schemaVersion: 1, batchToken: BATCH_ONE }),
      });
      expect(acquire.status).toBe(200);
      await expect(acquire.json()).resolves.toMatchObject({ status: 'acquired' });

      for (const path of ['/asset-publishing/poll', '/asset-publishing/executor/settle-browser']) {
        const response = await t.fetch(path, {
          method: 'POST',
          headers: { Authorization: 'Bearer executor-secret', 'Content-Type': 'application/json' },
          body: JSON.stringify({ schemaVersion: 1, batchToken: BATCH_ONE }),
        });
        expect(response.status, path).toBe(404);
      }
    } finally {
      if (priorExecutor === undefined) delete process.env.ASSET_PUBLISHER_EXECUTOR_SECRET;
      else process.env.ASSET_PUBLISHER_EXECUTOR_SECRET = priorExecutor;
    }
  });

  test('completion keeps cache-token signing behind the executor secret', async () => {
    const priorExecutor = process.env.ASSET_PUBLISHER_EXECUTOR_SECRET;
    const priorRender = process.env.ASSET_PUBLISHER_RENDER_CAPABILITY_SECRET;
    const priorCache = process.env.ASSET_PUBLISHER_CACHE_TOKEN_SECRET;
    process.env.ASSET_PUBLISHER_EXECUTOR_SECRET = 'executor-secret';
    process.env.ASSET_PUBLISHER_RENDER_CAPABILITY_SECRET = 'render-secret';
    process.env.ASSET_PUBLISHER_CACHE_TOKEN_SECRET = createCacheSigningSecret();
    try {
      const { t } = await seed();
      const post = async (path: string, body: unknown) =>
        t.fetch(path, {
          method: 'POST',
          headers: { Authorization: 'Bearer executor-secret', 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      await post('/asset-publishing/executor/acquire', { schemaVersion: 1, batchToken: BATCH_ONE });
      const claimed = (await (
        await post('/asset-publishing/executor/claim', { schemaVersion: 1, batchToken: BATCH_ONE })
      ).json()) as {
        targetId: Id<'asset_targets'>;
        batchToken: string;
        claimToken: string;
        generation: number;
        rendererVersion: string;
      };
      const completed = await post('/asset-publishing/executor/complete', {
        schemaVersion: 1,
        ...exact(claimed),
        r2Etag: 'etag-http',
        bytes: 1_234,
      });
      expect(completed.status).toBe(200);
      await expect(completed.json()).resolves.toMatchObject({
        status: 'completed',
        cacheToken: expect.stringMatching(/^v1\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}$/),
      });
    } finally {
      const restore = (key: string, value: string | undefined) => {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      };
      restore('ASSET_PUBLISHER_EXECUTOR_SECRET', priorExecutor);
      restore('ASSET_PUBLISHER_RENDER_CAPABILITY_SECRET', priorRender);
      restore('ASSET_PUBLISHER_CACHE_TOKEN_SECRET', priorCache);
    }
  });
});
