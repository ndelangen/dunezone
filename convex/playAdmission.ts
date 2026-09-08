import { zodToConvex } from 'convex-helpers/server/zod4';
import { v } from 'convex/values';

import {
  PLAY_FIXTURE_KEY,
  PLAY_TICKET_TTL_MS,
  playAckAccountDeletionRequestSchema,
  playFixtureSchema,
  playIssueTicketRequestSchema,
  playReconcileAccountsRequestSchema,
  playReconcileAccountsResultSchema,
  playRedeemTicketRequestSchema,
  playRedeemTicketResultSchema,
  playTicketResultSchema,
  playWatchAuthorizationsRequestSchema,
  playWatchAuthorizationsResultSchema,
} from '../src/shared/play/admission';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { query } from './_generated/server';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { internalMutation, mutation } from './functions';
import { accountStateOf } from './lib/accountLifecycle';
import {
  authenticatedPlayRequest,
  currentPlaySession,
  playCredential,
  playCredentialDigest,
  playSessionAuthorization,
} from './lib/playAuthorization';
import { playRateLimiter, playTicketQuota } from './lib/playRateLimits';

export const getFixture = query({
  args: {},
  returns: zodToConvex(playFixtureSchema),
  handler: async (ctx) => {
    if (!(await currentPlaySession(ctx))) {
      return { status: 'sign_in_required' as const };
    }
    const game = await ctx.db
      .query('play_games')
      .withIndex('by_fixture_key_state', (q) => q.eq('fixture_key', PLAY_FIXTURE_KEY).eq('state', 'ready'))
      .unique();
    return game
      ? { status: 'ready' as const, gameId: game._id, name: 'Hosted fixture' }
      : { status: 'unavailable' as const };
  },
});

export const issueTicket = mutation({
  args: zodToConvex(playIssueTicketRequestSchema),
  returns: zodToConvex(playTicketResultSchema),
  handler: async (ctx, args): Promise<ReturnType<typeof playTicketResultSchema.parse>> => {
    const session = await currentPlaySession(ctx);
    if (!session || Date.now() >= session.authExpiresAt) {
      return { ok: false as const, reason: 'not_authorized' as const };
    }
    const limited = await playTicketQuota(ctx, session.userId);
    if (limited) {
      return limited;
    }
    const request = playIssueTicketRequestSchema.safeParse(args);
    const gameId = request.success ? ctx.db.normalizeId('play_games', request.data.gameId) : null;
    const game = gameId ? await ctx.db.get(gameId) : null;
    if (game?.state !== 'ready') {
      return { ok: false as const, reason: 'unavailable' as const };
    }
    const ticket = playCredential();
    const expiresAt = Math.min(Date.now() + PLAY_TICKET_TTL_MS, session.authExpiresAt);
    const ticketId = await ctx.db.insert('play_tickets', {
      digest: await playCredentialDigest(ticket),
      game_id: game._id,
      user_id: session.userId,
      session_id: session.sessionId,
      expires_at: expiresAt,
      consumed: false,
    });
    await ctx.scheduler.runAt(expiresAt, internal.playAdmission.expireTicket, { ticketId });
    return { ok: true as const, ticket, expiresAt };
  },
});

async function expirePlayRecord(ctx: MutationCtx, id: Id<'play_tickets'> | Id<'play_auth_registrations'>) {
  const record = await ctx.db.get(id);
  if (record && Date.now() >= record.expires_at) {
    await ctx.db.delete(record._id);
  }
}

export const expireTicket = internalMutation({
  args: { ticketId: v.id('play_tickets') },
  returns: v.null(),
  handler: async (ctx, args) => {
    await expirePlayRecord(ctx, args.ticketId);
    return null;
  },
});

async function registerSession(ctx: MutationCtx, ticket: Doc<'play_tickets'>, expiresAt: number) {
  const previous = await ctx.db
    .query('play_auth_registrations')
    .withIndex('by_game_id_session_id', (q) => q.eq('game_id', ticket.game_id).eq('session_id', ticket.session_id))
    .unique();
  if (previous) {
    return previous._id;
  }
  const registrationId = await ctx.db.insert('play_auth_registrations', {
    game_id: ticket.game_id,
    user_id: ticket.user_id,
    session_id: ticket.session_id,
    expires_at: expiresAt,
  });
  await ctx.scheduler.runAt(expiresAt, internal.playAdmission.expireRegistration, { registrationId });
  return registrationId;
}

async function retainAccountRouting(ctx: MutationCtx, ticket: Doc<'play_tickets'>) {
  const previous = await ctx.db
    .query('play_game_accounts')
    .withIndex('by_game_id_user_id', (q) => q.eq('game_id', ticket.game_id).eq('user_id', ticket.user_id))
    .unique();
  if (!previous) {
    await ctx.db.insert('play_game_accounts', { game_id: ticket.game_id, user_id: ticket.user_id });
  }
}

async function findRedeemableTicket(ctx: MutationCtx, gameId: Id<'play_games'>, value: string) {
  const digest = await playCredentialDigest(value);
  const ticket = await ctx.db
    .query('play_tickets')
    .withIndex('by_digest', (q) => q.eq('digest', digest))
    .unique();
  if (!ticket || ticket.game_id !== gameId) {
    return null;
  }
  return ticket.consumed || Date.now() >= ticket.expires_at ? null : ticket;
}

