import { MINUTE, RateLimiter } from '@convex-dev/rate-limiter';
import { zodToConvex } from 'convex-helpers/server/zod4';
import { v } from 'convex/values';

import { HOMEPAGE_LEASE_MS, homepageAdmissionSchema, homepageTicketSchema } from '../src/shared/homepage/protocol';
import { components, internal } from './_generated/api';
import { internalMutation, mutation } from './functions';
import {
  livePlaySession,
  playCredential,
  playCredentialDigest,
  playSessionAuthorization,
} from './lib/playAuthorization';
import { playerSummary } from './lib/playerSummary';

/* Homepage renewal traffic has its own budget so it cannot consume real-game admission capacity. */
const limiter = new RateLimiter(components.rateLimiter, {
  homepageAccount: { kind: 'token bucket', rate: 12, period: MINUTE, capacity: 4 },
  homepageIssue: { kind: 'token bucket', rate: 300, period: MINUTE, capacity: 50 },
  homepageRedeem: { kind: 'token bucket', rate: 300, period: MINUTE, capacity: 50 },
});

export const issueTicket = mutation({
  args: {},
  returns: v.union(v.null(), v.object({ ticket: v.string() })),
  handler: async (ctx) => {
    const session = await livePlaySession(ctx);
    if (!session) {
      return null;
    }
    if (!(await limiter.limit(ctx, 'homepageAccount', { key: session.userId })).ok) {
      return null;
    }
    if (!(await limiter.limit(ctx, 'homepageIssue')).ok) {
      return null;
    }
    const ticket = playCredential();
    const expiresAt = Math.min(Date.now() + HOMEPAGE_LEASE_MS, session.authExpiresAt);
    const ticketId = await ctx.db.insert('homepage_tickets', {
      digest: await playCredentialDigest(ticket),
      user_id: session.userId,
      session_id: session.sessionId,
      expires_at: expiresAt,
    });
    await ctx.scheduler.runAt(expiresAt, internal.homepageAdmission.expireTicket, { ticketId });
    return { ticket };
  },
});

export const expireTicket = internalMutation({
  args: { ticketId: v.id('homepage_tickets') },
  returns: v.null(),
  handler: async (ctx, { ticketId }) => {
    const ticket = await ctx.db.get(ticketId);
    if (ticket && ticket.expires_at <= Date.now()) {
      await ctx.db.delete(ticketId);
    }
    return null;
  },
});

/* Possession of the single-use ticket grants only this public table's short editing lease. */
export const redeemTicket = mutation({
  args: { ticket: v.string() },
  returns: zodToConvex(homepageAdmissionSchema),
  handler: async (ctx, args) => {
    if (!homepageTicketSchema.safeParse(args.ticket).success) {
      return { allowed: false as const };
    }
    const digest = await playCredentialDigest(args.ticket);
    const ticket = await ctx.db
      .query('homepage_tickets')
      .withIndex('by_digest', (q) => q.eq('digest', digest))
      .unique();
    if (!ticket) {
      return { allowed: false as const };
    }
    await ctx.db.delete(ticket._id);
    const now = Date.now();
    if (ticket.expires_at <= now) {
      return { allowed: false as const };
    }
    const auth = await playSessionAuthorization(ctx, ticket.user_id, ticket.session_id);
    if (!auth.allowed || auth.authExpiresAt <= now) {
      return { allowed: false as const };
    }
    if (!(await limiter.limit(ctx, 'homepageRedeem')).ok) {
      return { allowed: false as const };
    }
    const profile = await ctx.db
      .query('profiles')
      .withIndex('by_user_id', (q) => q.eq('user_id', ticket.user_id))
      .unique();
    return {
      allowed: true as const,
      avatarUrl: playerSummary(profile).avatarUrl,
      userKey: ticket.user_id,
      leaseUntil: Math.min(now + HOMEPAGE_LEASE_MS, auth.authExpiresAt),
    };
  },
});
