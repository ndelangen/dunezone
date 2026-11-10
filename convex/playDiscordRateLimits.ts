import { v } from 'convex/values';

import { internalQuery } from './_generated/server';
import type { MutationCtx } from './_generated/server';
import { internalMutation } from './functions';
import { DISCORD_ROUTES, discordBucketHoldKey, discordRouteHoldKey } from './lib/discordRest';
import type { DiscordRateLimitObservation, DiscordRoute } from './lib/discordRest';
import { discordEnabled } from './lib/discordStatus';

const scopeArgs = {
  route: v.union(...DISCORD_ROUTES.map((route) => v.literal(route))),
  major: v.string(),
};

function validateMajor(major: string) {
  if (!/^(?:none|(?:guild|channel):\d+)$/.test(major)) {
    throw new Error('Invalid Discord rate-limit resource.');
  }
}

function validateBucket(bucketId: string | undefined) {
  if (bucketId === undefined) {
    return;
  }
  const validLength = bucketId.length > 0 && bucketId.length <= 256;
  const trimmed = bucketId === bucketId.trim();
  if (!validLength || !trimmed) {
    throw new Error('Invalid Discord rate-limit bucket.');
  }
}

function validateLimit(limit: DiscordRateLimitObservation['limit']) {
  if (limit === undefined) {
    return;
  }
  if (!Number.isFinite(limit.until) || limit.until < 0) {
    throw new Error('Invalid Discord rate-limit deadline.');
  }
}

/** Route fallback remains authoritative even when a later response changes its bucket alias. */
export const inspect = internalQuery({
  args: scopeArgs,
  returns: v.union(
    v.null(),
    v.object({ blockedUntil: v.number(), globalUntil: v.number(), bucketId: v.optional(v.string()) })
  ),
  handler: async (ctx, scope) => {
    validateMajor(scope.major);
    if (!(await discordEnabled(ctx))) {
      return null;
    }
    const [global, alias, routeHold] = await Promise.all([
      ctx.db.query('play_discord_cooldown').unique(),
      ctx.db
        .query('play_discord_route_buckets')
        .withIndex('by_route', (q) => q.eq('route', scope.route))
        .unique(),
      ctx.db
        .query('play_discord_rate_limits')
        .withIndex('by_key', (q) => q.eq('key', discordRouteHoldKey(scope)))
        .unique(),
    ]);
    const bucketHold = alias
      ? await ctx.db
          .query('play_discord_rate_limits')
          .withIndex('by_key', (q) => q.eq('key', discordBucketHoldKey(alias.bucket_id, scope.major)))
          .unique()
      : null;
    const globalUntil = global?.blocked_until ?? 0;
    return {
      globalUntil,
      blockedUntil: Math.max(globalUntil, routeHold?.blocked_until ?? 0, bucketHold?.blocked_until ?? 0),
      ...(alias ? { bucketId: alias.bucket_id } : {}),
    };
  },
});

async function hold(ctx: MutationCtx, key: string, until: number) {
  const row = await ctx.db
    .query('play_discord_rate_limits')
    .withIndex('by_key', (q) => q.eq('key', key))
    .unique();
  if (!row) {
    await ctx.db.insert('play_discord_rate_limits', { key, blocked_until: until });
  } else if (row.blocked_until < until) {
    await ctx.db.patch(row._id, { blocked_until: until });
  }
}

async function rememberBucket(ctx: MutationCtx, route: DiscordRoute, bucketId: string | undefined) {
  if (bucketId === undefined) {
    return;
  }
  const alias = await ctx.db
    .query('play_discord_route_buckets')
    .withIndex('by_route', (q) => q.eq('route', route))
    .unique();
  if (alias?.bucket_id === bucketId) {
    return;
  }
  if (!alias) {
    await ctx.db.insert('play_discord_route_buckets', { route, bucket_id: bucketId });
    return;
  }
  await ctx.db.patch(alias._id, { bucket_id: bucketId });
}

async function holdGlobal(ctx: MutationCtx, until: number) {
  const global = await ctx.db.query('play_discord_cooldown').unique();
  if (!global) {
    await ctx.db.insert('play_discord_cooldown', { blocked_until: until });
    return;
  }
  if (global.blocked_until < until) {
    await ctx.db.patch(global._id, { blocked_until: until });
  }
}

async function persistLimit(ctx: MutationCtx, observation: DiscordRateLimitObservation) {
  const { limit, bucketId } = observation;
  if (!limit || limit.until <= Date.now()) {
    return;
  }
  if (limit.global) {
    await holdGlobal(ctx, limit.until);
    return;
  }
  await hold(ctx, discordRouteHoldKey(observation), limit.until);
  if (bucketId) {
    await hold(ctx, discordBucketHoldKey(bucketId, observation.major), limit.until);
  }
}

async function pruneExpiredHolds(ctx: MutationCtx) {
  const expired = await ctx.db
    .query('play_discord_rate_limits')
    .withIndex('by_blocked_until', (q) => q.lte('blocked_until', Date.now()))
    .take(8);
  await Promise.all(expired.map((row) => ctx.db.delete(row._id)));
}

/** Mapping changes and exceptional holds share one mutation; ordinary successful requests never call it. */
export const observe = internalMutation({
  args: {
    ...scopeArgs,
    bucketId: v.optional(v.string()),
    limit: v.optional(v.object({ until: v.number(), global: v.boolean() })),
  },
  returns: v.null(),
  handler: async (ctx, observation) => {
    validateMajor(observation.major);
    validateBucket(observation.bucketId);
    validateLimit(observation.limit);
    /* A pause cannot discard a limit received by an already-running request. */
    if (!observation.limit && !(await discordEnabled(ctx))) {
      return null;
    }
    await rememberBucket(ctx, observation.route, observation.bucketId);
    await persistLimit(ctx, observation);
    await pruneExpiredHolds(ctx);
    return null;
  },
});
