/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { convexTest } from 'convex-test';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { proofFaction } from '../src/app/capture/proofFaction';
import { parsePublisherCaptureSnapshot } from '../src/shared/asset-publishing/publisher-snapshot';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { ITEM_CLAIM_LEASE_MS, MAX_PUBLISHER_ITEMS } from './assetPublisher';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const NOW = Date.parse('2026-07-17T12:00:00.000Z');
const CACHE_TOKEN = `v1.${'a'.repeat(22)}.${'b'.repeat(43)}`;

afterEach(() => {
  vi.useRealTimers();
  delete process.env.ASSET_PUBLISHER_EXECUTOR_SECRET;
  delete process.env.ASSET_PUBLISHER_ACTIVATION_SECRET;
  delete process.env.ASSET_PUBLISHER_CACHE_TOKEN_SECRET;
});

function token(index: number) {
  return `claim-token-${String(index).padStart(24, '0')}`;
}

async function seed(options: { active?: boolean; targets?: number } = {}) {
  const t = convexTest(schema, modules);
  const targetIds = await t.run(async (ctx) => {
    await ctx.db.insert('asset_type_configs', {
      asset_type: 'faction_sheet',
      status: options.active === false ? 'paused' : 'active',
      active_renderer_version: 'faction-sheet-v1',
      updated_at: NOW,
    });
    const ids: Id<'asset_targets'>[] = [];
    for (let index = 0; index < (options.targets ?? 1); index += 1) {
      const userId = await ctx.db.insert('users', { name: `Publisher user ${index}` });
      const factionId = await ctx.db.insert('factions', {
        owner_id: userId,
        data: { ...proofFaction, name: `Faction ${index}` },
        slug: `faction-${index}`,
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
          desired_renderer_version: 'faction-sheet-v1',
          status: 'pending',
          consecutive_render_failures: 0,
          work_lane: 'foreground',
          foreground_updated_at: NOW + index,
        })
      );
    }
    return ids;
  });
  return { t, targetIds };
}

async function takeAssigned(t: ReturnType<typeof convexTest>, count = MAX_PUBLISHER_ITEMS) {
  const result = await t.mutation(internal.assetPublisher.takeWork, {
    claimTokens: Array.from({ length: count }, (_, index) => token(index + 1)),
  });
  if (result.status !== 'assigned') {
    throw new Error(`Expected assigned work, received ${result.reason}`);
  }
  return result.items;
}

type ClaimedItem = Awaited<ReturnType<typeof takeAssigned>>[number];

function exact(item: ClaimedItem) {
  return {
    targetId: item.targetId,
    claimToken: item.claimToken,
    generation: item.generation,
    rendererVersion: item.rendererVersion,
  };
}

describe('item claim assignment', () => {
  test('is disabled without an active config and assigns at most twenty without snapshots', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const disabled = await seed({ active: false, targets: 1 });
    await expect(
      disabled.t.mutation(internal.assetPublisher.takeWork, { claimTokens: [token(1)] })
    ).resolves.toMatchObject({ status: 'empty', reason: 'disabled', items: [] });

    const { t } = await seed({ targets: MAX_PUBLISHER_ITEMS + 5 });
    const items = await takeAssigned(t);
    expect(items).toHaveLength(MAX_PUBLISHER_ITEMS);
    expect(new Set(items.map((item) => item.claimToken)).size).toBe(MAX_PUBLISHER_ITEMS);
    const state = await t.run(async (ctx) => ({
      leased: await ctx.db
        .query('asset_targets')
        .withIndex('by_asset_type_and_status_and_lease_expires_at', (q) =>
          q.eq('asset_type', 'faction_sheet').eq('status', 'leased')
        )
        .take(25),
      snapshots: await ctx.db.query('asset_claim_snapshots').take(1),
    }));
    expect(state.leased).toHaveLength(MAX_PUBLISHER_ITEMS);
    expect(state.snapshots).toEqual([]);
  });

  test('returns no work while any live item claim remains', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { t } = await seed({ targets: 2 });
    await takeAssigned(t, 2);
    await expect(
      t.mutation(internal.assetPublisher.takeWork, { claimTokens: [token(10)] })
    ).resolves.toMatchObject({ status: 'empty', reason: 'busy', items: [] });
  });

  test('preserves creation order across legacy and explicit foreground lane shapes', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { t, targetIds } = await seed({ targets: 2 });
    await t.run(async (ctx) => {
      await ctx.db.patch(targetIds[0], { work_lane: undefined });
    });
    const [item] = await takeAssigned(t, 1);
    expect(item.targetId).toBe(targetIds[0]);
    expect(item.workLane).toBe('foreground');
  });

  test('recovers expired claims and gives each recovered target a new token', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { t } = await seed({ targets: 1 });
    const [first] = await takeAssigned(t, 1);
    vi.setSystemTime(NOW + ITEM_CLAIM_LEASE_MS + 1);
    const result = await t.mutation(internal.assetPublisher.takeWork, {
      claimTokens: [token(99)],
    });
    expect(result).toMatchObject({ status: 'assigned' });
    if (result.status !== 'assigned') throw new Error('Expected recovered assignment');
    expect(result.items[0]).toMatchObject({ targetId: first.targetId, claimToken: token(99) });
  });
});

