import { MINUTE, RateLimiter } from '@convex-dev/rate-limiter';
import { v } from 'convex/values';

import { STEAM_ASSERTION_MAX_AGE_MS } from '../src/shared/steamOpenId';
import { components, internal } from './_generated/api';
import { internalMutation } from './functions';
import { recordLinkedAccountProfile } from './lib/linkedAccountProfiles';
import { upsertLoginUser } from './lib/loginUser';

/* Real sign-ins are a handful a minute; the budget only stops a flood of forged assertions from tying up actions waiting on Steam. */
const limiter = new RateLimiter(components.rateLimiter, {
  steamCheck: { kind: 'token bucket', rate: 120, period: MINUTE, capacity: 30 },
});

/** Whether another assertion may be checked with Steam now. */
export const admitSteamCheck = internalMutation({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => (await limiter.limit(ctx, 'steamCheck')).ok,
});

/**
 * Signs a Steam login, already confirmed by Steam, into its account.
 * Each assertion is spent once: its nonce is kept until the assertion would be too old anyway, so a copied return address cannot sign in a second time.
 */
export const signInSteamAccount = internalMutation({
  args: {
    steamId: v.string(),
    nonce: v.string(),
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    lookup: v.string(),
  },
  returns: v.union(v.id('users'), v.null()),
  handler: async (ctx, args) => {
    const spent = await ctx.db
      .query('steam_openid_nonces')
      .withIndex('by_nonce', (q) => q.eq('nonce', args.nonce))
      .first();
    if (spent) {
      return null;
    }
    const expiresAt = Date.now() + 2 * STEAM_ASSERTION_MAX_AGE_MS;
    const nonceId = await ctx.db.insert('steam_openid_nonces', { nonce: args.nonce, expires_at: expiresAt });
    await ctx.scheduler.runAt(expiresAt, internal.steamAuth.forgetNonce, { nonceId });

    const account = await ctx.db
      .query('authAccounts')
      .withIndex('providerAndAccountId', (q) => q.eq('provider', 'steam').eq('providerAccountId', args.steamId))
      .unique();
    const lookup = await ctx.db
      .query('steam_profile_lookups')
      .withIndex('by_steam_id', (q) => q.eq('steam_id', args.steamId))
      .unique();
    const outcome = { steam_id: args.steamId, outcome: args.lookup, checked_at: Date.now() };
    await (lookup ? ctx.db.replace(lookup._id, outcome) : ctx.db.insert('steam_profile_lookups', outcome));

    const userData = { ...(args.name ? { name: args.name } : {}), ...(args.image ? { image: args.image } : {}) };
    const userId = await upsertLoginUser(ctx, account?.userId ?? null, userData);
    if (args.name || args.image) {
      /* A lookup that found nothing keeps the last good report, so one failed lookup does not blank the resync option. */
      await recordLinkedAccountProfile(ctx, userId, 'steam', { name: args.name, image: args.image });
    }
    if (!account) {
      await ctx.db.insert('authAccounts', { userId, provider: 'steam', providerAccountId: args.steamId });
    } else if (account.userId !== userId) {
      /* The login belonged to a deleted account, and now signs into the new one. */
      await ctx.db.patch(account._id, { userId });
    }
    return userId;
  },
});

export const forgetNonce = internalMutation({
  args: { nonceId: v.id('steam_openid_nonces') },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (await ctx.db.get(args.nonceId)) {
      await ctx.db.delete(args.nonceId);
    }
    return null;
  },
});
