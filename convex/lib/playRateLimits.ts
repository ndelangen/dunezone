import { HOUR, MINUTE, RateLimiter } from '@convex-dev/rate-limiter';

import { components } from '../_generated/api';
import type { MutationCtx } from '../_generated/server';

export const playRateLimiter = new RateLimiter(components.rateLimiter, {
  playTicketPerAccount: { kind: 'token bucket', rate: 30, period: MINUTE, capacity: 10 },
  playTicketGlobal: { kind: 'token bucket', rate: 600, period: MINUTE, capacity: 100 },
  playRedeemPerGame: { kind: 'token bucket', rate: 600, period: MINUTE, capacity: 100 },
  playProvisionValidation: { kind: 'token bucket', rate: 60, period: MINUTE, capacity: 20 },
  /* Creation is open to every signed-in player, so each game row and its provisioning are budgeted per account. */
  playCreatePerAccount: { kind: 'token bucket', rate: 10, period: HOUR, capacity: 3 },
  /* Accounts are free to make, so the per-account budget alone does not bound how many games the Worker is asked to provision. */
  playCreateGlobal: { kind: 'token bucket', rate: 60, period: HOUR, capacity: 20 },
});

/** Refuses a game creation once the account or the whole site has used its creation budget. */
export async function playCreateQuota(ctx: MutationCtx, userId: string) {
  const perAccount = await playRateLimiter.limit(ctx, 'playCreatePerAccount', { key: userId });
  const quota = perAccount.ok ? await playRateLimiter.limit(ctx, 'playCreateGlobal') : perAccount;
  return quota.ok ? null : { ok: false as const, reason: 'rate_limited' as const };
}

export async function playTicketQuota(ctx: MutationCtx, userId: string) {
  const perAccount = await playRateLimiter.limit(ctx, 'playTicketPerAccount', { key: userId });
  const quota = perAccount.ok ? await playRateLimiter.limit(ctx, 'playTicketGlobal') : perAccount;
  if (quota.ok) {
    return null;
  }
  return {
    ok: false as const,
    reason: 'rate_limited' as const,
    retryAfterMs: quota.retryAfter ?? 0,
  };
}
