import { v } from 'convex/values';
import SHA256 from 'crypto-js/sha256';

import { FactionInputSchema } from '../src/game/schema/faction';
import type { Doc, Id } from './_generated/dataModel';
import { internalMutation, internalQuery } from './_generated/server';
import {
  completeRolloutItem,
  failRolloutItem,
  firstEligibleRolloutTarget,
  markRolloutClaimed,
  recoverExpiredRolloutClaim,
} from './assetRollouts';
import {
  FACTION_SHEET_ASSET_TYPE,
  ITEM_CLAIM_LEASE_MS,
  MAX_CONSECUTIVE_RENDER_FAILURES,
  MAX_PUBLISHER_ITEMS,
} from './lib/assetPublisherConstants';
import {
  completionMetadataSchema,
  exactItemClaimSchema,
  itemFailureSchema,
  publisherTokenSchema,
  takeWorkArgsSchema,
} from './lib/assetPublisherSchemas';
import type { MutationCtx, QueryCtx } from './types';

export const ASSET_TYPE = FACTION_SHEET_ASSET_TYPE;
export { ITEM_CLAIM_LEASE_MS, MAX_CONSECUTIVE_RENDER_FAILURES, MAX_PUBLISHER_ITEMS };

const exactItemArgs = {
  targetId: v.id('asset_targets'),
  claimToken: v.string(),
  generation: v.number(),
  rendererVersion: v.string(),
};

type PublisherReadCtx = Pick<QueryCtx, 'db'>;

async function assetTypeConfig(ctx: PublisherReadCtx) {
  const configs = await ctx.db
    .query('asset_type_configs')
    .withIndex('by_asset_type', (q) => q.eq('asset_type', ASSET_TYPE))
    .take(2);
  if (configs.length > 1) {
    throw new Error('Asset publisher invariant violated: duplicate faction-sheet configs');
  }
  return configs[0] ?? null;
}

function claimPayload(faction: Doc<'factions'>) {
  return {
    factionId: faction._id,
    slug: faction.slug,
    faction: FactionInputSchema.parse(faction.data),
  };
}

function clearItemClaim() {
  return {
    claim_token: undefined,
    claimed_generation: undefined,
    claimed_renderer_version: undefined,
    lease_expires_at: undefined,
  };
}

function exactOwnership(
  target: Doc<'asset_targets'>,
  args: {
    claimToken: string;
    generation: number;
    rendererVersion: string;
  }
) {
  return (
    target.status === 'leased' &&
    target.claim_token === args.claimToken &&
    target.claimed_generation === args.generation &&
    target.claimed_renderer_version === args.rendererVersion
  );
}

function parseExactItem(args: {
  targetId: Id<'asset_targets'>;
  claimToken: string;
  generation: number;
  rendererVersion: string;
}) {
  if (
    !exactItemClaimSchema.safeParse({
      targetId: args.targetId,
      claimToken: args.claimToken,
      generation: args.generation,
      rendererVersion: args.rendererVersion,
    }).success
  ) {
    throw new Error('Invalid exact publisher item claim');
  }
}

function earlierTarget(left: Doc<'asset_targets'>, right: Doc<'asset_targets'>) {
  if (left._creationTime !== right._creationTime) return left._creationTime - right._creationTime;
  return left._id < right._id ? -1 : left._id > right._id ? 1 : 0;
}

async function eligibleForegroundTargets(ctx: PublisherReadCtx) {
  const laneRows = await Promise.all(
    ([undefined, 'foreground'] as const).map(
      async (workLane) =>
        await ctx.db
          .query('asset_targets')
          .withIndex('by_asset_type_and_work_lane_and_status', (q) =>
            q.eq('asset_type', ASSET_TYPE).eq('work_lane', workLane).eq('status', 'pending')
          )
          .take(MAX_PUBLISHER_ITEMS)
    )
  );
  return laneRows.flat().sort(earlierTarget).slice(0, MAX_PUBLISHER_ITEMS);
}

async function expiredClaims(ctx: PublisherReadCtx, now: number) {
  return await ctx.db
    .query('asset_targets')
    .withIndex('by_asset_type_and_status_and_lease_expires_at', (q) =>
      q.eq('asset_type', ASSET_TYPE).eq('status', 'leased').lte('lease_expires_at', now)
    )
    .take(MAX_PUBLISHER_ITEMS + 1);
}

