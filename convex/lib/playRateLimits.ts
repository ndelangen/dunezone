import { HOUR, MINUTE, RateLimiter } from '@convex-dev/rate-limiter';

import { components } from '../_generated/api';
import type { Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';

export const playRateLimiter = new RateLimiter(components.rateLimiter, {
  playTicketPerAccount: { kind: 'token bucket', rate: 30, period: MINUTE, capacity: 10 },
  playTicketGlobal: { kind: 'token bucket', rate: 600, period: MINUTE, capacity: 100 },
  playRedeemPerGame: { kind: 'token bucket', rate: 600, period: MINUTE, capacity: 100 },
  playProvisionValidation: { kind: 'token bucket', rate: 60, period: MINUTE, capacity: 20 },
  /* Creation is open to every signed-in player, so each game row and its provisioning are budgeted per account. */
  playCreatePerAccount: { kind: 'token bucket', rate: 10, period: HOUR, capacity: 3 },
  /* Refused names spend checking capacity, never game-creation capacity. */
  playNameCheckPerAccount: { kind: 'token bucket', rate: 10, period: MINUTE, capacity: 3 },
  playNameCheckGlobal: { kind: 'token bucket', rate: 600, period: MINUTE, capacity: 100 },
});

/**
 * No provider request is issued without capacity in both checking buckets.
 * An account that spent its own checking budget is refused outright, since resubmitting a refused name until the budget runs out must not skip the check;
 * only exhausted global capacity lets a name through unchecked.
 */
export async function playNameCheckCapacity(
  ctx: MutationCtx,
  userId: Id<'users'>
): Promise<'checked' | 'unchecked' | 'rate_limited'> {
  if (!(await playRateLimiter.check(ctx, 'playNameCheckPerAccount', { key: userId })).ok) {
    return 'rate_limited';
  }
  if (!(await playRateLimiter.check(ctx, 'playNameCheckGlobal')).ok) {
    return 'unchecked';
  }
  await playRateLimiter.limit(ctx, 'playNameCheckPerAccount', { key: userId });
  await playRateLimiter.limit(ctx, 'playNameCheckGlobal');
  return 'checked';
}

/**
 * Refuses a game creation once the account has used its creation budget.
 * The seat limit bounds how many games one account holds open;
 * this bucket bounds how fast it creates them.
 */
export async function playCreateQuota(ctx: MutationCtx, userId: string) {
  if (!(await playRateLimiter.limit(ctx, 'playCreatePerAccount', { key: userId })).ok) {
    return { ok: false as const, reason: 'rate_limited' as const };
  }
  return null;
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
