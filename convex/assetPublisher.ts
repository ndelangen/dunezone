import { v } from 'convex/values';
import SHA256 from 'crypto-js/sha256';

import { FactionInputSchema } from '../src/game/schema/faction';
import type { Doc, Id } from './_generated/dataModel';
import { internalMutation, internalQuery, query } from './_generated/server';
import {
  completionMetadataSchema,
  exactClaimSchema,
  failureSchema,
  publisherTokenSchema,
} from './lib/assetPublisherSchemas';
import type { MutationCtx, QueryCtx } from './types';

export const ASSET_TYPE = 'faction_sheet' as const;
export const BATCH_LEASE_MS = 12 * 60 * 1_000;
export const MIN_UPLOAD_LEASE_MARGIN_MS = 2 * 60 * 1_000;
export const FREE_BROWSER_ALLOWANCE_MS = 10 * 60 * 1_000;
export const BROWSER_RESERVATION_MS = 8 * 60 * 1_000;
export const MAX_BROWSER_SETTLEMENT_MS = 15 * 60 * 1_000;
const MAX_RETRY_DELAY_MS = 6 * 60 * 60 * 1_000;
const BASE_RETRY_DELAY_MS = 60 * 1_000;

const exactClaimArgs = {
  targetId: v.id('asset_targets'),
  batchToken: v.string(),
  claimToken: v.string(),
  generation: v.number(),
  rendererVersion: v.string(),
};

type PublisherReadCtx = Pick<QueryCtx, 'db'>;

async function publisherState(ctx: PublisherReadCtx) {
  return await ctx.db
    .query('asset_publisher_state')
    .withIndex('by_key', (q) => q.eq('key', 'singleton'))
    .unique();
}

async function assetTypeConfig(ctx: PublisherReadCtx) {
  return await ctx.db
    .query('asset_type_configs')
    .withIndex('by_asset_type', (q) => q.eq('asset_type', ASSET_TYPE))
    .unique();
}

async function firstEligibleTarget(ctx: PublisherReadCtx, cutoff: number) {
  const pending = await ctx.db
    .query('asset_targets')
    .withIndex('by_asset_type_and_status_and_next_eligible_at', (q) =>
      q.eq('asset_type', ASSET_TYPE).eq('status', 'pending').lte('next_eligible_at', cutoff)
    )
    .take(1);
  if (pending[0]) return pending[0];

  const cooldown = await ctx.db
    .query('asset_targets')
    .withIndex('by_asset_type_and_status_and_next_eligible_at', (q) =>
      q.eq('asset_type', ASSET_TYPE).eq('status', 'cooldown').lte('next_eligible_at', cutoff)
    )
    .take(1);
  if (cooldown[0]) return cooldown[0];

  const expiredLease = await ctx.db
    .query('asset_targets')
    .withIndex('by_asset_type_and_status_and_lease_expires_at', (q) =>
      q.eq('asset_type', ASSET_TYPE).eq('status', 'leased').lte('lease_expires_at', cutoff)
    )
    .take(1);
  return expiredLease[0] ?? null;
}

async function hasEligibleWorkAt(ctx: PublisherReadCtx, cutoff: number, now: number) {
  const [state, config] = await Promise.all([publisherState(ctx), assetTypeConfig(ctx)]);
  if (state?.status !== 'active' || config?.status !== 'active') return false;
  if (state.cooldown_until > cutoff) return false;
  if (state.browser_reservation_batch_token && state.daily_browser_utc_date === utcDate(now)) {
    return false;
  }
  if (state.batch_token && (state.batch_lease_expires_at ?? 0) > now) return false;
  return (await firstEligibleTarget(ctx, cutoff)) !== null;
}

function utcDate(at: number): string {
  return new Date(at).toISOString().slice(0, 10);
}

function clearBrowserReservation() {
  return {
    browser_reservation_batch_token: undefined,
    browser_reservation_utc_date: undefined,
    browser_reserved_ms: undefined,
  };
}

function claimPayload(faction: Doc<'factions'>) {
  return {
    factionId: faction._id,
    slug: faction.slug,
    faction: FactionInputSchema.parse(faction.data),
  };
}

