import { MINUTE, RateLimiter } from '@convex-dev/rate-limiter';

import { components } from '../_generated/api';

export const playRateLimiter = new RateLimiter(components.rateLimiter, {
  playTicketPerAccount: { kind: 'token bucket', rate: 30, period: MINUTE, capacity: 10 },
  playTicketGlobal: { kind: 'token bucket', rate: 600, period: MINUTE, capacity: 100 },
  playRedeemPerGame: { kind: 'token bucket', rate: 600, period: MINUTE, capacity: 100 },
  playProvisionValidation: { kind: 'token bucket', rate: 60, period: MINUTE, capacity: 20 },
});