describe('exact item operations', () => {
  test('render read and revalidation are fenced by token, generation, renderer, and lease', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { t } = await seed();
    const [item] = await takeAssigned(t, 1);
    await expect(
      t.query(internal.assetPublisher.readItemForRender, { claimToken: item.claimToken })
    ).resolves.toMatchObject({
      payload: { factionId: item.factionId },
      payloadHash: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    await expect(
      t.query(internal.assetPublisher.revalidateItem, exact(item))
    ).resolves.toMatchObject({ status: 'valid' });
    await expect(
      t.query(internal.assetPublisher.revalidateItem, { ...exact(item), claimToken: token(88) })
    ).resolves.toEqual({ status: 'stale' });

    await t.run(async (ctx) => {
      await ctx.db.patch(item.targetId, { desired_generation: 2 });
    });
    await expect(
      t.query(internal.assetPublisher.readItemForRender, { claimToken: item.claimToken })
    ).resolves.toBeNull();
    await expect(t.query(internal.assetPublisher.revalidateItem, exact(item))).resolves.toEqual({
      status: 'stale',
    });
  });

  test('completion is idempotent and one completed item does not alter sibling claims', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { t } = await seed({ targets: 2 });
    const [first, second] = await takeAssigned(t, 2);
    const completion = {
      ...exact(first),
      r2Etag: 'etag-one',
      bytes: 42_000,
      cacheToken: CACHE_TOKEN,
    };
    await expect(
      t.mutation(internal.assetPublisher.completeItem, completion)
    ).resolves.toMatchObject({ status: 'completed', replay: false });
    await expect(
      t.mutation(internal.assetPublisher.completeItem, completion)
    ).resolves.toMatchObject({ status: 'completed', replay: true, cacheToken: CACHE_TOKEN });
    await t.run(async (ctx) => {
      await ctx.db.patch(first.targetId, { desired_generation: 2, status: 'pending' });
    });
    await expect(t.mutation(internal.assetPublisher.completeItem, completion)).resolves.toEqual({
      status: 'stale',
    });
    const targets = await t.run(async (ctx) => ({
      first: await ctx.db.get('asset_targets', first.targetId),
      second: await ctx.db.get('asset_targets', second.targetId),
    }));
    expect(targets.first).toMatchObject({
      status: 'pending',
      consecutive_render_failures: 0,
      published_cache_token: CACHE_TOKEN,
    });
    expect(targets.second).toMatchObject({ status: 'leased', claim_token: second.claimToken });
  });

  test('infrastructure failure retains ownership and never increments the target counter', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { t } = await seed();
    const [item] = await takeAssigned(t, 1);
    await expect(
      t.mutation(internal.assetPublisher.failItem, {
        ...exact(item),
        attribution: 'infrastructure',
        error: 'Browser session unavailable',
      })
    ).resolves.toMatchObject({ status: 'retained' });
    const target = await t.run(async (ctx) => await ctx.db.get('asset_targets', item.targetId));
    expect(target).toMatchObject({
      status: 'leased',
      claim_token: item.claimToken,
      consecutive_render_failures: 0,
    });
    expect(target?.last_error).toBeUndefined();
  });

  test('target failures one through nine return pending and the tenth blocks the generation', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { t } = await seed();
    let item = (await takeAssigned(t, 1))[0];
    for (let attempt = 1; attempt <= 10; attempt += 1) {
      const result = await t.mutation(internal.assetPublisher.failItem, {
        ...exact(item),
        attribution: 'target',
        error: `Invalid rendered PDF ${attempt}`,
      });
      expect(result).toEqual({
        status: attempt === 10 ? 'blocked' : 'failed',
        consecutiveFailures: attempt,
      });
      const target = await t.run(async (ctx) => await ctx.db.get('asset_targets', item.targetId));
      expect(target).toMatchObject({
        status: attempt === 10 ? 'blocked' : 'pending',
        consecutive_render_failures: attempt,
        last_error: `Invalid rendered PDF ${attempt}`,
      });
      if (attempt < 10) {
        const assigned = await t.mutation(internal.assetPublisher.takeWork, {
          claimTokens: [token(attempt + 10)],
        });
        if (assigned.status !== 'assigned') throw new Error('Expected retry assignment');
        item = assigned.items[0];
      }
    }
    await expect(
      t.mutation(internal.assetPublisher.takeWork, { claimTokens: [token(50)] })
    ).resolves.toMatchObject({ status: 'empty', reason: 'no_eligible_work' });
  });
});

