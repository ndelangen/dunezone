/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { convexTest } from 'convex-test';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { proofFaction } from '../src/app/capture/proofFaction';
import { ConvexPublisherClient } from '../workers/publisher/convex';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { createCacheSigningSecret } from './lib/assetPublisherHttp';
import { FACTION_SHEET_PUBLICATION_COUNTER_KEY } from './lib/factionSheetPublicationGuard';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const NOW = Date.parse('2026-07-16T12:00:00.000Z');
const BATCH_ONE = 'batch-token-0000000000000001';
const BATCH_TWO = 'batch-token-0000000000000002';
const BATCH_THREE = 'batch-token-0000000000000003';
const CLAIM_ONE = 'claim-token-0000000000000001';
const CLAIM_TWO = 'claim-token-0000000000000002';
const CACHE_ONE = `v1.${'a'.repeat(22)}.${'b'.repeat(43)}`;
const CACHE_TWO = `v1.${'c'.repeat(22)}.${'d'.repeat(43)}`;

afterEach(() => vi.useRealTimers());

type SeedOptions = {
  publisherStatus?: 'active' | 'disabled' | 'paused' | 'absent';
  configStatus?: 'active' | 'disabled' | 'paused' | 'absent';
  targetStatus?: 'pending' | 'cooldown' | 'leased' | 'current' | 'absent';
  firstPublicationAdmitted?: boolean;
  firstPublicationCount?: number;
  nextEligibleAt?: number;
  leaseExpiresAt?: number;
};

async function seed(options: SeedOptions = {}) {
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
    if ((options.configStatus ?? 'active') !== 'absent') {
      await ctx.db.insert('asset_type_configs', {
        asset_type: 'faction_sheet',
        status: (options.configStatus ?? 'active') as 'active' | 'disabled' | 'paused',
        active_renderer_version: 'faction-sheet-v1',
        updated_at: NOW,
      });
    }
    if ((options.publisherStatus ?? 'active') !== 'absent') {
      await ctx.db.insert('asset_publisher_state', {
        key: 'singleton',
        status: (options.publisherStatus ?? 'active') as 'active' | 'disabled' | 'paused',
        cooldown_until: 0,
        daily_browser_utc_date: '2026-07-16',
        daily_browser_ms: 0,
        next_lane: 'foreground',
      });
    }
    let targetId: Id<'asset_targets'> | null = null;
    if ((options.targetStatus ?? 'pending') !== 'absent') {
      const status = (options.targetStatus ?? 'pending') as
        | 'pending'
        | 'cooldown'
        | 'leased'
        | 'current';
      targetId = await ctx.db.insert('asset_targets', {
        faction_id: factionId,
        asset_type: 'faction_sheet',
        desired_generation: 1,
        desired_renderer_version: 'faction-sheet-v1',
        first_publication_admitted: options.firstPublicationAdmitted ?? true,
        status,
        next_eligible_at: options.nextEligibleAt ?? NOW,
        attempt_count: 0,
        ...(status === 'leased'
          ? {
              batch_token: BATCH_ONE,
              claim_token: CLAIM_ONE,
              claimed_generation: 1,
              claimed_renderer_version: 'faction-sheet-v1',
              lease_expires_at: options.leaseExpiresAt ?? NOW + 60_000,
              claim_payload_hash: 'a'.repeat(64),
            }
          : {}),
      });
    }
    if ((options.publisherStatus ?? 'active') !== 'absent') {
      await ctx.db.insert('counters', {
        key: FACTION_SHEET_PUBLICATION_COUNTER_KEY,
        value:
          options.firstPublicationCount ??
          (targetId && (options.firstPublicationAdmitted ?? true) ? 1 : 0),
      });
    }
    return { factionId, targetId };
  });
  return { t, ...ids };
}

async function acquireAndClaim(t: ReturnType<typeof convexTest>, batchToken = BATCH_ONE) {
  const acquisition = await t.mutation(internal.assetPublisher.acquireBatch, { batchToken });
  expect(acquisition.status).toBe('acquired');
  const claim = await t.mutation(internal.assetPublisher.claimOne, {
    batchToken,
    claimToken: CLAIM_ONE,
  });
  if (claim.status !== 'claimed') throw new Error(`Expected a claim, received ${claim.status}`);
  return claim;
}

async function addSecondTarget(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
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
    const targetId = await ctx.db.insert('asset_targets', {
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
    if (counter) await ctx.db.patch(counter._id, { value: counter.value + 1 });
    return { factionId, targetId };
  });
}

async function addSelectionTarget(
  t: ReturnType<typeof convexTest>,
  options: {
    name: string;
    status?: 'pending' | 'cooldown' | 'leased';
    nextEligibleAt?: number;
    leaseExpiresAt?: number;
    workLane?: 'foreground';
    firstPublicationAdmitted?: boolean;
    batchToken?: string;
  }
) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert('users', { name: `${options.name} owner` });
    const factionId = await ctx.db.insert('factions', {
      owner_id: userId,
      data: { ...proofFaction, name: options.name },
      slug: options.name.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-'),
      created_at: new Date(NOW).toISOString(),
      updated_at: new Date(NOW).toISOString(),
      is_deleted: false,
      group_id: null,
    });
    const status = options.status ?? 'pending';
    const firstPublicationAdmitted = options.firstPublicationAdmitted ?? true;
    const targetId = await ctx.db.insert('asset_targets', {
      faction_id: factionId,
      asset_type: 'faction_sheet',
      desired_generation: 1,
      desired_renderer_version: 'faction-sheet-v2',
      first_publication_admitted: firstPublicationAdmitted,
      status,
      next_eligible_at: options.nextEligibleAt ?? NOW,
      attempt_count: 0,
      ...(options.workLane ? { work_lane: options.workLane } : {}),
      ...(status === 'leased'
        ? {
            batch_token: options.batchToken ?? BATCH_THREE,
            claim_token: `${options.name}-claim-token-0000000001`,
            claimed_generation: 1,
            claimed_renderer_version: 'faction-sheet-v2',
            lease_expires_at: options.leaseExpiresAt ?? NOW - 1,
            claim_payload_hash: 'e'.repeat(64),
          }
        : {}),
    });
    if (firstPublicationAdmitted) {
      const counter = (await ctx.db.query('counters').take(10)).find(
        (row) => row.key === FACTION_SHEET_PUBLICATION_COUNTER_KEY
      );
      if (counter) await ctx.db.patch(counter._id, { value: counter.value + 1 });
    }
    return { factionId, targetId };
  });
}

function exact(claim: Awaited<ReturnType<typeof acquireAndClaim>>) {
  return {
    targetId: claim.targetId,
    batchToken: claim.batchToken,
    claimToken: claim.claimToken,
    generation: claim.generation,
    rendererVersion: claim.rendererVersion,
  };
}

