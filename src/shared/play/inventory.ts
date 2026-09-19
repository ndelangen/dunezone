import { z } from 'zod';

import { seatRequestSchema } from './participation';
import { tableCountSchema, tableIdSchema, tablePieceSchema, tableSeatSchema } from './schema';

export const SPAWN_TYPES = ['deck', 'bundle', 'token-disc', 'token-tech', 'token-plate', 'token-enhance'] as const;
export const spawnSelectionSchema = z.object({ type: z.enum(SPAWN_TYPES), slug: z.string().min(1).max(160) });
export const spawnContentsSchema = z.object({
  assetId: tableIdSchema,
  name: z.string(),
  type: z.enum(SPAWN_TYPES),
  members: z.array(z.object({ assetId: tableIdSchema, count: tableCountSchema.positive() })),
  definitions: z.array(z.object({ id: tableIdSchema, type: z.string(), data: z.unknown() })),
  pieces: z.array(tablePieceSchema).min(1),
});
export type SpawnContents = z.infer<typeof spawnContentsSchema>;
export type SpawnSelection = z.infer<typeof spawnSelectionSchema>;
export const publicControlsSchema = z.object({
  seats: z.array(tableSeatSchema),
  ready: z.array(tableSeatSchema),
  phaseChangedAt: tableCountSchema,
  requests: z.array(
    z.object({
      id: tableIdSchema,
      /*
       * The requester is named by seat, never by user id: only the viewer's own id leaves the server.
       * A snapshot persisted before this field existed reads as an unknown requester, which nobody
       * may approve; it can only be dismissed.
       */
      requesterSeat: tableSeatSchema.nullable().catch(null),
      requesterName: z.string(),
      contents: spawnContentsSchema,
    })
  ),
  /* Pending seat requests, public to every viewer; a snapshot from before they existed reads as none. */
  seatRequests: z.array(seatRequestSchema).default([]),
});
export type PublicControls = z.infer<typeof publicControlsSchema>;
export function emptyPublicControls(): PublicControls {
  return { seats: [], ready: [], phaseChangedAt: 0, requests: [], seatRequests: [] };
}
export const publicActionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('ready'), ready: z.boolean() }),
  z.strictObject({ kind: z.literal('spawn-request'), ...spawnSelectionSchema.shape }),
  z.strictObject({ kind: z.literal('spawn-approve'), requestId: tableIdSchema }),
  z.strictObject({ kind: z.literal('spawn-dismiss'), requestId: tableIdSchema }),
]);
export type PublicAction = z.infer<typeof publicActionSchema>;
