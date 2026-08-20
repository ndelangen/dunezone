import { getAuthUserId } from '@convex-dev/auth/server';

import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';

export const ACCOUNT_STATES = ['active', 'deletion_pending', 'deleted'] as const;

export type AccountState = (typeof ACCOUNT_STATES)[number];

type AnyCtx = QueryCtx | MutationCtx;

export function accountStateOf(row: Pick<Doc<'users'> | Doc<'profiles'>, 'account_state'>): AccountState {
  return row.account_state ?? 'active';
}

export function isActiveProfile(profile: Pick<Doc<'profiles'>, 'account_state'>): boolean {
  return accountStateOf(profile) === 'active';
}

/** Raw identity is reserved for lifecycle diagnostics that pending/deleted sessions must still observe. */
export async function lifecycleUserId(ctx: AnyCtx): Promise<Id<'users'> | null> {
  return await getAuthUserId(ctx);
}

/** Anonymous and inactive sessions both project as public viewers. */
export async function optionalActiveUserId(ctx: AnyCtx): Promise<Id<'users'> | null> {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    return null;
  }
  const user = await ctx.db.get('users', userId);
  return user && accountStateOf(user) === 'active' ? userId : null;
}