describe('publisher batch and exact claim state machine', () => {
  test('absent config and singleton rows are disabled without bootstrap writes', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { t } = await seed({ configStatus: 'absent', publisherStatus: 'absent' });

    await expect(
      t.query(internal.assetPublisher.hasEligibleWork, { cutoff: NOW })
    ).resolves.toEqual({ eligibility: 'empty' });
    await expect(
      t.mutation(internal.assetPublisher.acquireBatch, { batchToken: BATCH_ONE })
    ).resolves.toEqual({ status: 'empty', reason: 'disabled' });
    const rows = await t.run(async (ctx) => ({
      configs: await ctx.db.query('asset_type_configs').take(1),
      states: await ctx.db.query('asset_publisher_state').take(1),
    }));
    expect(rows).toEqual({ configs: [], states: [] });
  });

  test('returns empty or busy before granting one exact batch lease', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { t: empty } = await seed({ targetStatus: 'absent' });
    await expect(
      empty.mutation(internal.assetPublisher.acquireBatch, { batchToken: BATCH_ONE })
    ).resolves.toEqual({ status: 'empty', reason: 'no_eligible_work' });

    const { t } = await seed();
    const acquired = await t.mutation(internal.assetPublisher.acquireBatch, {
      batchToken: BATCH_ONE,
    });
    expect(acquired).toMatchObject({ status: 'acquired', batchToken: BATCH_ONE });
    await expect(
      t.mutation(internal.assetPublisher.acquireBatch, { batchToken: BATCH_TWO })
    ).resolves.toMatchObject({ status: 'busy' });
  });

  test('claims an authoritative normalized snapshot and exact generation tokens', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { t, factionId } = await seed();
    const claim = await acquireAndClaim(t);

    expect(claim).toMatchObject({
      factionId,
      assetType: 'faction_sheet',
      generation: 1,
      rendererVersion: 'faction-sheet-v1',
      payload: { factionId, slug: 'atreides', faction: proofFaction },
    });
    expect(claim.payloadHash).toMatch(/^[0-9a-f]{64}$/);
    const stored = await t.run(async (ctx) => ({
      target: await ctx.db.get('asset_targets', claim.targetId),
      snapshot: await ctx.db
        .query('asset_claim_snapshots')
        .withIndex('by_target_id', (q) => q.eq('target_id', claim.targetId))
        .unique(),
    }));
    expect(stored.target).not.toHaveProperty('claim_payload');
    expect(stored.snapshot).toMatchObject({
      target_id: claim.targetId,
      payload: claim.payload,
      payload_hash: claim.payloadHash,
    });
    await expect(
      t.mutation(internal.assetPublisher.revalidateClaim, exact(claim))
    ).resolves.toMatchObject({ status: 'valid', payloadHash: claim.payloadHash });
    await expect(
      t.query(internal.assetPublisher.readRenderSnapshot, {
        factionId,
        assetType: 'faction_sheet',
        payloadHash: 'b'.repeat(64),
        batchToken: claim.batchToken,
        claimToken: claim.claimToken,
        generation: claim.generation,
        rendererVersion: claim.rendererVersion,
      })
    ).resolves.toBeNull();
  });

  test('priority-zero explicit foreground work beats older legacy-lane pending work', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { t } = await seed({ nextEligibleAt: NOW - 60_000 });
    const explicit = await addSelectionTarget(t, {
      name: 'Priority Zero Explicit',
      nextEligibleAt: 0,
      workLane: 'foreground',
    });

    await expect(acquireAndClaim(t)).resolves.toMatchObject({
      targetId: explicit.targetId,
      workLane: 'foreground',
    });
  });

  test('legacy-lane pending work still wins when it is genuinely earlier', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { t, targetId: legacyTargetId } = await seed({ nextEligibleAt: 0 });
    await addSelectionTarget(t, {
      name: 'Later Explicit',
      nextEligibleAt: NOW - 60_000,
      workLane: 'foreground',
    });

    await expect(acquireAndClaim(t)).resolves.toMatchObject({
      targetId: legacyTargetId,
      workLane: 'foreground',
    });
  });

  test('pending status precedes cooldown across foreground lane representations', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { t } = await seed({ targetStatus: 'cooldown', nextEligibleAt: 0 });
    const explicitPending = await addSelectionTarget(t, {
      name: 'Explicit Pending',
      nextEligibleAt: NOW,
      workLane: 'foreground',
    });

    await expect(acquireAndClaim(t)).resolves.toMatchObject({
      targetId: explicitPending.targetId,
      workLane: 'foreground',
    });
  });

  test('expired foreground lease recovery compares both lane representations by expiry', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { t } = await seed({
      targetStatus: 'leased',
      leaseExpiresAt: NOW - 30_000,
    });
    const earlierExplicitLease = await addSelectionTarget(t, {
      name: 'Earlier Explicit Lease',
      status: 'leased',
      nextEligibleAt: NOW - 60_000,
      leaseExpiresAt: NOW - 60_000,
      workLane: 'foreground',
      batchToken: BATCH_THREE,
    });

    await expect(acquireAndClaim(t, BATCH_TWO)).resolves.toMatchObject({
      targetId: earlierExplicitLease.targetId,
      batchToken: BATCH_TWO,
      workLane: 'foreground',
    });
  });

  test('admitted-only selection skips an earlier unadmitted explicit target at the cap', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { t, targetId: admittedLegacyTargetId } = await seed({
      firstPublicationCount: 875,
      nextEligibleAt: NOW,
    });
    await addSelectionTarget(t, {
      name: 'Unadmitted Priority Zero',
      nextEligibleAt: 0,
      workLane: 'foreground',
      firstPublicationAdmitted: false,
    });

    await expect(acquireAndClaim(t)).resolves.toMatchObject({
      targetId: admittedLegacyTargetId,
      workLane: 'foreground',
    });
  });

  test('transactionally admits a first publication exactly once before upload', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { t } = await seed({ firstPublicationAdmitted: false });
    const claim = await acquireAndClaim(t);

    await expect(
      t.mutation(internal.assetPublisher.revalidateClaim, exact(claim))
    ).resolves.toMatchObject({ status: 'valid' });
    await expect(
      t.mutation(internal.assetPublisher.revalidateClaim, exact(claim))
    ).resolves.toMatchObject({ status: 'valid' });
    await expect(
      t.run(async (ctx) => ({
        target: await ctx.db.get('asset_targets', claim.targetId),
        counter: await ctx.db
          .query('counters')
          .withIndex('by_key', (q) => q.eq('key', FACTION_SHEET_PUBLICATION_COUNTER_KEY))
          .unique(),
      }))
    ).resolves.toMatchObject({
      target: { first_publication_admitted: true },
      counter: { value: 1 },
    });
  });

  test('at the 875-object cap skips new objects but still claims admitted overwrites', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { t: newObject } = await seed({
      firstPublicationAdmitted: false,
      firstPublicationCount: 875,
    });
    await expect(
      newObject.mutation(internal.assetPublisher.acquireBatch, { batchToken: BATCH_ONE })
    ).resolves.toEqual({ status: 'empty', reason: 'no_eligible_work' });

    const { t: overwrite } = await seed({ firstPublicationCount: 875 });
    await expect(acquireAndClaim(overwrite)).resolves.toMatchObject({ status: 'claimed' });
  });

  test('a first-publication race that reaches the cap fails closed without consuming a slot', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { t } = await seed({
      firstPublicationAdmitted: false,
      firstPublicationCount: 874,
    });
    const claim = await acquireAndClaim(t);
    await t.run(async (ctx) => {
      const counter = await ctx.db
        .query('counters')
        .withIndex('by_key', (q) => q.eq('key', FACTION_SHEET_PUBLICATION_COUNTER_KEY))
        .unique();
      if (!counter) throw new Error('missing first-publication counter');
      await ctx.db.patch(counter._id, { value: 875 });
    });

    await expect(
      t.mutation(internal.assetPublisher.revalidateClaim, exact(claim))
    ).resolves.toEqual({ status: 'storage_limit' });
    await expect(
      t.run(async (ctx) => await ctx.db.get('asset_targets', claim.targetId))
    ).resolves.toMatchObject({ first_publication_admitted: false });
  });

  test('replays the one live claim when a lost response is retried with a new claim token', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { t } = await seed();
    const second = await addSecondTarget(t);
    const first = await acquireAndClaim(t);
    const replay = await t.mutation(internal.assetPublisher.claimOne, {
      batchToken: BATCH_ONE,
      claimToken: CLAIM_TWO,
    });
    expect(replay).toMatchObject({
      status: 'claimed',
      replay: true,
      targetId: first.targetId,
      claimToken: first.claimToken,
      payloadHash: first.payloadHash,
    });
    const owned = await t.run(
      async (ctx) =>
        await ctx.db
          .query('asset_targets')
          .withIndex('by_batch_token', (q) => q.eq('batch_token', BATCH_ONE))
          .take(2)
    );
    expect(owned).toHaveLength(1);
    const otherTarget = await t.run(
      async (ctx) => await ctx.db.get('asset_targets', second.targetId)
    );
    expect(otherTarget).toMatchObject({ status: 'pending' });

    if (replay.status !== 'claimed') throw new Error('expected replayed claim');
    await expect(t.mutation(internal.assetPublisher.releaseClaim, exact(replay))).resolves.toEqual({
      status: 'released',
    });
    const finalTargets = await t.run(async (ctx) => await ctx.db.query('asset_targets').take(3));
    expect(finalTargets.filter((target) => target.status === 'leased')).toHaveLength(0);
    expect(finalTargets.filter((target) => target.status === 'pending')).toHaveLength(2);
  });

  test('retains one exact foreground batch across two completions until final settlement and release', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { t } = await seed();
    await addSecondTarget(t);
    const first = await acquireAndClaim(t);
    await expect(
      t.mutation(internal.assetPublisher.completeClaim, {
        ...exact(first),
        retainBatch: true,
        r2Etag: 'etag-size-two-first',
        bytes: 1_234,
        cacheToken: CACHE_ONE,
      })
    ).resolves.toMatchObject({ status: 'completed', replay: false });
    await expect(
      t.run(async (ctx) =>
        ctx.db
          .query('asset_publisher_state')
          .withIndex('by_key', (q) => q.eq('key', 'singleton'))
          .unique()
      )
    ).resolves.toMatchObject({ batch_token: BATCH_ONE });

    const second = await t.mutation(internal.assetPublisher.claimOne, {
      batchToken: BATCH_ONE,
      claimToken: CLAIM_TWO,
    });
    if (second.status !== 'claimed') throw new Error(`Expected second claim, got ${second.status}`);
    expect(second.targetId).not.toBe(first.targetId);
    await expect(
      t.mutation(internal.assetPublisher.completeClaim, {
        ...exact(second),
        retainBatch: true,
        r2Etag: 'etag-size-two-second',
        bytes: 2_345,
        cacheToken: CACHE_TWO,
      })
    ).resolves.toMatchObject({ status: 'completed', replay: false });
    await expect(
      t.mutation(internal.assetPublisher.claimOne, {
        batchToken: BATCH_ONE,
        claimToken: 'claim-token-0000000000000003',
      })
    ).resolves.toEqual({ status: 'empty' });
    await expect(
      t.mutation(internal.assetPublisher.settleBrowserReservation, {
        batchToken: BATCH_ONE,
        measuredBrowserMs: 12_000,
      })
    ).resolves.toMatchObject({ status: 'settled' });
    await expect(
      t.mutation(internal.assetPublisher.releaseBatch, {
        batchToken: BATCH_ONE,
        mode: 'after_settlement',
      })
    ).resolves.toMatchObject({ status: 'released' });

    const final = await t.run(async (ctx) => ({
      targets: await ctx.db.query('asset_targets').take(3),
      snapshots: await ctx.db.query('asset_claim_snapshots').take(3),
      state: await ctx.db
        .query('asset_publisher_state')
        .withIndex('by_key', (q) => q.eq('key', 'singleton'))
        .unique(),
    }));
    expect(final.targets.filter((target) => target.status === 'current')).toHaveLength(2);
    expect(final.targets.filter((target) => target.status === 'leased')).toHaveLength(0);
    expect(final.snapshots).toHaveLength(0);
    expect(final.state?.batch_token).toBeUndefined();
    expect(final.state?.browser_reservation_batch_token).toBeUndefined();
  });

  test('retained foreground failure clears the exact second claim before final batch release', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { t } = await seed();
    await addSecondTarget(t);
    const first = await acquireAndClaim(t);
    await t.mutation(internal.assetPublisher.completeClaim, {
      ...exact(first),
      retainBatch: true,
      r2Etag: 'etag-retained-first',
      bytes: 1_234,
      cacheToken: CACHE_ONE,
    });
    const second = await t.mutation(internal.assetPublisher.claimOne, {
      batchToken: BATCH_ONE,
      claimToken: CLAIM_TWO,
    });
    if (second.status !== 'claimed') throw new Error(`Expected second claim, got ${second.status}`);
    await expect(
      t.mutation(internal.assetPublisher.failClaim, {
        ...exact(second),
        retainBatch: true,
        error: 'Second item failed normally',
      })
    ).resolves.toMatchObject({ status: 'failed' });
    const retained = await t.run(async (ctx) => ({
      target: await ctx.db.get('asset_targets', second.targetId),
      snapshots: await ctx.db.query('asset_claim_snapshots').take(3),
      state: await ctx.db
        .query('asset_publisher_state')
        .withIndex('by_key', (q) => q.eq('key', 'singleton'))
        .unique(),
    }));
    expect(retained.target).toMatchObject({ status: 'cooldown' });
    expect(retained.target?.claim_token).toBeUndefined();
    expect(retained.snapshots).toHaveLength(0);
    expect(retained.state?.batch_token).toBe(BATCH_ONE);

    await t.mutation(internal.assetPublisher.settleBrowserReservation, {
      batchToken: BATCH_ONE,
      measuredBrowserMs: 12_000,
    });
    await expect(
      t.mutation(internal.assetPublisher.releaseBatch, {
        batchToken: BATCH_ONE,
        mode: 'after_settlement',
      })
    ).resolves.toMatchObject({ status: 'released' });
  });

  test('concurrent duplicate claim calls converge on one exact target claim', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { t } = await seed();
    await addSecondTarget(t);
    await expect(
      t.mutation(internal.assetPublisher.acquireBatch, { batchToken: BATCH_ONE })
    ).resolves.toMatchObject({ status: 'acquired' });
    const claims = await Promise.all([
      t.mutation(internal.assetPublisher.claimOne, {
        batchToken: BATCH_ONE,
        claimToken: CLAIM_ONE,
      }),
      t.mutation(internal.assetPublisher.claimOne, {
        batchToken: BATCH_ONE,
        claimToken: CLAIM_TWO,
      }),
    ]);
    expect(claims.every((claim) => claim.status === 'claimed')).toBe(true);
    if (claims[0].status !== 'claimed' || claims[1].status !== 'claimed') {
      throw new Error('expected converged claims');
    }
    expect(claims[0].targetId).toBe(claims[1].targetId);
    expect(claims[0].claimToken).toBe(claims[1].claimToken);
    expect(claims.filter((claim) => claim.replay)).toHaveLength(1);
    const owned = await t.run(
      async (ctx) =>
        await ctx.db
          .query('asset_targets')
          .withIndex('by_batch_token', (q) => q.eq('batch_token', BATCH_ONE))
          .take(2)
    );
    expect(owned).toHaveLength(1);
  });

  test('revalidation enforces the fixed upload margin and release requires exact tokens', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { t } = await seed();
    const claim = await acquireAndClaim(t);
    vi.setSystemTime(claim.leaseExpiresAt - 2 * 60 * 1_000 + 1);
    await expect(
      t.mutation(internal.assetPublisher.revalidateClaim, exact(claim))
    ).resolves.toMatchObject({
      status: 'insufficient_lease',
      leaseExpiresAt: claim.leaseExpiresAt,
    });
    await expect(
      t.mutation(internal.assetPublisher.releaseClaim, {
        ...exact(claim),
        claimToken: CLAIM_TWO,
      })
    ).resolves.toEqual({ status: 'stale' });
    await expect(t.mutation(internal.assetPublisher.releaseClaim, exact(claim))).resolves.toEqual({
      status: 'released',
    });
  });

  test('recovers an expired item lease only under a later exact batch', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { t } = await seed();
    await acquireAndClaim(t);
    await expect(
      t.mutation(internal.assetPublisher.settleBrowserReservation, {
        batchToken: BATCH_ONE,
        measuredBrowserMs: 10_000,
      })
    ).resolves.toMatchObject({ status: 'settled' });

    vi.setSystemTime(NOW + 12 * 60 * 1_000 + 1);
    await expect(
      t.mutation(internal.assetPublisher.acquireBatch, { batchToken: BATCH_TWO })
    ).resolves.toMatchObject({ status: 'acquired', batchToken: BATCH_TWO });
    const recovered = await t.mutation(internal.assetPublisher.claimOne, {
      batchToken: BATCH_TWO,
      claimToken: CLAIM_TWO,
    });
    expect(recovered).toMatchObject({
      status: 'claimed',
      batchToken: BATCH_TWO,
      claimToken: CLAIM_TWO,
      generation: 1,
    });
  });

  test('save-generation advancement rejects stale completion and leaves newer work pending', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { t } = await seed();
    const claim = await acquireAndClaim(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(claim.targetId, { desired_generation: 2 });
    });

    await expect(
      t.mutation(internal.assetPublisher.completeClaim, {
        ...exact(claim),
        r2Etag: 'etag-generation-one',
        bytes: 1_234,
        cacheToken: CACHE_ONE,
      })
    ).resolves.toEqual({ status: 'stale' });
    const target = await t.run(async (ctx) => await ctx.db.get('asset_targets', claim.targetId));
    expect(target).toMatchObject({ status: 'pending', desired_generation: 2 });
    expect(target?.published_generation).toBeUndefined();
    expect(target?.claim_token).toBeUndefined();
  });

  test('exact completion is idempotent and a stale owner cannot clear a newer claim', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { t } = await seed();
    const claim = await acquireAndClaim(t);
    const first = await t.mutation(internal.assetPublisher.completeClaim, {
      ...exact(claim),
      r2Etag: 'etag-one',
      bytes: 1_234,
      cacheToken: CACHE_ONE,
    });
    expect(first).toMatchObject({ status: 'completed', replay: false, cacheToken: CACHE_ONE });
    const replay = await t.mutation(internal.assetPublisher.completeClaim, {
      ...exact(claim),
      r2Etag: 'different-etag-is-ignored',
      bytes: 9_999,
      cacheToken: CACHE_TWO,
    });
    expect(replay).toMatchObject({ status: 'completed', replay: true, cacheToken: CACHE_ONE });
    await expect(
      t.run(
        async (ctx) =>
          await ctx.db
            .query('asset_claim_snapshots')
            .withIndex('by_target_id', (q) => q.eq('target_id', claim.targetId))
            .unique()
      )
    ).resolves.toBeNull();
    await expect(
      t.query(internal.assetPublisher.readClaimIdentity, exact(claim))
    ).resolves.toMatchObject({ assetType: 'faction_sheet' });

    await t.run(async (ctx) => {
      await ctx.db.patch(claim.targetId, {
        status: 'leased',
        batch_token: BATCH_TWO,
        claim_token: CLAIM_TWO,
        claimed_generation: 2,
        claimed_renderer_version: 'faction-sheet-v1',
        desired_generation: 2,
        lease_expires_at: NOW + 60_000,
      });
    });
    await expect(t.mutation(internal.assetPublisher.releaseClaim, exact(claim))).resolves.toEqual({
      status: 'stale',
    });
    const target = await t.run(async (ctx) => await ctx.db.get('asset_targets', claim.targetId));
    expect(target).toMatchObject({
      batch_token: BATCH_TWO,
      claim_token: CLAIM_TWO,
      status: 'leased',
    });
  });

  test('failure uses bounded retry cooldown and exact release is token scoped', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { t } = await seed();
    const claim = await acquireAndClaim(t);
    await t.mutation(internal.assetPublisher.settleBrowserReservation, {
      batchToken: BATCH_ONE,
      measuredBrowserMs: 10_000,
    });
    await expect(
      t.mutation(internal.assetPublisher.failClaim, { ...exact(claim), error: 'Browser failed' })
    ).resolves.toEqual({ status: 'failed', nextEligibleAt: NOW + 60_000 });
    await expect(
      t.query(internal.assetPublisher.hasEligibleWork, { cutoff: NOW + 59_999 })
    ).resolves.toEqual({ eligibility: 'empty' });
    await expect(
      t.query(internal.assetPublisher.hasEligibleWork, { cutoff: NOW + 60_000 })
    ).resolves.toEqual({ eligibility: 'eligible' });
  });

  test.each([
    ['generation', { desired_generation: 2 }],
    ['renderer', { desired_renderer_version: 'faction-sheet-v2' }],
  ] as const)('an old failure leaves newer desired %s work pending without cooldown', async (_label, drift) => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { t } = await seed();
    const claim = await acquireAndClaim(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(claim.targetId, drift);
    });
    await expect(
      t.mutation(internal.assetPublisher.failClaim, {
        ...exact(claim),
        error: 'Old render failed',
      })
    ).resolves.toEqual({ status: 'stale' });
    const target = await t.run(async (ctx) => await ctx.db.get('asset_targets', claim.targetId));
    expect(target).toMatchObject({ status: 'pending', next_eligible_at: NOW, ...drift });
    expect(target?.last_error).toBeUndefined();
    expect(target?.claim_token).toBeUndefined();
  });
});

