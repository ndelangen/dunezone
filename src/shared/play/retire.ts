import { z } from 'zod';

import { gameCredentialFields } from './admission';

/**
 * Retires the hosted fixture's room, or the room of a game that expired before Convex confirmed it: the room checks the credentials against its own stored metadata, so it can answer even when its game state no longer loads.
 * Kept out of admission.ts, which the publisher bundles, so the renderer identity stays as it is.
 */
export const playRetireFixtureRequestSchema = z.strictObject(gameCredentialFields);