function clearClaim() {
  return {
    batch_token: undefined,
    claim_token: undefined,
    claimed_generation: undefined,
    claimed_renderer_version: undefined,
    lease_expires_at: undefined,
    claim_payload_hash: undefined,
  };
}

async function claimSnapshot(ctx: PublisherReadCtx, targetId: Id<'asset_targets'>) {
  return await ctx.db
    .query('asset_claim_snapshots')
    .withIndex('by_target_id', (q) => q.eq('target_id', targetId))
    .unique();
}

async function deleteSnapshotIfExact(
  ctx: MutationCtx,
  args: {
    targetId: Id<'asset_targets'>;
    batchToken: string;
    claimToken: string;
    generation: number;
    rendererVersion: string;
  }
) {
  const snapshot = await claimSnapshot(ctx, args.targetId);
  if (
    snapshot?.batch_token === args.batchToken &&
    snapshot.claim_token === args.claimToken &&
    snapshot.generation === args.generation &&
    snapshot.renderer_version === args.rendererVersion
  ) {
    await ctx.db.delete(snapshot._id);
  }
}

function exactOwnership(
  target: Doc<'asset_targets'>,
  args: {
    batchToken: string;
    claimToken: string;
    generation: number;
    rendererVersion: string;
  }
) {
  return (
    target.status === 'leased' &&
    target.batch_token === args.batchToken &&
    target.claim_token === args.claimToken &&
    target.claimed_generation === args.generation &&
    target.claimed_renderer_version === args.rendererVersion
  );
}

function parseExactClaim(args: {
  targetId: Id<'asset_targets'>;
  batchToken: string;
  claimToken: string;
  generation: number;
  rendererVersion: string;
}) {
  const result = exactClaimSchema.safeParse({
    targetId: args.targetId,
    batchToken: args.batchToken,
    claimToken: args.claimToken,
    generation: args.generation,
    rendererVersion: args.rendererVersion,
  });
  if (!result.success) throw new Error('Invalid exact publisher claim');
}

function retryDelayMs(attemptCount: number) {
  return Math.min(MAX_RETRY_DELAY_MS, BASE_RETRY_DELAY_MS * 2 ** Math.max(0, attemptCount - 1));
}

async function releaseBatchIfOwned(ctx: MutationCtx, batchToken: string) {
  const state = await publisherState(ctx);
  if (state?.batch_token === batchToken) {
    await ctx.db.patch(state._id, {
      batch_token: undefined,
      batch_lease_expires_at: undefined,
    });
  }
}

export const hasEligibleWork = internalQuery({
  args: { cutoff: v.number() },
  handler: async (ctx, args) => ({
    eligibility: (await hasEligibleWorkAt(ctx, args.cutoff, Date.now()))
      ? ('eligible' as const)
      : ('empty' as const),
  }),
});

export const normalizeTargetId = internalQuery({
  args: { targetId: v.string() },
  handler: async (ctx, args) => ctx.db.normalizeId('asset_targets', args.targetId),
});