async function recoverExpiredClaims(ctx: MutationCtx, now: number) {
  const expired = await expiredClaims(ctx, now);
  if (expired.length > MAX_PUBLISHER_ITEMS) {
    throw new Error('Asset publisher invariant violated: too many expired item claims');
  }
  for (const target of expired) {
    const detached = await recoverExpiredRolloutClaim(ctx, target, now);
    if (!detached) {
      await ctx.db.patch(target._id, {
        ...clearItemClaim(),
        status: 'pending',
      });
    }
  }
}

async function firstLeasedTarget(ctx: PublisherReadCtx) {
  return await ctx.db
    .query('asset_targets')
    .withIndex('by_asset_type_and_status_and_lease_expires_at', (q) =>
      q.eq('asset_type', ASSET_TYPE).eq('status', 'leased')
    )
    .first();
}

async function assignClaim(
  ctx: MutationCtx,
  target: Doc<'asset_targets'>,
  claimToken: string,
  leaseExpiresAt: number,
  now: number
) {
  await markRolloutClaimed(ctx, target, now);
  await ctx.db.patch(target._id, {
    status: 'leased',
    claim_token: claimToken,
    claimed_generation: target.desired_generation,
    claimed_renderer_version: target.desired_renderer_version,
    lease_expires_at: leaseExpiresAt,
  });
  return {
    targetId: target._id,
    factionId: target.faction_id,
    assetType: target.asset_type,
    claimToken,
    generation: target.desired_generation,
    rendererVersion: target.desired_renderer_version,
    leaseExpiresAt,
    workLane: target.work_lane === 'rollout' ? ('rollout' as const) : ('foreground' as const),
  };
}

/** Atomically assigns a fixed list of at most twenty independent item claims. */
export const takeWork = internalMutation({
  args: { claimTokens: v.array(v.string()) },
  handler: async (ctx, args) => {
    if (!takeWorkArgsSchema.safeParse(args).success) {
      throw new Error('Invalid publisher work request');
    }
    const config = await assetTypeConfig(ctx);
    if (config?.status !== 'active') {
      return { status: 'empty' as const, reason: 'disabled' as const, items: [] };
    }

    const now = Date.now();
    await recoverExpiredClaims(ctx, now);
    const liveClaim = await firstLeasedTarget(ctx);
    if (liveClaim) {
      return {
        status: 'empty' as const,
        reason: 'busy' as const,
        leaseExpiresAt: liveClaim.lease_expires_at ?? null,
        items: [],
      };
    }

    const leaseExpiresAt = now + ITEM_CLAIM_LEASE_MS;
    const items = [];
    const foreground = await eligibleForegroundTargets(ctx);
    for (const target of foreground) {
      if (items.length >= args.claimTokens.length) break;
      items.push(
        await assignClaim(ctx, target, args.claimTokens[items.length], leaseExpiresAt, now)
      );
    }
    while (items.length < args.claimTokens.length) {
      const target = await firstEligibleRolloutTarget(ctx, now);
      if (!target || target.status === 'leased') break;
      items.push(
        await assignClaim(ctx, target, args.claimTokens[items.length], leaseExpiresAt, now)
      );
    }
    return items.length === 0
      ? { status: 'empty' as const, reason: 'no_eligible_work' as const, items }
      : { status: 'assigned' as const, leaseExpiresAt, items };
  },
});

export const normalizeTargetId = internalQuery({
  args: { targetId: v.string() },
  handler: async (ctx, args) => ctx.db.normalizeId('asset_targets', args.targetId),
});

export const readItemForRender = internalQuery({
  args: { claimToken: v.string() },
  handler: async (ctx, args) => {
    if (!publisherTokenSchema.safeParse(args.claimToken).success) return null;
    const targets = await ctx.db
      .query('asset_targets')
      .withIndex('by_claim_token', (q) => q.eq('claim_token', args.claimToken))
      .take(2);
    if (targets.length !== 1) return null;
    const target = targets[0];
    const now = Date.now();
    if (
      target?.status !== 'leased' ||
      target.claimed_generation === undefined ||
      target.claimed_renderer_version === undefined ||
      target.desired_generation !== target.claimed_generation ||
      target.desired_renderer_version !== target.claimed_renderer_version ||
      (target.lease_expires_at ?? 0) <= now
    ) {
      return null;
    }
    const faction = await ctx.db.get('factions', target.faction_id);
    if (!faction || faction.is_deleted) return null;
    const payload = claimPayload(faction);
    return {
      payload,
      payloadHash: SHA256(JSON.stringify(payload)).toString(),
    };
  },
});

