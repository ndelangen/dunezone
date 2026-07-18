import { z } from 'zod';

import { FactionInputSchema, FactionRowSlugSchema } from '../../game/schema/faction';

/** Shared exact contract for the protected Convex producer and Browser capture consumer. */
const publisherCaptureSnapshotSchema = z.strictObject({
  ok: z.literal(true),
  payload: z.strictObject({
    factionId: z.string().min(1),
    slug: FactionRowSlugSchema,
    faction: FactionInputSchema,
  }),
  payloadHash: z.string().regex(/^[0-9a-f]{64}$/),
});

type PublisherCaptureSnapshotSource = {
  payload: unknown;
  payloadHash: unknown;
};

/** Explicitly projects the narrow browser DTO so operational item fields cannot leak into it. */
export function makePublisherCaptureSnapshot(source: PublisherCaptureSnapshotSource) {
  return publisherCaptureSnapshotSchema.parse({
    ok: true,
    payload: source.payload,
    payloadHash: source.payloadHash,
  });
}

/** Strictly parses the untrusted snapshot response inside Browser capture. */
export function parsePublisherCaptureSnapshot(value: unknown) {
  return publisherCaptureSnapshotSchema.parse(value);
}
