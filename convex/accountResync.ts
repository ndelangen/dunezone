import { v } from 'convex/values';
import type { Infer } from 'convex/values';

import { internal } from './_generated/api';
import { action, internalQuery } from './_generated/server';
import { internalMutation, mutation } from './functions';
import { authProviderValidator } from './lib/accountMethods';
import {
  applyLinkedAccountProfile,
  linkedAccountOptions,
  offersSomething,
  recordLinkedAccountProfile,
} from './lib/linkedAccountProfiles';
import type { AppliedLinkedAccount, LinkedAccountOption } from './lib/linkedAccountProfiles';
import { requireAuthUserId } from './lib/policy';
import { steamProfile } from './lib/steamSignIn';

const optionValidator = v.object({
  provider: authProviderValidator,
  name: v.union(v.string(), v.null()),
  displayName: v.union(v.string(), v.null()),
  image: v.union(v.string(), v.null()),
  syncedAt: v.union(v.number(), v.null()),
});

/** The profile fields the settings page keeps in its form, so a resync can reset it the way a save does. */
const appliedValidator = v.object({
  provider: authProviderValidator,
  name: v.boolean(),
  avatar: v.boolean(),
  profile: v.object({
    username: v.union(v.string(), v.null()),
    avatar_url: v.union(v.string(), v.null()),
    bgg_profile_url: v.union(v.string(), v.null()),
    default_group_id: v.union(v.id('groups'), v.null()),
    slug: v.string(),
  }),
});

const resyncResultValidator = v.union(
  /* One connected method with something to offer: the profile took it. */
  v.object({ kind: v.literal('applied'), applied: appliedValidator }),
  /* Several methods with something to offer: the reader picks one. */
  v.object({ kind: v.literal('choose'), options: v.array(optionValidator) }),
  /* No connected method has reported a name or picture yet. */
  v.object({ kind: v.literal('nothing'), options: v.array(optionValidator) })
);

type Applied = Infer<typeof appliedValidator>;
type ResyncResult = Infer<typeof resyncResultValidator>;

function appliedSummary(provider: LinkedAccountOption['provider'], applied: AppliedLinkedAccount) {
  const { profile } = applied;
  return {
    provider,
    name: applied.name,
    avatar: applied.avatar,
    profile: {
      username: profile.username,
      avatar_url: profile.avatar_url,
      bgg_profile_url: profile.bgg_profile_url ?? null,
      default_group_id: profile.default_group_id ?? null,
      slug: profile.slug,
    },
  };
}

/** The reader's connected methods and what each last reported, with the Steam id a live lookup needs. */
export const linked = internalQuery({
  args: {},
  returns: v.object({ options: v.array(optionValidator), steamId: v.union(v.string(), v.null()) }),
  handler: async (ctx) => {
    const userId = await requireAuthUserId(ctx);
    const steam = await ctx.db
      .query('authAccounts')
      .withIndex('userIdAndProvider', (q) => q.eq('userId', userId).eq('provider', 'steam'))
      .first();
    return { options: await linkedAccountOptions(ctx, userId), steamId: steam?.providerAccountId ?? null };
  },
});

/** Keeps what a live lookup found for one of the reader's methods. */
export const recordLive = internalMutation({
  args: { provider: authProviderValidator, name: v.optional(v.string()), image: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    await recordLinkedAccountProfile(ctx, userId, args.provider, { name: args.name, image: args.image });
    return null;
  },
});

export const applyInternal = internalMutation({
  args: { provider: authProviderValidator },
  returns: appliedValidator,
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    return appliedSummary(args.provider, await applyLinkedAccountProfile(ctx, userId, args.provider));
  },
});

/**
 * Pulls the name and picture from the reader's connected sign-in methods.
 * Steam is asked live, since its public profile needs no token from the reader;
 * Google and Discord offer what they reported at the last sign-in with them.
 * One method with something to offer is applied at once;
 * several leave the choice to the reader.
 */
export const resync = action({
  args: {},
  returns: resyncResultValidator,
  /* The calls below name functions of this same file, so their results are typed by hand to break the circle. */
  handler: async (ctx): Promise<ResyncResult> => {
    const { options: recorded, steamId }: { options: LinkedAccountOption[]; steamId: string | null } =
      await ctx.runQuery(internal.accountResync.linked, {});
    const steam = recorded.some((option) => option.provider === 'steam') && steamId !== null;
    if (steam) {
      const live = await steamProfile(steamId);
      if (live.name || live.image) {
        await ctx.runMutation(internal.accountResync.recordLive, {
          provider: 'steam',
          ...(live.name ? { name: live.name } : {}),
          ...(live.image ? { image: live.image } : {}),
        });
      }
    }
    const { options }: { options: LinkedAccountOption[] } = steam
      ? await ctx.runQuery(internal.accountResync.linked, {})
      : { options: recorded };
    const offering = options.filter(offersSomething);
    if (offering.length === 0) {
      return { kind: 'nothing', options };
    }
    if (offering.length === 1) {
      const applied: Applied = await ctx.runMutation(internal.accountResync.applyInternal, {
        provider: offering[0]!.provider,
      });
      return { kind: 'applied', applied };
    }
    return { kind: 'choose', options };
  },
});

/** Gives the profile what one chosen method reports, after `resync` offered several. */
export const apply = mutation({
  args: { provider: authProviderValidator },
  returns: appliedValidator,
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    return appliedSummary(args.provider, await applyLinkedAccountProfile(ctx, userId, args.provider));
  },
});