describe('daily Browser reservation accounting', () => {
  test('acquire reserves conservatively and exact settlement is idempotent', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { t } = await seed();
    const first = await t.mutation(internal.assetPublisher.acquireBatch, {
      batchToken: BATCH_ONE,
    });
    expect(first).toMatchObject({
      status: 'acquired',
      replay: false,
      browserReservationMs: 30_000,
      dailyBrowserMs: 30_000,
    });
    await expect(
      t.mutation(internal.assetPublisher.acquireBatch, { batchToken: BATCH_ONE })
    ).resolves.toMatchObject({ status: 'acquired', replay: true, dailyBrowserMs: 30_000 });
    await expect(
      t.mutation(internal.assetPublisher.settleBrowserReservation, {
        batchToken: BATCH_ONE,
        measuredBrowserMs: 9_114,
      })
    ).resolves.toEqual({
      status: 'settled',
      replay: false,
      measuredBrowserMs: 9_114,
      dailyBrowserMs: 9_114,
    });
    await expect(
      t.mutation(internal.assetPublisher.settleBrowserReservation, {
        batchToken: BATCH_ONE,
        measuredBrowserMs: 1,
      })
    ).resolves.toEqual({ status: 'settled', replay: true, measuredBrowserMs: 9_114 });
  });

  test('stale tokens cannot settle or release a newer batch', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { t } = await seed();
    await t.mutation(internal.assetPublisher.acquireBatch, { batchToken: BATCH_ONE });
    await expect(
      t.mutation(internal.assetPublisher.settleBrowserReservation, {
        batchToken: BATCH_TWO,
        measuredBrowserMs: 1,
      })
    ).resolves.toEqual({ status: 'stale' });
    await expect(
      t.mutation(internal.assetPublisher.releaseBatch, {
        batchToken: BATCH_TWO,
        mode: 'no_browser',
      })
    ).resolves.toEqual({ status: 'stale' });
    const state = await t.run(
      async (ctx) =>
        await ctx.db
          .query('asset_publisher_state')
          .withIndex('by_key', (q) => q.eq('key', 'singleton'))
          .unique()
    );
    expect(state).toMatchObject({
      batch_token: BATCH_ONE,
      browser_reservation_batch_token: BATCH_ONE,
      daily_browser_ms: 30_000,
    });
  });

  test('quota fails closed and the next UTC day clears a lost reservation', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { t: currentAccounting } = await seed();
    await currentAccounting.run(async (ctx) => {
      const state = await ctx.db
        .query('asset_publisher_state')
        .withIndex('by_key', (q) => q.eq('key', 'singleton'))
        .unique();
      if (!state) throw new Error('missing state');
      await ctx.db.patch(state._id, { daily_browser_ms: 133_485 });
    });
    await expect(
      currentAccounting.mutation(internal.assetPublisher.acquireBatch, { batchToken: BATCH_ONE })
    ).resolves.toMatchObject({
      status: 'acquired',
      dailyBrowserMs: 163_485,
      browserReservationMs: 30_000,
    });

    const { t: exactAllowance } = await seed();
    await exactAllowance.run(async (ctx) => {
      const state = await ctx.db
        .query('asset_publisher_state')
        .withIndex('by_key', (q) => q.eq('key', 'singleton'))
        .unique();
      if (!state) throw new Error('missing state');
      await ctx.db.patch(state._id, { daily_browser_ms: 570_000 });
    });
    await expect(
      exactAllowance.mutation(internal.assetPublisher.acquireBatch, { batchToken: BATCH_ONE })
    ).resolves.toMatchObject({
      status: 'acquired',
      dailyBrowserMs: 600_000,
      browserReservationMs: 30_000,
    });

    const { t: quota } = await seed();
    await quota.run(async (ctx) => {
      const state = await ctx.db
        .query('asset_publisher_state')
        .withIndex('by_key', (q) => q.eq('key', 'singleton'))
        .unique();
      if (!state) throw new Error('missing state');
      await ctx.db.patch(state._id, { daily_browser_ms: 570_001 });
    });
    await expect(
      quota.mutation(internal.assetPublisher.acquireBatch, { batchToken: BATCH_ONE })
    ).resolves.toEqual({ status: 'empty', reason: 'browser_quota' });

    const { t } = await seed();
    await t.mutation(internal.assetPublisher.acquireBatch, { batchToken: BATCH_ONE });
    vi.setSystemTime(Date.parse('2026-07-17T00:00:01.000Z'));
    await expect(
      t.query(internal.assetPublisher.hasEligibleWork, { cutoff: Date.now() })
    ).resolves.toEqual({ eligibility: 'eligible' });
    await expect(
      t.mutation(internal.assetPublisher.acquireBatch, { batchToken: BATCH_TWO })
    ).resolves.toMatchObject({
      status: 'acquired',
      batchToken: BATCH_TWO,
      dailyBrowserMs: 30_000,
    });
  });

  test('completion cannot erase an unsettled reservation and late settlement remains exact', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { t } = await seed();
    const claim = await acquireAndClaim(t);
    await t.mutation(internal.assetPublisher.completeClaim, {
      ...exact(claim),
      r2Etag: 'etag-before-settlement',
      bytes: 1_234,
      cacheToken: CACHE_ONE,
    });
    const before = await t.run(
      async (ctx) =>
        await ctx.db
          .query('asset_publisher_state')
          .withIndex('by_key', (q) => q.eq('key', 'singleton'))
          .unique()
    );
    expect(before?.batch_token).toBeUndefined();
    expect(before).toMatchObject({
      browser_reservation_batch_token: BATCH_ONE,
      daily_browser_ms: 30_000,
    });
    await expect(
      t.mutation(internal.assetPublisher.settleBrowserReservation, {
        batchToken: BATCH_ONE,
        measuredBrowserMs: 8_170,
      })
    ).resolves.toMatchObject({ status: 'settled', dailyBrowserMs: 8_170 });
  });

  test('lost settlement blocks another batch until UTC reset', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { t } = await seed();
    await addSecondTarget(t);
    const claim = await acquireAndClaim(t);
    await t.mutation(internal.assetPublisher.completeClaim, {
      ...exact(claim),
      r2Etag: 'etag-lost-settlement',
      bytes: 1_234,
      cacheToken: CACHE_ONE,
    });
    await expect(
      t.query(internal.assetPublisher.hasEligibleWork, { cutoff: NOW })
    ).resolves.toEqual({ eligibility: 'empty' });
    await expect(
      t.mutation(internal.assetPublisher.acquireBatch, { batchToken: BATCH_TWO })
    ).resolves.toEqual({ status: 'busy', reason: 'browser_reservation' });
  });

  test('an actual overrun is fully charged and blocks another acquisition', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { t } = await seed();
    await addSecondTarget(t);
    await t.mutation(internal.assetPublisher.acquireBatch, { batchToken: BATCH_ONE });
    await expect(
      t.mutation(internal.assetPublisher.settleBrowserReservation, {
        batchToken: BATCH_ONE,
        measuredBrowserMs: 700_000,
      })
    ).resolves.toMatchObject({
      status: 'settled',
      measuredBrowserMs: 700_000,
      dailyBrowserMs: 700_000,
      overrun: true,
    });
    await expect(
      t.mutation(internal.assetPublisher.releaseBatch, {
        batchToken: BATCH_ONE,
        mode: 'after_settlement',
      })
    ).resolves.toMatchObject({ status: 'released' });
    await expect(
      t.mutation(internal.assetPublisher.acquireBatch, { batchToken: BATCH_TWO })
    ).resolves.toEqual({ status: 'empty', reason: 'browser_quota' });
  });

  test('real executor HTTP client records a post-lifecycle overrun and exhausts quota', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const priorPoll = process.env.ASSET_PUBLISHER_POLL_SECRET;
    const priorExecutor = process.env.ASSET_PUBLISHER_EXECUTOR_SECRET;
    process.env.ASSET_PUBLISHER_POLL_SECRET = 'poll-secret';
    process.env.ASSET_PUBLISHER_EXECUTOR_SECRET = 'executor-secret';
    try {
      const { t } = await seed();
      await addSecondTarget(t);
      await t.mutation(internal.assetPublisher.acquireBatch, { batchToken: BATCH_ONE });
      const current = NOW + 581_000;
      vi.setSystemTime(current);
      const client = new ConvexPublisherClient({
        pollUrl: 'https://convex.test/asset-publishing/poll',
        executorBaseUrl: 'https://convex.test/asset-publishing/executor',
        pollToken: 'poll-secret',
        executorToken: 'executor-secret',
        now: () => current,
        fetcher: (async (input, init) => {
          const url = input instanceof Request ? input.url : String(input);
          return await t.fetch(new URL(url).pathname, init);
        }) as typeof fetch,
      });
      await expect(client.settleBrowser(BATCH_ONE, 581_000, NOW + 610_000)).resolves.toBe(
        'settled'
      );
      const state = await t.run(
        async (ctx) =>
          await ctx.db
            .query('asset_publisher_state')
            .withIndex('by_key', (q) => q.eq('key', 'singleton'))
            .unique()
      );
      expect(state?.daily_browser_ms).toBe(581_000);
      await t.mutation(internal.assetPublisher.releaseBatch, {
        batchToken: BATCH_ONE,
        mode: 'after_settlement',
      });
      await expect(
        t.mutation(internal.assetPublisher.acquireBatch, { batchToken: BATCH_TWO })
      ).resolves.toEqual({ status: 'empty', reason: 'browser_quota' });
    } finally {
      if (priorPoll === undefined) delete process.env.ASSET_PUBLISHER_POLL_SECRET;
      else process.env.ASSET_PUBLISHER_POLL_SECRET = priorPoll;
      if (priorExecutor === undefined) delete process.env.ASSET_PUBLISHER_EXECUTOR_SECRET;
      else process.env.ASSET_PUBLISHER_EXECUTOR_SECRET = priorExecutor;
    }
  });

  test('batch-only refund cannot clear a committed claim or expose a second live target', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { t } = await seed();
    await addSecondTarget(t);
    const claim = await acquireAndClaim(t);
    await expect(
      t.mutation(internal.assetPublisher.releaseBatch, {
        batchToken: BATCH_ONE,
        mode: 'no_browser',
      })
    ).resolves.toEqual({ status: 'stale' });
    await expect(
      t.mutation(internal.assetPublisher.acquireBatch, { batchToken: BATCH_TWO })
    ).resolves.toMatchObject({ status: 'busy' });
    const live = await t.run(
      async (ctx) =>
        await ctx.db
          .query('asset_targets')
          .withIndex('by_batch_token', (q) => q.eq('batch_token', BATCH_ONE))
          .collect()
    );
    expect(live).toHaveLength(1);
    expect(live[0]?._id).toBe(claim.targetId);
  });

  test('an orphaned exact snapshot also preserves the singleton fence for a second target', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { t } = await seed();
    await addSecondTarget(t);
    const claim = await acquireAndClaim(t);
    await t.run(async (ctx) => await ctx.db.delete(claim.targetId));
    await expect(
      t.mutation(internal.assetPublisher.releaseBatch, {
        batchToken: BATCH_ONE,
        mode: 'no_browser',
      })
    ).resolves.toEqual({ status: 'stale' });
    await expect(
      t.mutation(internal.assetPublisher.acquireBatch, { batchToken: BATCH_TWO })
    ).resolves.toMatchObject({ status: 'busy' });
  });

  test('an exact no-browser release refunds an empty claim batch and replays safely', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { t, targetId } = await seed();
    await t.mutation(internal.assetPublisher.acquireBatch, { batchToken: BATCH_ONE });
    if (!targetId) throw new Error('missing target');
    await t.run(async (ctx) => await ctx.db.delete(targetId));
    await expect(
      t.mutation(internal.assetPublisher.claimOne, {
        batchToken: BATCH_ONE,
        claimToken: CLAIM_ONE,
      })
    ).resolves.toEqual({ status: 'empty' });
    const release = {
      batchToken: BATCH_ONE,
      mode: 'no_browser' as const,
    };
    await expect(t.mutation(internal.assetPublisher.releaseBatch, release)).resolves.toEqual({
      status: 'released',
      replay: false,
      dailyBrowserMs: 0,
    });
    await expect(t.mutation(internal.assetPublisher.releaseBatch, release)).resolves.toEqual({
      status: 'released',
      replay: true,
    });
  });
});

