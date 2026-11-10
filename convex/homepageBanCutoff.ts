import { zodToConvex } from 'convex-helpers/server/zod4';
import { v } from 'convex/values';

import {
  HOMEPAGE_ACCOUNT_CUTOFF_PATH,
  HOMEPAGE_LEASE_MS,
  homepageAccountCutoffSchema,
} from '../src/shared/homepage/protocol';
import { PLAY_REQUEST_TIMEOUT_MS } from '../src/shared/play/admission';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { internalAction } from './_generated/server';
import type { QueryCtx } from './_generated/server';
import { internalMutation, publicQuery } from './functions';
import { playCredentialDigest } from './lib/playAuthorization';
import { playServiceOrigin } from './lib/playService';

const RETRY_MS = 5000;
const CLOCK_MARGIN_MS = 60_000;

async function pendingCutoff(ctx: QueryCtx, operationId: Id<'account_deletion_operations'>) {
  const operation = await ctx.db.get(operationId);
  if (operation?.kind !== 'ban' || !operation.homepage_cutoff_token || operation.homepage_cutoff_at === undefined) {
    return null;
  }
  return {
    token: operation.homepage_cutoff_token,
    userKey: operation.source_user_id,
    through: operation.homepage_cutoff_at,
    expiresAt: operation.homepage_cutoff_at + HOMEPAGE_LEASE_MS + CLOCK_MARGIN_MS,
  };
}

/** The operation's cutoff stays valid after unban, because a delayed delivery still has to end pre-ban leases. */
export const authorize = publicQuery({
  args: { operationId: v.string(), token: v.string() },
  returns: zodToConvex(homepageAccountCutoffSchema),
  handler: async (ctx, args) => {
    if (!/^[a-f0-9]{64}$/.test(args.token)) {
      return null;
    }
    const operationId = ctx.db.normalizeId('account_deletion_operations', args.operationId);
    const cutoff = operationId ? await pendingCutoff(ctx, operationId) : null;
    const [expected, actual] = await Promise.all([
      playCredentialDigest(cutoff?.token ?? '0'.repeat(64)),
      playCredentialDigest(args.token),
    ]);
    let difference = 0;
    for (let index = 0; index < expected.length; index++) {
      difference |= expected.charCodeAt(index) ^ actual.charCodeAt(index);
    }
    return cutoff && difference === 0
      ? { userKey: cutoff.userKey, through: cutoff.through, expiresAt: cutoff.expiresAt }
      : null;
  },
});

/** Schedule the next attempt before external I/O, so a failed action cannot strand an existing edit lease. */
export const attempt = internalMutation({
  args: { operationId: v.id('account_deletion_operations') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const cutoff = await pendingCutoff(ctx, args.operationId);
    if (!cutoff || cutoff.expiresAt <= Date.now()) {
      const operation = await ctx.db.get(args.operationId);
      if (operation?.homepage_cutoff_token) {
        await ctx.db.patch(operation._id, { homepage_cutoff_token: undefined });
      }
      return null;
    }
    await ctx.scheduler.runAfter(RETRY_MS, internal.homepageBanCutoff.attempt, args);
    await ctx.scheduler.runAfter(0, internal.homepageBanCutoff.deliver, { ...args, token: cutoff.token });
    return null;
  },
});

export const deliver = internalAction({
  args: { operationId: v.id('account_deletion_operations'), token: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    try {
      const response = await fetch(`${playServiceOrigin()}${HOMEPAGE_ACCOUNT_CUTOFF_PATH}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${args.token}`, 'X-Account-Operation': args.operationId },
        redirect: 'error',
        signal: AbortSignal.timeout(PLAY_REQUEST_TIMEOUT_MS),
      });
      await response.body?.cancel();
      if (response.ok) {
        await ctx.runMutation(internal.homepageBanCutoff.acknowledge, args);
      }
    } catch {
      /* The already scheduled mutation tries again until every older lease has expired. */
    }
    return null;
  },
});

export const acknowledge = internalMutation({
  args: { operationId: v.id('account_deletion_operations'), token: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const operation = await ctx.db.get(args.operationId);
    if (operation?.homepage_cutoff_token === args.token) {
      await ctx.db.patch(operation._id, { homepage_cutoff_token: undefined });
    }
    return null;
  },
});
