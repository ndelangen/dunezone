import { z } from 'zod';

export const tableIdSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,160}$/);
export const tableCountSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const tablePositionSchema = z.tuple([
  z.number().min(-30).max(30),
  z.number().min(-30).max(30),
  z.number().min(-30).max(30),
]);
export const tableOrientationSchema = z.number().min(-100_000).max(100_000);
const tableFactionSchema = z.enum(['harkonnen', 'atreides', 'bene-gesserit', 'neutral', 'shared']);
export const tableSeatSchema = z.union([tableFactionSchema, z.string().regex(/^load-seat-(?:[1-9]|1[0-8])$/)]);
export const enforcementPolicySchema = z.enum(['strict', 'assisted', 'sandbox']);

export const tablePieceSchema = z.object({
  id: tableIdSchema,
  label: z.string(),
  owner: tableFactionSchema,
  color: z.string(),
  accent: z.string(),
  items: z.array(z.object({ id: tableIdSchema, faceUp: z.boolean() })),
  stackKey: z.string().nullable(),
  position: tablePositionSchema,
  orientation: tableOrientationSchema,
  /* Counts explicit flips, so rendering can distinguish them from other item changes. */
  flipRevision: tableCountSchema.optional(),
  zoneId: z.string().nullable(),
  locked: z.boolean(),
  kind: z.enum(['force', 'marker', 'card']),
});

export const draftMoveSchema = z.object({
  operation: z.enum(['move', 'merge']),
  pieceId: tableIdSchema,
  sourcePieceId: tableIdSchema,
  pickedUpItemIds: z.array(tableIdSchema),
  withdrawals: z.array(z.object({ sourcePieceId: tableIdSchema, itemId: tableIdSchema })),
  origin: tablePositionSchema,
  originOrientation: tableOrientationSchema,
  position: tablePositionSchema,
  orientation: tableOrientationSchema,
  targetZoneId: z.string().nullable(),
  targetPieceId: tableIdSchema.nullable(),
  warning: z.string().nullable(),
});

const tableEventSchema = z.object({
  id: tableIdSchema,
  command: z.string(),
  message: z.string(),
  status: z.enum(['accepted', 'accepted-with-warning', 'rejected']),
});

export const durableTableSchema = z.object({
  phase: z.literal('Harkonnen shipment'),
  stormSectorIndex: tableCountSchema,
  enforcement: enforcementPolicySchema,
  pieces: z.array(tablePieceSchema),
  events: z.array(tableEventSchema),
  nextEventNumber: tableCountSchema,
});
