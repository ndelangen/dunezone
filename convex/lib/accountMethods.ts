import type { Infer } from 'convex/values';
import { v } from 'convex/values';

import type { Id } from '../_generated/dataModel';
import type { QueryCtx, MutationCtx } from '../_generated/server';

export const authProviderValidator = v.union(v.literal('google'), v.literal('discord'), v.literal('reddit'));
export type AuthProvider = Infer<typeof authProviderValidator>;
export const authMethodValidator = v.object({
  provider: authProviderValidator,
  connected: v.boolean(),
  available: v.boolean(),
});

export function signInProviders() {
  const configured = {
    google: !!(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET),
    discord: !!(process.env.AUTH_DISCORD_ID && process.env.AUTH_DISCORD_SECRET),
    reddit: !!(process.env.AUTH_REDDIT_ID && process.env.AUTH_REDDIT_SECRET && process.env.AUTH_REDDIT_USER_AGENT),
  } satisfies Record<AuthProvider, boolean>;
  return (Object.keys(configured) as AuthProvider[]).map((provider) => ({
    provider,
    available: configured[provider],
  }));
}

export async function accountMethods(ctx: QueryCtx, userId: Id<'users'>) {
  return await Promise.all(
    signInProviders().map(async (method) => ({
      ...method,
      connected: !!(await ctx.db
        .query('authAccounts')
        .withIndex('userIdAndProvider', (q) => q.eq('userId', userId).eq('provider', method.provider))
        .first()),
    }))
  );
}

export async function requireUnlockedAccount(
  ctx: QueryCtx | MutationCtx,
  userId: Id<'users'>,
  checkReplacement = true
) {
  const user = await ctx.db.get(userId);
  if (!user || user.account_merge_operation_id) {
    throw new Error(
      'This account has a merge in progress. Finish it before changing sign-in methods or deleting the account.'
    );
  }
  if (!checkReplacement) {
    return;
  }
  for (const state of ['pending', 'running', 'failed'] as const) {
    const operation = await ctx.db
      .query('account_deletion_operations')
      .withIndex('by_replacement_state', (q) => q.eq('replacement_user_id', userId).eq('state', state))
      .first();
    if (operation) {
      throw new Error('This account is receiving content from an unfinished account deletion. Finish it first.');
    }
  }
}
