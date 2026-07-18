import { z } from 'zod';

import { FactionInputSchema, FactionRowSlugSchema } from '../../game/schema/faction';

/** Shared exact contract for the protected Convex producer and Browser capture consumer. */
export const publisherCaptureSnapshotSchema = z.strictObject({
  ok: z.literal(true),
  payload: z.strictObject({
    factionId: z.string().min(1),
    slug: FactionRowSlugSchema,
    faction: FactionInputSchema,
  }),
  payloadHash: z.string().regex(/^[0-9a-f]{64}$/),
});