describe('read-only eligibility and public projection', () => {
  test.each([
    ['pending', {}, 'eligible'],
    ['cooldown before cutoff', { targetStatus: 'cooldown', nextEligibleAt: NOW + 1 }, 'empty'],
    ['cooldown at cutoff', { targetStatus: 'cooldown', nextEligibleAt: NOW }, 'eligible'],
    ['paused publisher', { publisherStatus: 'paused' }, 'empty'],
    ['disabled config', { configStatus: 'disabled' }, 'empty'],
    ['no target', { targetStatus: 'absent' }, 'empty'],
  ] as const)('%s', async (_label, options, eligibility) => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { t } = await seed(options);
    const before = await t.run(async (ctx) => ({
      targets: await ctx.db.query('asset_targets').take(10),
      states: await ctx.db.query('asset_publisher_state').take(10),
    }));
    await expect(
      t.query(internal.assetPublisher.hasEligibleWork, { cutoff: NOW })
    ).resolves.toEqual({ eligibility });
    const after = await t.run(async (ctx) => ({
      targets: await ctx.db.query('asset_targets').take(10),
      states: await ctx.db.query('asset_publisher_state').take(10),
    }));
    expect(after).toEqual(before);
  });

  test('an active lease makes polling empty while an expired lease is eligible', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { t } = await seed({ targetStatus: 'leased', leaseExpiresAt: NOW + 1 });
    await t.run(async (ctx) => {
      const state = await ctx.db
        .query('asset_publisher_state')
        .withIndex('by_key', (q) => q.eq('key', 'singleton'))
        .unique();
      if (!state) throw new Error('missing state');
      await ctx.db.patch(state._id, {
        batch_token: BATCH_ONE,
        batch_lease_expires_at: NOW + 1,
      });
    });
    await expect(
      t.query(internal.assetPublisher.hasEligibleWork, { cutoff: NOW })
    ).resolves.toEqual({ eligibility: 'empty' });
    vi.setSystemTime(NOW + 2);
    await expect(
      t.query(internal.assetPublisher.hasEligibleWork, { cutoff: NOW + 2 })
    ).resolves.toEqual({ eligibility: 'eligible' });
  });

  test('public metadata omits claims, payloads, leases, secrets, and errors', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { t, factionId } = await seed();
    const claim = await acquireAndClaim(t);
    await t.mutation(internal.assetPublisher.completeClaim, {
      ...exact(claim),
      r2Etag: 'etag-one',
      bytes: 1_234,
      cacheToken: CACHE_ONE,
    });
    const metadata = await t.query(api.assetPublisher.getPublicMetadata, {
      factionId,
      assetType: 'faction_sheet',
    });
    expect(metadata).toMatchObject({
      factionId,
      assetType: 'faction_sheet',
      status: 'current',
      publication: {
        generation: 1,
        rendererVersion: 'faction-sheet-v1',
        cacheToken: CACHE_ONE,
        r2Etag: 'etag-one',
        bytes: 1_234,
        stablePath: `/published/factions/${encodeURIComponent(factionId)}/sheet.pdf`,
        href: `/published/factions/${encodeURIComponent(factionId)}/sheet.pdf?v=${encodeURIComponent(CACHE_ONE)}`,
      },
    });
    expect(Object.keys(metadata ?? {}).sort()).toEqual([
      'assetType',
      'factionId',
      'publication',
      'status',
    ]);
    expect(Object.keys(metadata?.publication ?? {}).sort()).toEqual([
      'bytes',
      'cacheToken',
      'generation',
      'href',
      'publishedAt',
      'r2Etag',
      'rendererVersion',
      'stablePath',
    ]);
    expect(JSON.stringify(metadata)).not.toContain('atreides');
    expect(JSON.stringify(metadata)).not.toContain('http://');
    expect(JSON.stringify(metadata)).not.toContain('https://');
  });

  test('soft deletion retains exact environment-neutral publication metadata', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { t, factionId } = await seed();
    const claim = await acquireAndClaim(t);
    await t.mutation(internal.assetPublisher.completeClaim, {
      ...exact(claim),
      r2Etag: 'etag-one',
      bytes: 1_234,
      cacheToken: CACHE_ONE,
    });
    await t.run(async (ctx) => await ctx.db.patch(factionId, { is_deleted: true }));

    await expect(
      t.query(api.assetPublisher.getPublicMetadata, {
        factionId,
        assetType: 'faction_sheet',
      })
    ).resolves.toMatchObject({
      factionId,
      publication: {
        cacheToken: CACHE_ONE,
        stablePath: `/published/factions/${encodeURIComponent(factionId)}/sheet.pdf`,
        href: `/published/factions/${encodeURIComponent(factionId)}/sheet.pdf?v=${encodeURIComponent(CACHE_ONE)}`,
      },
    });
  });
});