export const acquireBatch = internalMutation({
  args: { batchToken: v.string() },
  handler: async (ctx, args) => {
    if (!publisherTokenSchema.safeParse(args.batchToken).success) {
      throw new Error('Invalid publisher batch token');
    }
    const now = Date.now();
    const [state, config] = await Promise.all([publisherState(ctx), assetTypeConfig(ctx)]);
    if (state?.status !== 'active' || config?.status !== 'active') {
      return { status: 'empty' as const, reason: 'disabled' as const };
    }
    if (
      state.batch_token === args.batchToken &&
      (state.batch_lease_expires_at ?? 0) > now &&
      state.browser_reservation_batch_token === args.batchToken &&
      state.browser_reserved_ms === BROWSER_RESERVATION_MS
    ) {
      return {
        status: 'acquired' as const,
        replay: true,
        batchToken: args.batchToken,
        leaseExpiresAt: state.batch_lease_expires_at ?? now,
        browserReservationMs: BROWSER_RESERVATION_MS,
        dailyBrowserMs: state.daily_browser_ms,
      };
    }
    if (state.batch_token && (state.batch_lease_expires_at ?? 0) > now) {
      return { status: 'busy' as const, leaseExpiresAt: state.batch_lease_expires_at ?? now };
    }
    const today = utcDate(now);
    const priorDay = state.daily_browser_utc_date !== today;
    const dailyBrowserMs = priorDay ? 0 : state.daily_browser_ms;
    const reservationBatchToken = priorDay ? undefined : state.browser_reservation_batch_token;
    if (reservationBatchToken) {
      return { status: 'busy' as const, reason: 'browser_reservation' as const };
    }
    if (state.cooldown_until > now || !(await firstEligibleTarget(ctx, now))) {
      return { status: 'empty' as const, reason: 'no_eligible_work' as const };
    }
    if (dailyBrowserMs + BROWSER_RESERVATION_MS > FREE_BROWSER_ALLOWANCE_MS) {
      if (priorDay) {
        await ctx.db.patch(state._id, {
          daily_browser_utc_date: today,
          daily_browser_ms: 0,
          ...clearBrowserReservation(),
        });
      }
      return { status: 'empty' as const, reason: 'browser_quota' as const };
    }

    const leaseExpiresAt = now + BATCH_LEASE_MS;
    await ctx.db.patch(state._id, {
      batch_token: args.batchToken,
      batch_lease_expires_at: leaseExpiresAt,
      daily_browser_utc_date: today,
      daily_browser_ms: dailyBrowserMs + BROWSER_RESERVATION_MS,
      browser_reservation_batch_token: args.batchToken,
      browser_reservation_utc_date: today,
      browser_reserved_ms: BROWSER_RESERVATION_MS,
      last_browser_settlement_batch_token: undefined,
      last_browser_settlement_ms: undefined,
      last_browser_release_batch_token: undefined,
      last_browser_release_mode: undefined,
    });
    return {
      status: 'acquired' as const,
      replay: false,
      batchToken: args.batchToken,
      leaseExpiresAt,
      browserReservationMs: BROWSER_RESERVATION_MS,
      dailyBrowserMs: dailyBrowserMs + BROWSER_RESERVATION_MS,
    };
  },
});

export const settleBrowserReservation = internalMutation({
  args: { batchToken: v.string(), measuredBrowserMs: v.number() },
  handler: async (ctx, args) => {
    if (
      !publisherTokenSchema.safeParse(args.batchToken).success ||
      !Number.isSafeInteger(args.measuredBrowserMs) ||
      args.measuredBrowserMs < 0 ||
      args.measuredBrowserMs > MAX_BROWSER_SETTLEMENT_MS
    ) {
      throw new Error('Invalid browser reservation settlement');
    }
    const state = await publisherState(ctx);
    if (!state) return { status: 'stale' as const };
    if (state.last_browser_settlement_batch_token === args.batchToken) {
      return {
        status: 'settled' as const,
        replay: true,
        measuredBrowserMs: state.last_browser_settlement_ms ?? args.measuredBrowserMs,
      };
    }
    if (
      state.browser_reservation_batch_token !== args.batchToken ||
      state.browser_reserved_ms !== BROWSER_RESERVATION_MS ||
      state.browser_reservation_utc_date !== state.daily_browser_utc_date
    ) {
      return { status: 'stale' as const };
    }
    const dailyBrowserMs = Math.max(
      0,
      state.daily_browser_ms - BROWSER_RESERVATION_MS + args.measuredBrowserMs
    );
    await ctx.db.patch(state._id, {
      daily_browser_ms: dailyBrowserMs,
      ...clearBrowserReservation(),
      last_browser_settlement_batch_token: args.batchToken,
      last_browser_settlement_ms: args.measuredBrowserMs,
    });
    return {
      status: 'settled' as const,
      replay: false,
      measuredBrowserMs: args.measuredBrowserMs,
      dailyBrowserMs,
      ...(args.measuredBrowserMs > BROWSER_RESERVATION_MS ? { overrun: true as const } : {}),
    };
  },
});

