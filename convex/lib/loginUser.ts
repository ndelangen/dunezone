import type { Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { accountStateOf } from './accountLifecycle';
import { ensureProfileForUser, profileSourcesFromUserDoc } from './profileBootstrap';

/**
 * Finds or starts the account a provider login signs into, and refreshes its provider details.
 * A login that belongs to a deleted account starts a new account;
 * the caller moves the login onto it.
 * Nothing links by email or phone, since no provider here returns a verified one.
 * `ctx` must already write through the application triggers.
 */
export async function upsertLoginUser(
  ctx: MutationCtx,
  existingUserId: Id<'users'> | null,
  userData: Record<string, unknown>
): Promise<Id<'users'>> {
  const existing = existingUserId ? await ctx.db.get(existingUserId) : null;
  let userId: Id<'users'>;
  if (existing && accountStateOf(existing) !== 'deleted') {
    userId = existing._id;
    await ctx.db.patch(userId, userData);
  } else {
    userId = await ctx.db.insert('users', userData);
  }
  const user = (await ctx.db.get(userId))!;
  await ensureProfileForUser(ctx, userId, profileSourcesFromUserDoc(user));
  return userId;
}
