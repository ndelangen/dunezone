import { z } from 'zod';

import { playStageSchema } from './admission';
import { bankActionSchema, factionBankSchema, spiceTransferSchema } from './banks';
import {
  battleActionSchema,
  publicBattleSchema,
  battlePlanSchema,
  battleResultSchema,
  combatFaceSchema,
} from './battle';
import { draftActionSchema, draftStateSchema } from './drafting';
import { publicControlsSchema, publicActionSchema, spawnSelectionSchema, spawnContentsSchema } from './inventory';
import type { TableState } from './model';
import { seatActionSchema } from './participation';
import { phaseAt } from './phases';
import {
  draftMoveSchema as draftSchema,
  durableTableSchema as tableSchema,
  enforcementPolicySchema as policy,
  tableCountSchema as count,
  tableSeatSchema as seat,
  tableIdSchema as id,
  tableOrientationSchema as orientation,
  tablePieceSchema as pieceSchema,
  tablePositionSchema as position,
  tableRosterSchema as roster,
  rosterSeat,
} from './schema';
import { swapActionSchema, swappingStateSchema } from './swapping';

const direction = z.union([z.literal(-1), z.literal(1)]);

export const gameSnapshotSchema = z.object({
  revision: count,
  table: tableSchema,
  versions: z.record(z.string(), count),
  phase: count,
  /* Absent on the local demo and on snapshots a room stored before it fixed its seating. */
  roster: roster.optional(),
  /* Absent on fixtures, which have no lifecycle; a real game carries its stage from creation. */
  stage: playStageSchema.optional(),
  /* The public draft while a real game drafts; gone once seats are dealt. */
  draft: draftStateSchema.optional(),
  swapping: swappingStateSchema.optional(),
  controls: publicControlsSchema.optional(),
  bank: factionBankSchema.optional(),
  battle: publicBattleSchema.nullable().optional(),
  battlePlan: battlePlanSchema.nullable().optional(),
  hand: z.array(pieceSchema).optional(),
  combatFaces: z.record(z.string(), z.array(combatFaceSchema)).optional(),
  battleResults: z.array(battleResultSchema).optional(),
  spiceTransfers: z.array(spiceTransferSchema).optional(),
});
export type DurableTable = z.infer<typeof tableSchema>;
export type GameSnapshot = z.infer<typeof gameSnapshotSchema>;

const publicIdentitySchema = z.object({
  connectionId: id,
  viewerSeat: seat,
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
  sourceSeq: z.number().int().min(-1).optional(),
});
const pointerSchema = publicIdentitySchema.extend({ position, updatedAt: count, sourceSeq: count.optional() });
export type PublicCarry = z.infer<typeof carrySchema>;
export type PublicPointer = z.infer<typeof pointerSchema>;