export const releaseBatch = internalMutation({
  args: {
    batchToken: v.string(),
    mode: v.union(v.literal('no_browser'), v.literal('after_settlement')),
  },
  handler: async (ctx, args) => {
    if (!publisherTokenSchema.safeParse(args.batchToken).success) {
      throw new Error('Invalid publisher batch token');
    }
    const state = await publisherState(ctx);
    if (!state) return { status: 'stale' as const };
    const [ownedTarget, ownedSnapshot] = await Promise.all([
      ctx.db
        .query('asset_targets')
        .withIndex('by_batch_token', (q) => q.eq('batch_token', args.batchToken))
        .first(),
      ctx.db
        .query('asset_claim_snapshots')
        .withIndex('by_batch_token', (q) => q.eq('batch_token', args.batchToken))
        .first(),
    ]);
    if (ownedTarget || ownedSnapshot) return { status: 'stale' as const };
    if (state.last_browser_release_batch_token === args.batchToken) {
      return { status: 'released' as const, replay: true };
    }
    if (
      state.batch_token !== args.batchToken ||
      (state.batch_lease_expires_at ?? 0) <= Date.now()
    ) {
      return { status: 'stale' as const };
    }

    let dailyBrowserMs = state.daily_browser_ms;
    let reservationPatch = {};
    if (args.mode === 'no_browser') {
      if (
        state.browser_reservation_batch_token !== args.batchToken ||
        state.browser_reserved_ms !== BROWSER_RESERVATION_MS ||
        state.browser_reservation_utc_date !== state.daily_browser_utc_date
      ) {
        return { status: 'stale' as const };
      }
      dailyBrowserMs = Math.max(0, dailyBrowserMs - BROWSER_RESERVATION_MS);
      reservationPatch = clearBrowserReservation();
    } else if (
      state.browser_reservation_batch_token ||
      state.last_browser_settlement_batch_token !== args.batchToken
    ) {
      return { status: 'stale' as const };
    }

    await ctx.db.patch(state._id, {
      batch_token: undefined,
      batch_lease_expires_at: undefined,
      daily_browser_ms: dailyBrowserMs,
      ...reservationPatch,
      last_browser_release_batch_token: args.batchToken,
      last_browser_release_mode: args.mode,
    });
    return { status: 'released' as const, replay: false, dailyBrowserMs };
  },
});

