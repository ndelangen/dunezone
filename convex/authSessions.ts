import { v } from 'convex/values';

import { internal } from './_generated/api';
import { internalMutation } from './functions';
import {
  removeRevokedSessions,
  removeSession,
  removeSessionTokens,
  scheduleSessionExpiry,
  sessionDeadline,
} from './lib/authSessionLifecycle';

export const removeTokens = internalMutation({
  args: { sessionId: v.id('authSessions') },
  returns: v.null(),
  handler: async (ctx, args) => {
    await removeSessionTokens(ctx, args.sessionId);
    return null;
  },
});
export const removeRevoked = internalMutation({
  args: { userId: v.id('users'), through: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await removeRevokedSessions(ctx, args.userId, args.through);
    return null;
  },
});

/** Token issuance for enabled providers completes in the session creation transaction. */
export const registerNew = internalMutation({
  args: { userId: v.id('users'), since: v.number(), cursor: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query('authSessions')
      .withIndex('userId', (q) => q.eq('userId', args.userId).gte('_creationTime', args.since))
      .paginate({ numItems: 8, cursor: args.cursor });
    await Promise.all(result.page.map((session) => scheduleSessionExpiry(ctx, session)));
    if (!result.isDone) {
      await ctx.scheduler.runAfter(0, internal.authSessions.registerNew, { ...args, cursor: result.continueCursor });
    }
    return null;
  },
});

/** Keep this callback deployed while existing sessions still have pending expiry jobs. */
export const expireOne = internalMutation({
  args: { sessionId: v.id('authSessions') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (session) {
      /* Do not cancel the running callback or its token-drain continuations. */
      await ctx.db.patch(session._id, { expiry_job_id: undefined });
      if ((await sessionDeadline(ctx, session)) <= Date.now()) {
        await removeSession(ctx, session._id);
      } else {
        await scheduleSessionExpiry(ctx, { ...session, expiry_job_id: undefined });
      }
    }
    return null;
  },
});
