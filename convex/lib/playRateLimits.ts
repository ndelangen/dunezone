import { MINUTE, RateLimiter } from '@convex-dev/rate-limiter';

import { components } from '../_generated/api';
import type { MutationCtx } from '../_generated/server';

export const playRateLimiter = new RateLimiter(components.rateLimiter, {
  playTicketPerAccount: { kind: 'token bucket', rate: 30, period: MINUTE, capacity: 10 },
  playTicketGlobal: { kind: 'token bucket', rate: 600, period: MINUTE, capacity: 100 },
  playRedeemPerGame: { kind: 'token bucket', rate: 600, period: MINUTE, capacity: 100 },
  playProvisionValidation: { kind: 'token bucket', rate: 60, period: MINUTE, capacity: 20 },
});

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