describe('item HTTP contracts', () => {
  test('uses one executor credential and exposes only the claim token to the render read', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    process.env.ASSET_PUBLISHER_EXECUTOR_SECRET = 'executor-secret';
    process.env.ASSET_PUBLISHER_ACTIVATION_SECRET = 'activation-secret';
    process.env.ASSET_PUBLISHER_CACHE_TOKEN_SECRET = 'cache-secret';
    const { t } = await seed();
    const takeResponse = await t.fetch('/asset-publishing/executor/take-work', {
      method: 'POST',
      headers: { Authorization: 'Bearer executor-secret', 'Content-Type': 'application/json' },
      body: JSON.stringify({ schemaVersion: 1 }),
    });
    expect(takeResponse.status).toBe(200);
    const takeBody = (await takeResponse.json()) as {
      status: string;
      items: Array<ClaimedItem>;
    };
    expect(takeBody.status).toBe('assigned');
    const [item] = takeBody.items;

    const renderResponse = await t.fetch('/asset-publishing/render', {
      headers: { Authorization: `Bearer ${item.claimToken}` },
    });
    expect(renderResponse.status).toBe(200);
    const renderSnapshot = parsePublisherCaptureSnapshot(await renderResponse.json());
    expect(renderSnapshot).toEqual({
      ok: true,
      payload: {
        factionId: item.factionId,
        slug: 'faction-0',
        faction: { ...proofFaction, name: 'Faction 0' },
      },
      payloadHash: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    const itemBody = {
      schemaVersion: 1,
      targetId: item.targetId,
      claimToken: item.claimToken,
      generation: item.generation,
      rendererVersion: item.rendererVersion,
    };
    const revalidation = await t.fetch('/asset-publishing/executor/revalidate-item', {
      method: 'POST',
      headers: { Authorization: 'Bearer executor-secret', 'Content-Type': 'application/json' },
      body: JSON.stringify(itemBody),
    });
    await expect(revalidation.json()).resolves.toMatchObject({ ok: true, status: 'valid' });
    const completion = await t.fetch('/asset-publishing/executor/complete-item', {
      method: 'POST',
      headers: { Authorization: 'Bearer executor-secret', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...itemBody,
        r2Etag: 'http-etag',
        bytes: 12_345,
        cacheToken: CACHE_TOKEN,
      }),
    });
    await expect(completion.json()).resolves.toMatchObject({
      ok: true,
      status: 'completed',
      cacheToken: CACHE_TOKEN,
    });
    const oldPoll = await t.fetch('/asset-publishing/poll', {
      method: 'POST',
      headers: { Authorization: 'Bearer executor-secret' },
      body: '{}',
    });
    expect(oldPoll.status).toBe(404);
  });
});
