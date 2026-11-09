import { v } from 'convex/values';
import type { Infer } from 'convex/values';

import { internal } from './_generated/api';
import { action, internalQuery } from './_generated/server';
import type { ActionCtx, MutationCtx } from './_generated/server';
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
  /* One connected method with something to offer: the profile took it. The others are listed too, so the page can say they offered nothing. */
  v.object({
    kind: v.literal('applied'),
    applied: appliedValidator,
    options: v.array(optionValidator),
  }),
  /* Several methods with something to offer: the reader picks one. */
  v.object({ kind: v.literal('choose'), options: v.array(optionValidator) }),
  /* No connected method has reported a name or picture yet. */
  v.object({ kind: v.literal('nothing'), options: v.array(optionValidator) })
);

type Applied = Infer<typeof appliedValidator>;
type Linked = { options: LinkedAccountOption[]; steamId: string | null };
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
  returns: v.object({
    options: v.array(optionValidator),
    steamId: v.union(v.string(), v.null()),
  }),
  handler: async (ctx) => {
    const userId = await requireAuthUserId(ctx);
    const steam = await ctx.db
      .query('authAccounts')
      .withIndex('userIdAndProvider', (q) => q.eq('userId', userId).eq('provider', 'steam'))
      .first();
    return {
      options: await linkedAccountOptions(ctx, userId),
      steamId: steam?.providerAccountId ?? null,
    };
  },
});

/**
 * Keeps what a live lookup found for one of the reader's methods.
 * The lookup was for one provider account.
 * When another account of that provider has taken its place meanwhile, nothing is kept.
 */
export const recordLive = internalMutation({
  args: {
    provider: authProviderValidator,
    providerAccountId: v.string(),
    name: v.optional(v.string()),
    image: v.optional(v.string()),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const account = await ctx.db
      .query('authAccounts')
      .withIndex('userIdAndProvider', (q) => q.eq('userId', userId).eq('provider', args.provider))
      .first();
    if (account?.providerAccountId !== args.providerAccountId) {
      return false;
    }
    await recordLinkedAccountProfile(ctx, userId, args.provider, { name: args.name, image: args.image });
    return true;
  },
});

/** Gives the reader's profile what one connected method reports. */
async function applyFor(ctx: MutationCtx, provider: LinkedAccountOption['provider']): Promise<Applied> {
  const userId = await requireAuthUserId(ctx);
  return appliedSummary(provider, await applyLinkedAccountProfile(ctx, userId, provider));
}

export const applyInternal = internalMutation({
  args: { provider: authProviderValidator },
  returns: appliedValidator,
  handler: (ctx, args) => applyFor(ctx, args.provider),
});

/**
 * Pulls the name and picture from the reader's connected sign-in methods.
 * Steam is asked live, since its public profile needs no token from the reader;
 * Google and Discord offer what they reported at the last sign-in with them.
 * One method with something to offer is applied at once;
 * several leave the choice to the reader.
 */
/** Asks Steam for the reader's current name and picture and keeps what it finds, as long as that Steam account is still the connected one. */
async function refreshSteam(ctx: ActionCtx, steamId: string): Promise<void> {
  const live = await steamProfile(steamId);
  if (!live.name && !live.image) {
    return;
  }
  await ctx.runMutation(internal.accountResync.recordLive, {
    provider: 'steam',
    providerAccountId: steamId,
    ...(live.name ? { name: live.name } : {}),
    ...(live.image ? { image: live.image } : {}),
  });
}

/**
 * One method with something to offer is applied at once.
 * Several leave the choice to the reader, and so does one offer beside a method that has never reported.
 * The reader may want that method's name once it has signed in, so nothing is taken for them yet.
 */
async function settle(ctx: ActionCtx, options: LinkedAccountOption[]): Promise<ResyncResult> {
  const offering = options.filter(offersSomething);
  if (offering.length === 0) {
    return { kind: 'nothing', options };
  }
  const unasked = options.some((option) => option.syncedAt === null && !offersSomething(option));
  if (offering.length > 1 || unasked) {
    return { kind: 'choose', options };
  }
  const applied: Applied = await ctx.runMutation(internal.accountResync.applyInternal, {
    provider: offering[0]!.provider,
  });
  return { kind: 'applied', applied, options };
}

/**
 * Pulls the name and picture from the reader's connected sign-in methods.
 * Steam is asked live, since its public profile needs no token from the reader;
 * Google and Discord offer what they reported at the last sign-in with them.
 */
export const resync = action({
  args: {},
  returns: resyncResultValidator,
  /* The calls below name functions of this same file, so their results are typed by hand to break the circle. */
  handler: async (ctx): Promise<ResyncResult> => {
    const linkedNow = (): Promise<Linked> => ctx.runQuery(internal.accountResync.linked, {});
    const recorded = await linkedNow();
    const steam = recorded.steamId !== null && recorded.options.some((option) => option.provider === 'steam');
    if (steam) {
      await refreshSteam(ctx, recorded.steamId!);
    }
    /* Read again after the lookup, so the offer reflects what Steam said and whichever accounts are connected now. */
    const { options } = steam ? await linkedNow() : recorded;
    return await settle(ctx, options);
  },
});

/** Gives the profile what one chosen method reports, after `resync` offered several. */
export const apply = mutation({
  args: { provider: authProviderValidator },
  returns: appliedValidator,
  handler: (ctx, args) => applyFor(ctx, args.provider),
});