describe('publisher HTTP authorization separation', () => {
  test('poll credentials cannot invoke any executor mutation and executor credentials cannot poll', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const priorPoll = process.env.ASSET_PUBLISHER_POLL_SECRET;
    const priorExecutor = process.env.ASSET_PUBLISHER_EXECUTOR_SECRET;
    process.env.ASSET_PUBLISHER_POLL_SECRET = 'poll-secret';
    process.env.ASSET_PUBLISHER_EXECUTOR_SECRET = 'executor-secret';
    try {
      const { t, targetId } = await seed();
      if (!targetId) throw new Error('missing target');
      const exactBody = {
        schemaVersion: 1,
        targetId,
        batchToken: BATCH_ONE,
        claimToken: CLAIM_ONE,
        generation: 1,
        rendererVersion: 'faction-sheet-v1',
      };
      const requests = [
        ['/asset-publishing/executor/acquire', { schemaVersion: 1, batchToken: BATCH_ONE }],
        ['/asset-publishing/executor/claim', { schemaVersion: 1, batchToken: BATCH_ONE }],
        [
          '/asset-publishing/executor/settle-browser',
          { schemaVersion: 1, batchToken: BATCH_ONE, measuredBrowserMs: 1 },
        ],
        [
          '/asset-publishing/executor/release-batch',
          { schemaVersion: 1, batchToken: BATCH_ONE, mode: 'no_browser' },
        ],
        ['/asset-publishing/executor/revalidate', exactBody],
        ['/asset-publishing/executor/complete', { ...exactBody, r2Etag: 'etag', bytes: 1_234 }],
        ['/asset-publishing/executor/fail', { ...exactBody, error: 'failed' }],
        ['/asset-publishing/executor/release', exactBody],
      ] as const;
      const before = await t.run(async (ctx) => ({
        target: await ctx.db.get('asset_targets', targetId),
        state: await ctx.db
          .query('asset_publisher_state')
          .withIndex('by_key', (q) => q.eq('key', 'singleton'))
          .unique(),
      }));
      for (const [path, body] of requests) {
        const response = await t.fetch(path, {
          method: 'POST',
          headers: { Authorization: 'Bearer poll-secret', 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        expect(response.status, path).toBe(404);
      }
      const pollResponse = await t.fetch('/asset-publishing/poll', {
        method: 'POST',
        headers: { Authorization: 'Bearer executor-secret', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schemaVersion: 1,
          scheduledCutoff: new Date(NOW).toISOString(),
          triggerId: '10a5318c-e0f2-49c6-bd19-5221a80643f7',
        }),
      });
      expect(pollResponse.status).toBe(404);
      const after = await t.run(async (ctx) => ({
        target: await ctx.db.get('asset_targets', targetId),
        state: await ctx.db
          .query('asset_publisher_state')
          .withIndex('by_key', (q) => q.eq('key', 'singleton'))
          .unique(),
      }));
      expect(after).toEqual(before);
    } finally {
      if (priorPoll === undefined) delete process.env.ASSET_PUBLISHER_POLL_SECRET;
      else process.env.ASSET_PUBLISHER_POLL_SECRET = priorPoll;
      if (priorExecutor === undefined) delete process.env.ASSET_PUBLISHER_EXECUTOR_SECRET;
      else process.env.ASSET_PUBLISHER_EXECUTOR_SECRET = priorExecutor;
    }
  });

  test('a lost claim response replays the exact HTTP claim and completion strands no target', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const prior = {
      poll: process.env.ASSET_PUBLISHER_POLL_SECRET,
      executor: process.env.ASSET_PUBLISHER_EXECUTOR_SECRET,
      render: process.env.ASSET_PUBLISHER_RENDER_CAPABILITY_SECRET,
      cache: process.env.ASSET_PUBLISHER_CACHE_TOKEN_SECRET,
    };
    process.env.ASSET_PUBLISHER_POLL_SECRET = 'poll-secret';
    process.env.ASSET_PUBLISHER_EXECUTOR_SECRET = 'executor-secret';
    process.env.ASSET_PUBLISHER_RENDER_CAPABILITY_SECRET = 'render-secret';
    process.env.ASSET_PUBLISHER_CACHE_TOKEN_SECRET = createCacheSigningSecret();
    try {
      const { t } = await seed();
      await addSecondTarget(t);
      const post = async (path: string, body: unknown) =>
        await t.fetch(path, {
          method: 'POST',
          headers: {
            Authorization: 'Bearer executor-secret',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });
      const acquisition = (await (
        await post('/asset-publishing/executor/acquire', {
          schemaVersion: 1,
          batchToken: BATCH_ONE,
        })
      ).json()) as { status: string; batchToken?: string };
      expect(acquisition.status).toBe('acquired');
      if (!acquisition.batchToken) throw new Error('missing batch token');
      const acquisitionReplay = (await (
        await post('/asset-publishing/executor/acquire', {
          schemaVersion: 1,
          batchToken: BATCH_ONE,
        })
      ).json()) as {
        status: string;
        replay?: boolean;
        batchToken?: string;
        dailyBrowserMs?: number;
      };
      expect(acquisitionReplay).toMatchObject({
        status: 'acquired',
        replay: true,
        batchToken: BATCH_ONE,
        dailyBrowserMs: 30_000,
      });
      const differentAcquisition = (await (
        await post('/asset-publishing/executor/acquire', {
          schemaVersion: 1,
          batchToken: BATCH_TWO,
        })
      ).json()) as { status: string };
      expect(differentAcquisition.status).toBe('busy');

      const claimBody = { schemaVersion: 1, batchToken: acquisition.batchToken };
      const firstResponse = await post('/asset-publishing/executor/claim', claimBody);
      expect(firstResponse.status).toBe(200);
      const firstClaim = (await firstResponse.json()) as {
        status: string;
        replay: boolean;
        targetId: string;
        claimToken: string;
        generation: number;
        rendererVersion: string;
      };
      const retryResponse = await post('/asset-publishing/executor/claim', claimBody);
      expect(retryResponse.status).toBe(200);
      const replay = (await retryResponse.json()) as typeof firstClaim;
      expect(firstClaim).toMatchObject({ status: 'claimed', replay: false });
      expect(replay).toMatchObject({
        status: 'claimed',
        replay: true,
        targetId: firstClaim.targetId,
        claimToken: firstClaim.claimToken,
      });

      const settlement = await post('/asset-publishing/executor/settle-browser', {
        schemaVersion: 1,
        batchToken: acquisition.batchToken,
        measuredBrowserMs: 8_170,
      });
      expect(settlement.status).toBe(200);
      await expect(settlement.json()).resolves.toMatchObject({
        status: 'settled',
        measuredBrowserMs: 8_170,
      });

      const completionBody = {
        schemaVersion: 1,
        targetId: replay.targetId,
        batchToken: acquisition.batchToken,
        claimToken: replay.claimToken,
        generation: replay.generation,
        rendererVersion: replay.rendererVersion,
        r2Etag: 'http-replay-etag',
        bytes: 1_234,
      };
      const completion = await post('/asset-publishing/executor/complete', completionBody);
      expect(completion.status).toBe(200);
      const completed = (await completion.json()) as { status: string; cacheToken: string };
      expect(completed).toMatchObject({ status: 'completed' });
      expect(completed.cacheToken).toMatch(/^v1\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}$/);
      const lostResponseReplay = await post('/asset-publishing/executor/complete', completionBody);
      expect(lostResponseReplay.status).toBe(200);
      await expect(lostResponseReplay.json()).resolves.toMatchObject({
        status: 'completed',
        replay: true,
        cacheToken: completed.cacheToken,
      });
      const final = await t.run(async (ctx) => ({
        targets: await ctx.db.query('asset_targets').take(3),
        state: await ctx.db
          .query('asset_publisher_state')
          .withIndex('by_key', (q) => q.eq('key', 'singleton'))
          .unique(),
      }));
      expect(final.targets.filter((target) => target.status === 'leased')).toHaveLength(0);
      expect(final.targets.filter((target) => target.status === 'current')).toHaveLength(1);
      expect(final.targets.filter((target) => target.status === 'pending')).toHaveLength(1);
      expect(
        final.targets.find((target) => target.status === 'current')?.published_cache_token
      ).toBe(completed.cacheToken);
      expect(final.state?.batch_token).toBeUndefined();
    } finally {
      const restore = (key: string, value: string | undefined) => {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      };
      restore('ASSET_PUBLISHER_POLL_SECRET', prior.poll);
      restore('ASSET_PUBLISHER_EXECUTOR_SECRET', prior.executor);
      restore('ASSET_PUBLISHER_RENDER_CAPABILITY_SECRET', prior.render);
      restore('ASSET_PUBLISHER_CACHE_TOKEN_SECRET', prior.cache);
    }
  });

  test('a malformed target id is a permanent 400 request error', async () => {
    const priorPoll = process.env.ASSET_PUBLISHER_POLL_SECRET;
    const priorExecutor = process.env.ASSET_PUBLISHER_EXECUTOR_SECRET;
    process.env.ASSET_PUBLISHER_POLL_SECRET = 'poll-secret';
    process.env.ASSET_PUBLISHER_EXECUTOR_SECRET = 'executor-secret';
    try {
      const { t } = await seed();
      const response = await t.fetch('/asset-publishing/executor/revalidate', {
        method: 'POST',
        headers: { Authorization: 'Bearer executor-secret', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schemaVersion: 1,
          targetId: 'not-a-convex-id',
          batchToken: BATCH_ONE,
          claimToken: CLAIM_ONE,
          generation: 1,
          rendererVersion: 'faction-sheet-v1',
        }),
      });
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: 'Invalid publisher target id' });
    } finally {
      if (priorPoll === undefined) delete process.env.ASSET_PUBLISHER_POLL_SECRET;
      else process.env.ASSET_PUBLISHER_POLL_SECRET = priorPoll;
      if (priorExecutor === undefined) delete process.env.ASSET_PUBLISHER_EXECUTOR_SECRET;
      else process.env.ASSET_PUBLISHER_EXECUTOR_SECRET = priorExecutor;
    }
  });
});