export const claimOne = internalMutation({
  args: { batchToken: v.string(), claimToken: v.string() },
  handler: async (ctx, args) => {
    if (
      !publisherTokenSchema.safeParse(args.batchToken).success ||
      !publisherTokenSchema.safeParse(args.claimToken).success
    ) {
      throw new Error('Invalid publisher claim token');
    }
    const now = Date.now();
    const [state, config] = await Promise.all([publisherState(ctx), assetTypeConfig(ctx)]);
    if (
      state?.status !== 'active' ||
      config?.status !== 'active' ||
      state.batch_token !== args.batchToken ||
      (state.batch_lease_expires_at ?? 0) <= now
    ) {
      return { status: 'stale' as const };
    }

    const batchTargets = await ctx.db
      .query('asset_targets')
      .withIndex('by_batch_token', (q) => q.eq('batch_token', args.batchToken))
      .take(2);
    if (batchTargets.length > 1) {
      return { status: 'conflict' as const };
    }
    const existingTarget = batchTargets[0];
    if (existingTarget) {
      const snapshot = await claimSnapshot(ctx, existingTarget._id);
      if (
        existingTarget.status !== 'leased' ||
        existingTarget.claim_token === undefined ||
        existingTarget.claimed_generation === undefined ||
        existingTarget.claimed_renderer_version === undefined ||
        existingTarget.lease_expires_at === undefined ||
        existingTarget.claim_payload_hash === undefined ||
        existingTarget.lease_expires_at <= now ||
        !snapshot ||
        snapshot.batch_token !== args.batchToken ||
        snapshot.claim_token !== existingTarget.claim_token ||
        snapshot.generation !== existingTarget.claimed_generation ||
        snapshot.renderer_version !== existingTarget.claimed_renderer_version ||
        snapshot.lease_expires_at !== existingTarget.lease_expires_at ||
        snapshot.payload_hash !== existingTarget.claim_payload_hash
      ) {
        return { status: 'conflict' as const };
      }
      return {
        status: 'claimed' as const,
        replay: true,
        targetId: existingTarget._id,
        factionId: existingTarget.faction_id,
        assetType: existingTarget.asset_type,
        batchToken: args.batchToken,
        claimToken: existingTarget.claim_token,
        generation: existingTarget.claimed_generation,
        rendererVersion: existingTarget.claimed_renderer_version,
        leaseExpiresAt: existingTarget.lease_expires_at,
        payload: snapshot.payload,
        payloadHash: existingTarget.claim_payload_hash,
      };
    }

    const expired = await ctx.db
      .query('asset_targets')
      .withIndex('by_asset_type_and_status_and_lease_expires_at', (q) =>
        q.eq('asset_type', ASSET_TYPE).eq('status', 'leased').lte('lease_expires_at', now)
      )
      .take(1);
    if (expired[0]) {
      const expiredSnapshot = await claimSnapshot(ctx, expired[0]._id);
      if (
        expiredSnapshot &&
        expiredSnapshot.batch_token === expired[0].batch_token &&
        expiredSnapshot.claim_token === expired[0].claim_token
      ) {
        await ctx.db.delete(expiredSnapshot._id);
      }
      await ctx.db.patch(expired[0]._id, {
        ...clearClaim(),
        status: 'pending',
        next_eligible_at: now,
      });
    }

    const target = await firstEligibleTarget(ctx, now);
    if (!target || target.status === 'leased') return { status: 'empty' as const };
    const faction = await ctx.db.get('factions', target.faction_id);
    if (!faction) throw new Error('Publisher target faction is missing');

    const payload = claimPayload(faction);
    const payloadHash = SHA256(JSON.stringify(payload)).toString();
    const leaseExpiresAt = state.batch_lease_expires_at ?? now;
    const orphanedSnapshot = await claimSnapshot(ctx, target._id);
    if (orphanedSnapshot) await ctx.db.delete(orphanedSnapshot._id);
    await ctx.db.insert('asset_claim_snapshots', {
      target_id: target._id,
      faction_id: target.faction_id,
      asset_type: target.asset_type,
      batch_token: args.batchToken,
      claim_token: args.claimToken,
      generation: target.desired_generation,
      renderer_version: target.desired_renderer_version,
      lease_expires_at: leaseExpiresAt,
      payload_hash: payloadHash,
      payload,
    });
    await ctx.db.patch(target._id, {
      status: 'leased',
      next_eligible_at: leaseExpiresAt,
      attempt_count: target.attempt_count + 1,
      last_error: undefined,
      batch_token: args.batchToken,
      claim_token: args.claimToken,
      claimed_generation: target.desired_generation,
      claimed_renderer_version: target.desired_renderer_version,
      lease_expires_at: leaseExpiresAt,
      claim_payload_hash: payloadHash,
    });

    return {
      status: 'claimed' as const,
      replay: false,
      targetId: target._id,
      factionId: target.faction_id,
      assetType: target.asset_type,
      batchToken: args.batchToken,
      claimToken: args.claimToken,
      generation: target.desired_generation,
      rendererVersion: target.desired_renderer_version,
      leaseExpiresAt,
      payload,
      payloadHash,
    };
  },
});

export const revalidateClaim = internalQuery({
  args: exactClaimArgs,
  handler: async (ctx, args) => {
    parseExactClaim(args);
    const now = Date.now();
    const target = await ctx.db.get('asset_targets', args.targetId);
    const state = await publisherState(ctx);
    if (
      !target ||
      !state ||
      !exactOwnership(target, args) ||
      state.batch_token !== args.batchToken
    ) {
      return { status: 'stale' as const };
    }
    if (
      target.desired_generation !== args.generation ||
      target.desired_renderer_version !== args.rendererVersion
    ) {
      return { status: 'stale' as const };
    }
    const leaseExpiresAt = Math.min(
      target.lease_expires_at ?? 0,
      state.batch_lease_expires_at ?? 0
    );
    if (leaseExpiresAt - now < MIN_UPLOAD_LEASE_MARGIN_MS) {
      return { status: 'insufficient_lease' as const, leaseExpiresAt };
    }
    return {
      status: 'valid' as const,
      leaseExpiresAt,
      factionId: target.faction_id,
      assetType: target.asset_type,
      payloadHash: target.claim_payload_hash,
    };
  },
});

