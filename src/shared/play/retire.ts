import { z } from 'zod';

import { gameCredentialFields } from './admission';

/**
 * Retires the hosted fixture, an unconfirmed game, or a game removed by an account ban.
 * The room checks its stored secret even when its game state no longer loads; only Convex holds that secret.
 * A ban operation explicitly authorizes retirement of a confirmed real game.
 * Kept out of admission.ts, which the publisher bundles, so the renderer identity stays as it is.
 */
export const playRetireFixtureRequestSchema = z.strictObject({
  ...gameCredentialFields,
  banOperationId: z.string().min(1).max(128).optional(),
});