export const revalidateItem = internalQuery({
  args: exactItemArgs,
  handler: async (ctx, args) => {
    parseExactItem(args);
    const target = await ctx.db.get('asset_targets', args.targetId);
    const now = Date.now();
    if (
      !target ||
      !exactOwnership(target, args) ||
      target.desired_generation !== args.generation ||
      target.desired_renderer_version !== args.rendererVersion ||
      (target.lease_expires_at ?? 0) <= now
    ) {
      return { status: 'stale' as const };
    }
    return {
      status: 'valid' as const,
      factionId: target.faction_id,
      assetType: target.asset_type,
      leaseExpiresAt: target.lease_expires_at,
    };
  },
});

export const completeItem = internalMutation({
  args: {
    ...exactItemArgs,
    r2Etag: v.string(),
    bytes: v.number(),
    cacheToken: v.string(),
  },
  handler: async (ctx, args) => {
    parseExactItem(args);
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
      target.last_completed_claim_token === args.claimToken &&
      target.published_generation === args.generation &&
      target.published_renderer_version === args.rendererVersion &&
      target.desired_generation === args.generation &&
      target.desired_renderer_version === args.rendererVersion
    ) {
      return {
        status: 'completed' as const,
        replay: true,
        cacheToken: target.published_cache_token,
        publishedAt: target.published_at,
      };
    }
    const now = Date.now();
    if (
      !exactOwnership(target, args) ||
      target.desired_generation !== args.generation ||
      target.desired_renderer_version !== args.rendererVersion ||
      (target.lease_expires_at ?? 0) <= now
    ) {
      return { status: 'stale' as const };
    }

    await completeRolloutItem(ctx, target, now);
    await ctx.db.patch(target._id, {
      ...clearItemClaim(),
      status: 'current',
      consecutive_render_failures: 0,
      last_error: undefined,
      published_generation: args.generation,
      published_renderer_version: args.rendererVersion,
      published_cache_token: args.cacheToken,
      published_r2_etag: args.r2Etag,
      published_bytes: args.bytes,
      published_at: now,
      last_completed_claim_token: args.claimToken,
      work_lane: 'foreground',
      rollout_id: undefined,
      rollout_item_id: undefined,
    });
    return {
      status: 'completed' as const,
      replay: false,
      cacheToken: args.cacheToken,
      publishedAt: now,
    };
  },
});

export const failItem = internalMutation({
  args: {
    ...exactItemArgs,
    attribution: v.union(v.literal('target'), v.literal('infrastructure')),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    parseExactItem(args);
    const failure = itemFailureSchema.safeParse({
      attribution: args.attribution,
      error: args.error,
    });
    if (!failure.success) throw new Error('Invalid publisher item failure');
    const target = await ctx.db.get('asset_targets', args.targetId);
    const now = Date.now();
    if (
      !target ||
      !exactOwnership(target, args) ||
      target.desired_generation !== args.generation ||
      target.desired_renderer_version !== args.rendererVersion ||
      (target.lease_expires_at ?? 0) <= now
    ) {
      return { status: 'stale' as const };
    }
    if (failure.data.attribution === 'infrastructure') {
      return {
        status: 'retained' as const,
        leaseExpiresAt: target.lease_expires_at,
      };
    }

    const consecutiveFailures = target.consecutive_render_failures + 1;
    const blocked = consecutiveFailures >= MAX_CONSECUTIVE_RENDER_FAILURES;
    const rolloutOutcome = await failRolloutItem(
      ctx,
      target,
      failure.data.error,
      now,
      now,
      blocked
    );
    if (rolloutOutcome === 'detached') {
      await ctx.db.patch(target._id, {
        ...clearItemClaim(),
        consecutive_render_failures: consecutiveFailures,
        last_error: failure.data.error,
      });
    } else {
      await ctx.db.patch(target._id, {
        ...clearItemClaim(),
        status: blocked ? 'blocked' : 'pending',
        consecutive_render_failures: consecutiveFailures,
        last_error: failure.data.error,
      });
    }
    return {
      status: blocked ? ('blocked' as const) : ('failed' as const),
      consecutiveFailures,
    };
  },
});
