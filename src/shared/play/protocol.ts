import { z } from 'zod';

import type { TableState } from './model';

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,160}$/);
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const position = z.tuple([z.number().min(-30).max(30), z.number().min(-30).max(30), z.number().min(-30).max(30)]);
const orientation = z.number().min(-100_000).max(100_000);
const faction = z.enum(['harkonnen', 'atreides', 'bene-gesserit', 'neutral', 'shared']);
const policy = z.enum(['strict', 'assisted', 'sandbox']);
const direction = z.union([z.literal(-1), z.literal(1)]);

const pieceSchema = z.object({
  id,
  label: z.string(),
  owner: faction,
  color: z.string(),
  accent: z.string(),
  items: z.array(z.object({ id, faceUp: z.boolean() })),
  stackKey: z.string().nullable(),
  position,
  orientation,
  flipRevision: count.optional(),
  zoneId: z.string().nullable(),
  locked: z.boolean(),
  kind: z.enum(['force', 'marker', 'card']),
});
const draftSchema = z.object({
  operation: z.enum(['move', 'merge']),
  pieceId: id,
  sourcePieceId: id,
  pickedUpItemIds: z.array(id),
  withdrawals: z.array(z.object({ sourcePieceId: id, itemId: id })),
  origin: position,
  originOrientation: orientation,
  position,
  orientation,
  targetZoneId: z.string().nullable(),
  targetPieceId: id.nullable(),
  warning: z.string().nullable(),
});
const tableSchema = z.object({
  phase: z.literal('Harkonnen shipment'),
  stormSectorIndex: count,
  enforcement: policy,
  pieces: z.array(pieceSchema),
  events: z.array(
    z.object({
      id,
      command: z.string(),
      message: z.string(),
      status: z.enum(['accepted', 'accepted-with-warning', 'rejected']),
    })
  ),
  nextEventNumber: count,
});
export const gameSnapshotSchema = z.object({
  revision: count,
  table: tableSchema,
  versions: z.record(z.string(), count),
  phase: count,
});
export type DurableTable = z.infer<typeof tableSchema>;
export type GameSnapshot = z.infer<typeof gameSnapshotSchema>;

const publicIdentitySchema = z.object({
  connectionId: id,
  viewerSeat: faction,
  displayName: z.string().max(160),
  color: z.string(),
});
const viewerSchema = publicIdentitySchema.extend({ userId: id });
export type Viewer = z.infer<typeof viewerSchema>;
const carrySchema = publicIdentitySchema.extend({
  id,
  held: pieceSchema,
  withdrawnCounts: z.record(z.string(), count),
  reservedIds: z.array(id),
  expiresAt: count,
});
const pointerSchema = publicIdentitySchema.extend({ position, updatedAt: count });
export type PublicCarry = z.infer<typeof carrySchema>;
export type PublicPointer = z.infer<typeof pointerSchema>;

const pieceActionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('split'), pieceId: id, count: z.number().int().min(1).max(100) }),
  z.strictObject({ kind: z.literal('stack'), pieceId: id }),
  z.strictObject({ kind: z.literal('flip'), pieceId: id }),
  z.strictObject({ kind: z.literal('lock'), pieceId: id }),
  z.strictObject({ kind: z.literal('rotate'), pieceId: id, direction }),
  z.strictObject({ kind: z.literal('storm'), direction }),
  z.strictObject({ kind: z.literal('enforcement'), policy }),
  z.strictObject({ kind: z.literal('phase') }),
  z.strictObject({ kind: z.literal('reset') }),
]);
export type PieceAction = z.infer<typeof pieceActionSchema>;
export const clientMessageSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('admit'), ticket: z.string().regex(/^[a-f0-9]{64}$/) }),
  z.strictObject({
    type: z.literal('begin'),
    carryId: id,
    sourcePieceId: id,
    expectedVersion: count,
    pickup: z.enum(['top', 'whole']),
  }),
  z.strictObject({ type: z.literal('pose'), carryId: id, seq: count, position, orientation }),
  z.strictObject({ type: z.literal('pointer'), seq: count, position: position.nullable() }),
  z.strictObject({ type: z.literal('take'), requestId: id, carryId: id, donorPieceId: id }),
  z.strictObject({ type: z.literal('drop'), commandId: id, carryId: id, position, orientation }),
  z.strictObject({ type: z.literal('cancel'), carryId: id }),
  z.strictObject({ type: z.literal('renew'), carryId: id }),
  z.strictObject({ type: z.literal('command'), commandId: id, action: pieceActionSchema, expectedRevision: count }),
  z.strictObject({ type: z.literal('history'), step: count }),
  z.strictObject({ type: z.literal('metrics') }),
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;
export const serverMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('admission'), status: z.enum(['suspended', 'denied']) }),
  z.object({ type: z.literal('carry'), carryId: id, draft: draftSchema }),
  z.object({
    type: z.literal('view'),
    viewer: viewerSchema,
    epoch: id,
    snapshot: gameSnapshotSchema,
    carries: z.array(carrySchema),
    pointers: z.array(pointerSchema),
    completedCommandId: id.optional(),
  }),
  z.object({ type: z.literal('activity'), epoch: id, carries: z.array(carrySchema), pointers: z.array(pointerSchema) }),
  z.object({ type: z.literal('rejected'), requestId: id, message: z.string() }),
  z.object({ type: z.literal('history'), step: count, lastStep: count, snapshot: gameSnapshotSchema }),
  z.object({
    type: z.literal('metrics'),
    revision: count,
    historySteps: count,
    receiptCount: count,
    motionReceived: count,
    motionForwarded: count,
    messagesSent: count,
    bytesSent: count,
  }),
]);
export type ServerMessage = z.infer<typeof serverMessageSchema>;
export function tableForViewer(snapshot: GameSnapshot, viewerSeat: Viewer['viewerSeat']): TableState {
  return { ...snapshot.table, viewerSeat, selectedPieceId: null, draftMove: null };
}
export function carryPieceId(carryId: string): string {
  return `carry-${carryId}`;
}
