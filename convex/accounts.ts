import { getAuthSessionId } from '@convex-dev/auth/server';
import { paginationOptsValidator, paginationResultValidator } from 'convex/server';
import { v } from 'convex/values';

import { internal } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import { internalAction, query } from './_generated/server';
import type { QueryCtx } from './_generated/server';
import { internalMutation, mutation } from './functions';
import { optionalActiveUserId, accountStateOf } from './lib/accountLifecycle';
import { advanceAccountMerge, profileForAccount, startAccountMerge } from './lib/accountMerge';
import {
  accountMethods,
  authMethodValidator,
  authProviderValidator,
  requireUnlockedAccount,
  signInProviders,
} from './lib/accountMethods';
import { docValidator } from './lib/collaborativeAccessValidators';
import { playCredential, playCredentialDigest } from './lib/playAuthorization';
import { requireAdminUserId, requireAuthUserId } from './lib/policy';

export const providers = query({
  args: {},
  returns: v.array(v.object({ provider: authProviderValidator, available: v.boolean() })),
  handler: async () => signInProviders(),
});

const profileSummary = v.object({
  userId: v.id('users'),
  name: v.string(),
  slug: v.string(),
  methods: v.array(authMethodValidator),
});
const operationValidator = docValidator('account_merge_operations');

export const adminPage = query({
  args: { paginationOpts: paginationOptsValidator, selectedUserIds: v.array(v.id('users')) },
  returns: v.object({
    profiles: paginationResultValidator(profileSummary),
    selected: v.array(profileSummary),
    operations: v.array(operationValidator),
  }),
  handler: async (ctx, args) => {
    await requireAdminUserId(ctx);
    if (args.selectedUserIds.length > 2) {
      throw new Error('Select at most two profiles.');
    }
    const selected = await Promise.all(args.selectedUserIds.map((userId) => profileForAccount(ctx, userId)));
    const page = await ctx.db
      .query('profiles')
      .withIndex('by_account_state_username', (q) => q.eq('account_state', 'active'))
      .paginate(args.paginationOpts);
    return {
      selected: await Promise.all(
        selected
          .filter((profile) => profile?.account_state === 'active')
          .map(async (profile) => ({
            userId: profile!.user_id,
            name: profile!.username ?? profile!.slug,
            slug: profile!.slug,
            methods: await accountMethods(ctx, profile!.user_id),
          }))
      ),
      profiles: {
        ...page,
        page: await Promise.all(
          page.page.map(async (profile) => ({
            userId: profile.user_id,
            name: profile.username ?? profile.slug,
            slug: profile.slug,
            methods: await accountMethods(ctx, profile.user_id),
          }))
        ),
      },
      operations: await ctx.db.query('account_merge_operations').order('desc').take(20),
    };
  },
});

export const merge = mutation({
  args: { sourceUserId: v.id('users'), targetUserId: v.id('users') },
  returns: v.id('account_merge_operations'),
  handler: async (ctx, args) =>
    await startAccountMerge(ctx, args.sourceUserId, args.targetUserId, await requireAdminUserId(ctx)),
});

export const resumeMerge = mutation({
  args: { operationId: v.id('account_merge_operations') },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdminUserId(ctx);
    const operation = await ctx.db.get(args.operationId);
    if (operation?.state === 'failed') {
      await ctx.db.patch(operation._id, { state: 'running', error: null });
      await ctx.scheduler.runAfter(0, internal.accounts.advance, args);
    }
    return null;
  },
});

export const advance = internalAction({
  args: { operationId: v.id('account_merge_operations') },
  returns: v.null(),
  handler: async (ctx, args) => {
    try {
      await ctx.runMutation(internal.accounts.advanceBatch, args);
    } catch (error) {
      await ctx.runMutation(internal.accounts.failMerge, {
        ...args,
        error: error instanceof Error ? error.message : 'The merge could not finish.',
      });
    }
    return null;
  },
});

export const advanceBatch = internalMutation({
  args: { operationId: v.id('account_merge_operations') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const operation = await ctx.db.get(args.operationId);
    if (operation?.state === 'running') {
      await advanceAccountMerge(ctx, operation);
    }
    return null;
  },
});

export const failMerge = internalMutation({
  args: { operationId: v.id('account_merge_operations'), error: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const operation = await ctx.db.get(args.operationId);
    if (operation?.state === 'running') {
      await ctx.db.patch(operation._id, { state: 'failed', error: args.error });
    }
    return null;
  },
});

export const beginConnection = mutation({
  args: { provider: authProviderValidator },
  returns: v.object({ token: v.string(), slug: v.string() }),
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    await requireUnlockedAccount(ctx, userId);
    const sessionId = await getAuthSessionId(ctx);
    const session = sessionId ? await ctx.db.get(sessionId) : null;
    const profile = await profileForAccount(ctx, userId);
    if (!sessionId || session?.userId !== userId || session.expirationTime <= Date.now() || !profile) {
      throw new Error('Sign in again before connecting an account.');
    }
    const method = (await accountMethods(ctx, userId)).find((method) => method.provider === args.provider)!;
    if (!method.available) {
      throw new Error('This sign-in method is not available.');
    }
    if (method.connected) {
      throw new Error('This sign-in method is already connected.');
    }
    const token = playCredential();
    const expiresAt = Math.min(Date.now() + 10 * 60_000, session.expirationTime);
    const connectionId = await ctx.db.insert('account_connections', {
      digest: await playCredentialDigest(token),
      user_id: userId,
      session_id: sessionId,
      provider: args.provider,
      state: 'pending',
      expires_at: expiresAt,
    });
    await ctx.scheduler.runAt(expiresAt, internal.accounts.expireConnection, { connectionId });
    return { token, slug: profile.slug };
  },
});