export const completeClaim = internalMutation({
  args: {
    ...exactClaimArgs,
    r2Etag: v.string(),
    bytes: v.number(),
    cacheToken: v.string(),
  },
  handler: async (ctx, args) => {
    parseExactClaim(args);
    if (
      !completionMetadataSchema.safeParse({
        r2Etag: args.r2Etag,
        bytes: args.bytes,
        cacheToken: args.cacheToken,
      }).success
    ) {
      throw new Error('Invalid publication metadata');
    }
    const target = await ctx.db.get('asset_targets', args.targetId);
    if (!target) return { status: 'stale' as const };
    if (
      target.last_completed_batch_token === args.batchToken &&
      target.last_completed_claim_token === args.claimToken &&
      target.published_generation === args.generation &&
      target.published_renderer_version === args.rendererVersion
    ) {
      return {
        status: 'completed' as const,
        replay: true,
        cacheToken: target.published_cache_token,
        publishedAt: target.published_at,
      };
    }
    const state = await publisherState(ctx);
    const now = Date.now();
    if (
      !exactOwnership(target, args) ||
      state?.batch_token !== args.batchToken ||
      (state.batch_lease_expires_at ?? 0) <= now ||
      (target.lease_expires_at ?? 0) <= now
    ) {
      return { status: 'stale' as const };
    }
    if (
      target.desired_generation !== args.generation ||
      target.desired_renderer_version !== args.rendererVersion
    ) {
      await deleteSnapshotIfExact(ctx, args);
      await ctx.db.patch(target._id, {
        ...clearClaim(),
        status: 'pending',
        next_eligible_at: now,
      });
      await releaseBatchIfOwned(ctx, args.batchToken);
      return { status: 'stale' as const };
    }

    const publishedAt = now;
    await deleteSnapshotIfExact(ctx, args);
    await ctx.db.patch(target._id, {
      ...clearClaim(),
      status: 'current',
      next_eligible_at: publishedAt,
      published_generation: args.generation,
      published_renderer_version: args.rendererVersion,
      published_cache_token: args.cacheToken,
      published_r2_etag: args.r2Etag,
      published_bytes: args.bytes,
      published_at: publishedAt,
      last_completed_batch_token: args.batchToken,
      last_completed_claim_token: args.claimToken,
    });
    await releaseBatchIfOwned(ctx, args.batchToken);
    return {
      status: 'completed' as const,
      replay: false,
      cacheToken: args.cacheToken,
      publishedAt,
    };
  },
});

export const failClaim = internalMutation({
  args: { ...exactClaimArgs, error: v.string() },
  handler: async (ctx, args) => {
    parseExactClaim(args);
    const failure = failureSchema.safeParse({ error: args.error });
    if (!failure.success) throw new Error('Invalid publisher failure');
    const target = await ctx.db.get('asset_targets', args.targetId);
    const state = await publisherState(ctx);
    const now = Date.now();
    if (
      !target ||
      !exactOwnership(target, args) ||
      state?.batch_token !== args.batchToken ||
      (state.batch_lease_expires_at ?? 0) <= now ||
      (target.lease_expires_at ?? 0) <= now
    ) {
      return { status: 'stale' as const };
    }
    if (
      target.desired_generation !== args.generation ||
      target.desired_renderer_version !== args.rendererVersion
    ) {
      await deleteSnapshotIfExact(ctx, args);
      await ctx.db.patch(target._id, {
        ...clearClaim(),
        status: 'pending',
        next_eligible_at: now,
      });
      await releaseBatchIfOwned(ctx, args.batchToken);
      return { status: 'stale' as const };
    }

    const nextEligibleAt = now + retryDelayMs(target.attempt_count);
    await deleteSnapshotIfExact(ctx, args);
    await ctx.db.patch(target._id, {
      ...clearClaim(),
      status: 'cooldown',
      next_eligible_at: nextEligibleAt,
      last_error: failure.data.error,
    });
    await releaseBatchIfOwned(ctx, args.batchToken);
    return { status: 'failed' as const, nextEligibleAt };
  },
});

