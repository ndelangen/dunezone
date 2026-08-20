import type { MutationCtx, QueryCtx } from '../_generated/server';
import { optionalActiveUserId } from './accountLifecycle';

type AnyCtx = QueryCtx | MutationCtx;

export async function requireAuthUserId(ctx: AnyCtx) {
  const userId = await optionalActiveUserId(ctx);
  if (!userId) {
    throw new Error('Not authenticated');
  }
  return userId;
}

export async function requireAdminUserId(ctx: AnyCtx) {
  const userId = await requireAuthUserId(ctx);
  const user = await ctx.db.get('users', userId);
  if (!user?.isAdmin) {
    throw new Error('Not authorized');
  }
  return userId;
}