export const redeemTicket = mutation({
  args: zodToConvex(playRedeemTicketRequestSchema),
  returns: zodToConvex(playRedeemTicketResultSchema),
  handler: async (ctx, input) => {
    const request = await authenticatedPlayRequest(ctx, input, playRedeemTicketRequestSchema);
    if (request?.game.state !== 'ready') {
      return { ok: false as const };
    }
    const { game, args } = request;
    if (!(await playRateLimiter.limit(ctx, 'playRedeemPerGame', { key: game._id })).ok) {
      return { ok: false as const };
    }
    const ticket = await findRedeemableTicket(ctx, game._id, args.ticket);
    if (!ticket) {
      return { ok: false as const };
    }
    const authorization = await playSessionAuthorization(ctx, ticket.user_id, ticket.session_id);
    if (!authorization.allowed || Date.now() >= authorization.authExpiresAt) {
      return { ok: false as const };
    }
    await ctx.db.patch(ticket._id, { consumed: true });
    const registrationId = await registerSession(ctx, ticket, authorization.sessionExpiresAt);
    await retainAccountRouting(ctx, ticket);
    const profile = await ctx.db
      .query('profiles')
      .withIndex('by_user_id', (q) => q.eq('user_id', ticket.user_id))
      .unique();
    return {
      ok: true as const,
      registrationId,
      userId: ticket.user_id,
      sessionId: ticket.session_id,
      authExpiresAt: authorization.authExpiresAt,
      displayName: profile?.username?.slice(0, 256) || 'Player',
    };
  },
});

export const expireRegistration = internalMutation({
  args: { registrationId: v.id('play_auth_registrations') },
  returns: v.null(),
  handler: async (ctx, args) => {
    await expirePlayRecord(ctx, args.registrationId);
    return null;
  },
});

async function authorizationEntry(ctx: QueryCtx, gameId: Id<'play_games'>, registrationId: string) {
  const id = ctx.db.normalizeId('play_auth_registrations', registrationId);
  const registration = id ? await ctx.db.get(id) : null;
  if (!registration || registration.game_id !== gameId) {
    return { registrationId, userId: null, sessionId: null, allowed: false, authExpiresAt: 0 };
  }
  const authorization = await playSessionAuthorization(ctx, registration.user_id, registration.session_id);
  return {
    registrationId,
    userId: registration.user_id,
    sessionId: registration.session_id,
    allowed: authorization.allowed,
    authExpiresAt: authorization.authExpiresAt,
  };
}

/** Each requested identity gets an answer. Bounds reject oversized input; they never truncate authorization. */
export const watchAuthorizations = query({
  args: zodToConvex(playWatchAuthorizationsRequestSchema),
  returns: zodToConvex(playWatchAuthorizationsResultSchema),
  handler: async (ctx, input) => {
    const request = await authenticatedPlayRequest(ctx, input, playWatchAuthorizationsRequestSchema);
    if (request?.game.state !== 'ready') {
      return { ok: false as const };
    }
    const { game, args } = request;
    const entries = await Promise.all(args.registrationIds.map((id) => authorizationEntry(ctx, game._id, id)));
    return { ok: true as const, generation: args.generation, entries };
  },
});

function routedAccountState(routing: Doc<'play_game_accounts'>, user: Doc<'users'> | null) {
  if (routing.deletion_operation_id || !user) {
    return 'deleted' as const;
  }
  return accountStateOf(user);
}

async function accountEntry(ctx: QueryCtx, gameId: Id<'play_games'>, userId: string) {
  const id = ctx.db.normalizeId('users', userId);
  const routing = id
    ? await ctx.db
        .query('play_game_accounts')
        .withIndex('by_game_id_user_id', (q) => q.eq('game_id', gameId).eq('user_id', id))
        .unique()
    : null;
  if (!routing || !id) {
    return { userId, state: 'unknown' as const, deletionOperationId: null };
  }
  const user = await ctx.db.get(id);
  const deletionOperationId = routing.deletion_operation_id ?? user?.account_deletion_operation_id ?? null;
  return {
    userId,
    state: routedAccountState(routing, user),
    deletionOperationId,
  };
}

export const reconcileAccounts = query({
  args: zodToConvex(playReconcileAccountsRequestSchema),
  returns: zodToConvex(playReconcileAccountsResultSchema),
  handler: async (ctx, input) => {
    const request = await authenticatedPlayRequest(ctx, input, playReconcileAccountsRequestSchema);
    if (request?.game.state !== 'ready') {
      return { ok: false as const };
    }
    const { game, args } = request;
    const accounts = await Promise.all(args.userIds.map((id) => accountEntry(ctx, game._id, id)));
    return { ok: true as const, accounts };
  },
});

async function acknowledgeDeletion(
  ctx: MutationCtx,
  input: ReturnType<typeof playAckAccountDeletionRequestSchema.parse>
) {
  const request = await authenticatedPlayRequest(ctx, input, playAckAccountDeletionRequestSchema);
  if (request?.game.state !== 'ready') {
    return;
  }
  const { game, args } = request;
  const id = ctx.db.normalizeId('play_account_deletions', args.eventId);
  const event = id ? await ctx.db.get(id) : null;
  if (event?.game_id === game._id && event.state === 'pending') {
    await ctx.db.patch(event._id, { state: 'acknowledged' });
  }
}

export const ackAccountDeletion = mutation({
  args: zodToConvex(playAckAccountDeletionRequestSchema),
  returns: v.null(),
  handler: async (ctx, args) => {
    await acknowledgeDeletion(ctx, args);
    return null;
  },
});
