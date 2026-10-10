import { internal } from '../_generated/api';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';

const TOKEN_BATCH = 32;
const SESSION_BATCH = 8;

export function newestUnusedRefresh(ctx: QueryCtx, sessionId: Id<'authSessions'>) {
  return ctx.db
    .query('authRefreshTokens')
    .withIndex('by_sessionId_and_firstUsedTime', (q) => q.eq('sessionId', sessionId).eq('firstUsedTime', undefined))
    .order('desc')
    .first();
}

export async function sessionDeadline(ctx: QueryCtx, session: Doc<'authSessions'>) {
  const refresh = await newestUnusedRefresh(ctx, session._id);
  return Math.min(session.expirationTime, refresh?.expirationTime ?? session.expirationTime);
}

/** Removing the session denies access immediately, even while token cleanup continues. */
export async function removeSession(ctx: MutationCtx, sessionId: Id<'authSessions'>) {
  const session = await ctx.db.get(sessionId);
  if (session) {
    if (session.expiry_job_id) {
      const job = await ctx.db.system.get(session.expiry_job_id);
      if (job?.state.kind === 'pending') {
        await ctx.scheduler.cancel(session.expiry_job_id);
      }
    }
    await ctx.db.delete(sessionId);
  }
  await removeSessionTokens(ctx, sessionId);
}

export async function removeSessionTokens(ctx: MutationCtx, sessionId: Id<'authSessions'>) {
  const tokens = await ctx.db
    .query('authRefreshTokens')
    .withIndex('sessionId', (q) => q.eq('sessionId', sessionId))
    .take(TOKEN_BATCH);
  await Promise.all(tokens.map((token) => ctx.db.delete(token._id)));
  if (tokens.length === TOKEN_BATCH) {
    await ctx.scheduler.runAfter(0, internal.authSessions.removeTokens, { sessionId });
  }
}

/** A single user write revokes every existing session before bounded cleanup starts. */
export async function revokeAccountSessions(ctx: MutationCtx, userId: Id<'users'>) {
  const newest = await ctx.db
    .query('authSessions')
    .withIndex('userId', (q) => q.eq('userId', userId))
    .order('desc')
    .first();
  if (!newest) {
    return;
  }
  const user = await ctx.db.get(userId);
  const through = Math.max(newest._creationTime, user?.auth_sessions_revoked_through ?? -1);
  await ctx.db.patch(userId, { auth_sessions_revoked_through: through });
  await removeRevokedSessions(ctx, userId, through);
}

export async function removeRevokedSessions(ctx: MutationCtx, userId: Id<'users'>, through: number) {
  const sessions = await ctx.db
    .query('authSessions')
    .withIndex('userId', (q) => q.eq('userId', userId).lte('_creationTime', through))
    .take(SESSION_BATCH);
  await Promise.all(sessions.map((session) => removeSession(ctx, session._id)));
  if (sessions.length === SESSION_BATCH) {
    await ctx.scheduler.runAfter(0, internal.authSessions.removeRevoked, { userId, through });
  }
}

/** Registration and the job marker commit together, including overlapping bootstraps. */
export async function scheduleSessionExpiry(ctx: MutationCtx, session: Doc<'authSessions'>) {
  if (session.expiry_job_id) {
    return;
  }
  const deadline = await sessionDeadline(ctx, session);
  if (deadline <= Date.now()) {
    await removeSession(ctx, session._id);
    return;
  }
  const jobId = await ctx.scheduler.runAt(deadline, internal.authSessions.expireOne, { sessionId: session._id });
  await ctx.db.patch(session._id, { expiry_job_id: jobId });
}