export const releaseClaim = internalMutation({
  args: exactClaimArgs,
  handler: async (ctx, args) => {
    parseExactClaim(args);
    const target = await ctx.db.get('asset_targets', args.targetId);
    const state = await publisherState(ctx);
    const now = Date.now();
    if (
      !target ||
      !exactOwnership(target, args) ||
      state?.batch_token !== args.batchToken ||
      (state.batch_lease_expires_at ?? 0) <= now ||
      (target.lease_expires_at ?? 0) <= now
    ) {
      return { status: 'stale' as const };
    }
    await deleteSnapshotIfExact(ctx, args);
    await ctx.db.patch(target._id, {
      ...clearClaim(),
      status: 'pending',
      next_eligible_at: now,
    });
    await releaseBatchIfOwned(ctx, args.batchToken);
    return { status: 'released' as const };
  },
});

export const readRenderSnapshot = internalQuery({
  args: {
    factionId: v.id('factions'),
    assetType: v.literal('faction_sheet'),
    payloadHash: v.string(),
    batchToken: v.string(),
    claimToken: v.string(),
    generation: v.number(),
    rendererVersion: v.string(),
  },
  handler: async (ctx, args) => {
    const target = await ctx.db
      .query('asset_targets')
      .withIndex('by_faction_id_and_asset_type', (q) =>
        q.eq('faction_id', args.factionId).eq('asset_type', args.assetType)
      )
      .unique();
    const state = await publisherState(ctx);
    const snapshot = target ? await claimSnapshot(ctx, target._id) : null;
    if (
      !target ||
      !snapshot ||
      !exactOwnership(target, args) ||
      state?.batch_token !== args.batchToken ||
      target.claim_payload_hash !== args.payloadHash ||
      snapshot.faction_id !== args.factionId ||
      snapshot.asset_type !== args.assetType ||
      snapshot.batch_token !== args.batchToken ||
      snapshot.claim_token !== args.claimToken ||
      snapshot.generation !== args.generation ||
      snapshot.renderer_version !== args.rendererVersion ||
      snapshot.payload_hash !== args.payloadHash ||
      (state.batch_lease_expires_at ?? 0) <= Date.now() ||
      (target.lease_expires_at ?? 0) <= Date.now() ||
      snapshot.lease_expires_at <= Date.now()
    ) {
      return null;
    }
    return { payload: snapshot.payload, payloadHash: snapshot.payload_hash };
  },
});

export const readClaimIdentity = internalQuery({
  args: exactClaimArgs,
  handler: async (ctx, args) => {
    parseExactClaim(args);
    const target = await ctx.db.get('asset_targets', args.targetId);
    if (!target) return null;
    const isExactReplay =
      target.last_completed_batch_token === args.batchToken &&
      target.last_completed_claim_token === args.claimToken &&
      target.published_generation === args.generation &&
      target.published_renderer_version === args.rendererVersion;
    if (!exactOwnership(target, args) && !isExactReplay) return null;
    return { factionId: target.faction_id, assetType: target.asset_type };
  },
});

export const getPublicMetadata = query({
  args: { factionId: v.id('factions'), assetType: v.literal('faction_sheet') },
  handler: async (ctx, args) => {
    const target = await ctx.db
      .query('asset_targets')
      .withIndex('by_faction_id_and_asset_type', (q) =>
        q.eq('faction_id', args.factionId).eq('asset_type', args.assetType)
      )
      .unique();
    if (!target) return null;

    const stablePath = `/published/factions/${encodeURIComponent(target.faction_id)}/sheet.pdf`;
    const publication =
      target.published_generation === undefined ||
      target.published_renderer_version === undefined ||
      target.published_cache_token === undefined ||
      target.published_r2_etag === undefined ||
      target.published_bytes === undefined ||
      target.published_at === undefined
        ? null
        : {
            generation: target.published_generation,
            rendererVersion: target.published_renderer_version,
            cacheToken: target.published_cache_token,
            r2Etag: target.published_r2_etag,
            bytes: target.published_bytes,
            publishedAt: target.published_at,
            stablePath,
            href: `${stablePath}?v=${encodeURIComponent(target.published_cache_token)}`,
          };
    return {
      factionId: target.faction_id,
      assetType: target.asset_type,
      status:
        target.status === 'current' &&
        target.desired_generation === target.published_generation &&
        target.desired_renderer_version === target.published_renderer_version
          ? ('current' as const)
          : ('pending' as const),
      publication,
    };
  },
});
