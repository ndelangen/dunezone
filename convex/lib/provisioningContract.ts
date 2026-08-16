import type { TableNames } from '../_generated/dataModel';

/**
 * Tables the production clone never keeps: the auth session/token tables are bound to the source deployment's signing keys, and cloned publication-queue rows are work-claims that must never be acted on outside production.
 * Everything else in the snapshot stays.
 * 
 * `satisfies` turns a table rename into a compile error, so a renamed table can never be silently "cleared" by an empty import that quietly creates it instead.
 */
export const CLEARED_AFTER_CLONE = [
  'authSessions',
  'authRefreshTokens',
  'authVerificationCodes',
  'authVerifiers',
  'authRateLimits',
  'publication_jobs',
  'publication_assets',
] as const satisfies readonly TableNames[];

/** Tables a cloned deployment must have data in; empty means the snapshot never landed. */
export const REQUIRED_AFTER_CLONE = ['factions', 'users', 'authAccounts'] as const satisfies readonly TableNames[];