export const expireConnection = internalMutation({
  args: { connectionId: v.id('account_connections') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const intent = await ctx.db.get(args.connectionId);
    if (intent?.state === 'pending') {
      await ctx.db.patch(intent._id, { state: 'expired' });
    }
    return null;
  },
});

async function connectionIntent(ctx: QueryCtx, token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) {
    return null;
  }
  const digest = await playCredentialDigest(token);
  return await ctx.db
    .query('account_connections')
    .withIndex('by_digest', (q) => q.eq('digest', digest))
    .unique();
}

async function verifiedConnection(ctx: QueryCtx, intent: Doc<'account_connections'>) {
  const userId = await optionalActiveUserId(ctx);
  const sessionId = await getAuthSessionId(ctx);
  const session = sessionId ? await ctx.db.get(sessionId) : null;
  const originalUser = await ctx.db.get(intent.user_id);
  if (
    intent.state !== 'pending' ||
    !userId ||
    !session ||
    session.userId !== userId ||
    session._creationTime < intent._creationTime ||
    session._id === intent.session_id ||
    !originalUser ||
    accountStateOf(originalUser) !== 'active'
  ) {
    return null;
  }
  const method = (await accountMethods(ctx, userId)).find((method) => method.provider === intent.provider);
  return method?.connected ? userId : null;
}

export const connection = query({
  args: { token: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      state: v.union(v.literal('review'), v.literal('running'), v.literal('failed'), v.literal('completed')),
      provider: authProviderValidator,
      targetSlug: v.string(),
      targetName: v.string(),
      sourceName: v.string(),
      sameAccount: v.boolean(),
      error: v.union(v.string(), v.null()),
    })
  ),
  handler: async (ctx, args) => {
    const intent = await connectionIntent(ctx, args.token);
    if (!intent || intent.state === 'expired') {
      return null;
    }
    if (intent.state === 'accepted' && intent.operation_id) {
      const operation = await ctx.db.get(intent.operation_id);
      return operation
        ? {
            state: operation.state,
            provider: intent.provider,
            targetSlug: operation.target_slug,
            targetName: operation.target_name,
            sourceName: operation.source_name,
            sameAccount: false,
            error: operation.error,
          }
        : null;
    }
    const sourceId = await verifiedConnection(ctx, intent);
    if (!sourceId) {
      return null;
    }
    const [target, source] = await Promise.all([
      profileForAccount(ctx, intent.user_id),
      profileForAccount(ctx, sourceId),
    ]);
    if (!target || !source) {
      return null;
    }
    return {
      state: 'review' as const,
      provider: intent.provider,
      targetSlug: target.slug,
      targetName: target.username ?? target.slug,
      sourceName: source.username ?? source.slug,
      sameAccount: sourceId === intent.user_id,
      error: null,
    };
  },
});

export const confirmConnection = mutation({
  args: { token: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const intent = await connectionIntent(ctx, args.token);
    if (!intent || intent.state !== 'pending' || Date.now() >= intent.expires_at) {
      throw new Error('This connection has expired. Start again from your profile.');
    }
    const sourceId = await verifiedConnection(ctx, intent);
    if (!sourceId) {
      throw new Error('Sign in with the account you want to connect first.');
    }
    const currentSessionId = await getAuthSessionId(ctx);
    const currentSession = currentSessionId ? await ctx.db.get(currentSessionId) : null;
    if (!currentSession || currentSession.expirationTime <= Date.now()) {
      throw new Error('Sign in again before connecting an account.');
    }
    if (sourceId === intent.user_id) {
      await ctx.db.patch(intent._id, { state: 'expired' });
      return null;
    }
    const operationId = await startAccountMerge(ctx, sourceId, intent.user_id, intent.user_id);
    await ctx.db.patch(intent._id, { state: 'accepted', verified_user_id: sourceId, operation_id: operationId });
    return null;
  },
});

export const disconnect = mutation({
  args: { provider: authProviderValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    await requireUnlockedAccount(ctx, userId);
    const methods = await accountMethods(ctx, userId);
    if (!methods.some((method) => method.provider !== args.provider && method.connected && method.available)) {
      throw new Error('Keep at least one sign-in method connected.');
    }
    const accounts = await ctx.db
      .query('authAccounts')
      .withIndex('userIdAndProvider', (q) => q.eq('userId', userId).eq('provider', args.provider))
      .take(101);
    if (accounts.length > 100) {
      throw new Error('This profile has too many connections to disconnect at once. Contact an administrator.');
    }
    for (const account of accounts) {
      for await (const code of ctx.db
        .query('authVerificationCodes')
        .withIndex('accountId', (q) => q.eq('accountId', account._id))) {
        await ctx.db.delete(code._id);
      }
      await ctx.db.delete(account._id);
    }
    return null;
  },
});
