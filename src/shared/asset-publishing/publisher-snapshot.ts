import { z } from 'zod';

import { FactionInputSchema } from '../../game/schema/faction';

/** Shared exact contract for the protected Convex producer and Browser capture consumer. */
export const publisherSnapshotSchema = z
  .strictObject({
    ok: z.literal(true),
    targetId: z.string().min(1),
    factionId: z.string().min(1),
    assetType: z.literal('faction_sheet'),
    generation: z.number().int().positive(),
    rendererVersion: z.string().trim().min(1).max(128),
    leaseExpiresAt: z.number().int().positive(),
    payload: z.strictObject({
      factionId: z.string().min(1),
      slug: z.string(),
      faction: FactionInputSchema,
    }),
    payloadHash: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .refine((snapshot) => snapshot.factionId === snapshot.payload.factionId, {
    message: 'Snapshot faction identity does not match its payload',
    path: ['payload', 'factionId'],
  });

export type PublisherSnapshot = z.infer<typeof publisherSnapshotSchema>;