const pieceActionSchema = z.discriminatedUnion('kind', [
  ...battleActionSchema.options,
  ...bankActionSchema.options,
  ...publicActionSchema.options,
  ...seatActionSchema.options,
  ...draftActionSchema.options,
  ...swapActionSchema.options,
  z.strictObject({ kind: z.literal('split'), pieceId: id, count: z.number().int().min(1).max(100) }),
  z.strictObject({ kind: z.literal('deck-draw'), pieceId: id, recipient: id.optional() }),
  z.strictObject({ kind: z.literal('deck-shuffle'), pieceId: id }),
  z.strictObject({ kind: z.literal('stack'), pieceId: id }),
  z.strictObject({ kind: z.literal('flip'), pieceId: id }),
  z.strictObject({ kind: z.literal('lock'), pieceId: id }),
  z.strictObject({ kind: z.literal('rotate'), pieceId: id, direction }),
  z.strictObject({ kind: z.literal('storm'), direction }),
  z.strictObject({ kind: z.literal('enforcement'), policy }),
  z.strictObject({ kind: z.literal('phase'), direction: direction.optional() }),
  z.strictObject({ kind: z.literal('turn'), turn: count.min(1) }),
  z.strictObject({ kind: z.literal('spice-spawn'), count: z.number().int().min(1).max(10) }),
  z.strictObject({ kind: z.literal('reset') }),
]);
export type PieceAction = z.infer<typeof pieceActionSchema>;
export const clientMessageSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('admit'),
    ticket: z.string().regex(/^[a-f0-9]{64}$/),
    updates: z.literal(2).optional(),
  }),
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
  z.strictObject({ type: z.literal('catalogue'), requestId: id, selection: spawnSelectionSchema.optional() }),
  z.strictObject({ type: z.literal('history'), step: count }),
  z.strictObject({ type: z.literal('spice-history'), before: count }),
  z.strictObject({ type: z.literal('metrics') }),
  z.strictObject({ type: z.literal('sync'), pieceMoves: z.literal(true).optional() }),
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;
const snapshotChangeSchema = z.object({
  baseRevision: count,
  revision: count,
  phase: count,
  roster: roster.optional(),
  stage: playStageSchema.optional(),
  /* Null when the draft ended with this change; absent when it did not change. */
  draft: draftStateSchema.nullable().optional(),
  swapping: swappingStateSchema.optional(),
  controls: publicControlsSchema.optional(),
  bank: factionBankSchema.optional(),
  battle: publicBattleSchema.nullable().optional(),
  battlePlan: battlePlanSchema.nullable().optional(),
  hand: z.array(pieceSchema).optional(),
  combatFaces: z.record(z.string(), z.array(combatFaceSchema)).optional(),
  battleResults: z.array(battleResultSchema).optional(),
  spiceTransfers: z.array(spiceTransferSchema).optional(),
  table: tableSchema.omit({ pieces: true }).partial(),
  pieces: z.array(pieceSchema),
  pieceMoves: z
    .array(
      pieceSchema
        .pick({ id: true, position: true, orientation: true, zoneId: true })
        .extend({ flipRevision: count.nullable() })
    )
    .optional(),
  removedPieces: z.array(id),
  pieceOrder: z.array(id).optional(),
  versions: z.record(z.string(), count),
  removedVersions: z.array(id),
});
const activityChangeSchema = z.object({
  carries: z.array(carrySchema),
  carryMoves: z.array(
    z.object({ id, position, orientation, expiresAt: count, sourceSeq: z.number().int().min(-1).optional() })
  ),
  removedCarries: z.array(id),
  pointers: z.array(pointerSchema),
  pointerMoves: z.array(z.object({ connectionId: id, position, updatedAt: count, sourceSeq: count.optional() })),
  removedPointers: z.array(id),
});
export type SnapshotChange = z.infer<typeof snapshotChangeSchema>;
export type ActivityChange = z.infer<typeof activityChangeSchema>;
export const serverMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('spice-history'),
    before: count,
    entries: z.array(spiceTransferSchema),
    more: z.boolean(),
  }),
  z.object({
    type: z.literal('catalogue'),
    requestId: id,
    entries: z.array(spawnSelectionSchema.extend({ name: z.string() })).optional(),
    contents: spawnContentsSchema.nullable().optional(),
    error: z.string().optional(),
  }),
  z.object({ type: z.literal('admission'), status: z.enum(['suspended', 'denied']) }),
  z.object({ type: z.literal('carry'), carryId: id, draft: draftSchema }),
  z.object({
    type: z.literal('view'),
    phaseCooldownMs: count.optional(),
    battleCountdownMs: count.optional(),
    updates: z.literal(2).optional(),
    pieceMoves: z.literal(true).optional(),
    sequence: count.optional(),
    viewer: viewerSchema,
    epoch: id,
    snapshot: gameSnapshotSchema,
    carries: z.array(carrySchema),
    pointers: z.array(pointerSchema),
    completedCommandId: id.optional(),
  }),
  z.object({ type: z.literal('activity'), epoch: id, carries: z.array(carrySchema), pointers: z.array(pointerSchema) }),
  z.object({
    type: z.literal('update'),
    phaseCooldownMs: count.optional(),
    battleCountdownMs: count.optional(),
    epoch: id,
    baseSequence: count,
    sequence: count,
    snapshot: snapshotChangeSchema.optional(),
    activity: activityChangeSchema,
    completedCommandId: id.optional(),
  }),
  z.object({ type: z.literal('rejected'), requestId: id, message: z.string() }),
  z.object({ type: z.literal('history'), step: count, lastStep: count, snapshot: gameSnapshotSchema }),
  z.object({
    type: z.literal('metrics'),
    revision: count,
    historySteps: count,
    receiptCount: count,
    motionReceived: count,
    motionForwarded: count,
    activityDeliveries: count.optional(),
    messagesSent: count,
    bytesSent: count,
  }),
]);
export type ServerMessage = z.infer<typeof serverMessageSchema>;
export function tableForViewer(snapshot: GameSnapshot, viewerSeat: Viewer['viewerSeat']): TableState {
  return {
    ...snapshot.table,
    phase: phaseAt(snapshot.phase).label,
    viewerSeat,
    viewerFaction: rosterSeat(snapshot.roster, viewerSeat)?.faction?.id ?? null,
    selectedPieceId: null,
    draftMove: null,
  };
}
export function carryPieceId(carryId: string): string {
  return `carry-${carryId}`;
}
