import { z } from 'zod';

import { HistoricalFactionPublicationObject, TroopArtwork } from '../factions/schema';
import { playStageSchema } from './admission';
import {
  battleActionSchema,
  publicBattleSchema,
  battlePlanSchema,
  battleResultSchema,
  battleFaceSchema,
} from './battle';
import { biddingActionSchema, biddingStateSchema } from './bidding';
import { conversationMessageSchema, conversationSummarySchema, conversationTextSchema } from './conversations';
import { draftActionSchema, draftStateSchema } from './drafting';
import { publicControlsSchema, publicActionSchema, spawnSelectionSchema, spawnContentsSchema } from './inventory';
import { logEntrySchema, logTabSchema } from './log';
import type { TableState } from './model';
import { seatActionSchema } from './participation';
import { peekActionSchema, peekSchema } from './peeking';
import { TABLE_PHASES } from './phases';
import type { TablePhaseId } from './phases';
import { removalActionSchema, removalVoteSchema } from './removal';
import { gameEndingSchema, gameResultSchema, resultActionSchema } from './result';
import {
  draftMoveSchema as draftSchema,
  durableTableSchema as tableSchema,
  tableCountSchema as count,
  tableSeatSchema as seat,
  tableIdSchema as id,
  tableOrientationSchema as orientation,
  tablePieceSchema as pieceSchema,
  tablePositionSchema as position,
  tableRosterSchema as roster,
  rosterSeat,
} from './schema';
import { setupActionSchema, setupStateSchema, predictionsSchema } from './setup';
import { spiceReserveActionSchema, spiceReserveSchema, spiceTransferSchema } from './spiceReserve';
import { swapActionSchema, swappingStateSchema } from './swapping';

const factionArtworkSchema = z.record(
  z.string(),
  HistoricalFactionPublicationObject.pick({ background: true, logo: true }).extend({ troops: z.array(TroopArtwork) })
);

const phaseEntrySchema = z.object({
  id: z.string().max(400),
  label: z.string().max(160),
  symbol: z.string().max(2048),
  instructions: z.string().max(8000),
  allPlayersMustBeReady: z.boolean(),
  kind: z.enum(['standard', 'faction']),
  factionId: z.string().max(200).optional(),
  before: z.enum(TABLE_PHASES.map((entry) => entry.id) as [TablePhaseId, ...TablePhaseId[]]).optional(),
});

const direction = z.union([z.literal(-1), z.literal(1)]);

export const gameSnapshotSchema = z.object({
  revision: count,
  table: tableSchema,
  versions: z.record(z.string(), count),
  phase: count,
  /*
   * The turn as composed from the seated factions' declarations (#1138), in the order the storm marker gives now.
   * Absent on fixtures, whose turn is the standard nine phases.
   */
  phases: z.array(phaseEntrySchema).optional(),
  /* Absent on the local demo and on snapshots a room stored before it fixed its seating. */
  roster: roster.optional(),
  /* Absent on fixtures, which have no lifecycle; a real game carries its stage from creation. */
  stage: playStageSchema.optional(),
  /* The public draft while a real game drafts; gone once seats are dealt. */
  draft: draftStateSchema.optional(),
  swapping: swappingStateSchema.optional(),
  setup: setupStateSchema.optional(),
  predictions: predictionsSchema.optional(),
  removalVotes: z.array(removalVoteSchema).optional(),
  /* Who is determining the winner during Mentat pause, then the declared result once finished. */
  ending: gameEndingSchema.nullable().optional(),
  result: gameResultSchema.nullable().optional(),
  controls: publicControlsSchema.optional(),
  /* The glossary term is "spice reserve" (see CONTEXT.md); the `bank` field is kept for the protocol and recorded frames. */
  bank: spiceReserveSchema.optional(),
  /* The bidder during the Bidding phase; absent until a game first reaches it. */
  bidding: biddingStateSchema.optional(),
  battle: publicBattleSchema.nullable().optional(),
  battlePlan: battlePlanSchema.nullable().optional(),
  hand: z.array(pieceSchema).optional(),
  /* The piece the viewer's faction is peeking at, faces showing; no other viewer's frame carries it. */
  peek: peekSchema.nullable().optional(),
  factionArtwork: factionArtworkSchema.optional(),
  /* Wire key, kept as `combatFaces` for clients and recordings; the glossary says battle. */
  combatFaces: z.record(z.string(), z.array(battleFaceSchema)).optional(),
  battleResults: z.array(battleResultSchema).optional(),
  spiceTransfers: z.array(spiceTransferSchema).optional(),
});
export type DurableTable = z.infer<typeof tableSchema>;
export type GameSnapshot = z.infer<typeof gameSnapshotSchema>;

const publicIdentitySchema = z.object({
  connectionId: id,
  viewerSeat: seat,
  displayName: z.string().max(160),
  avatarUrl: z.string().max(2048).nullable().optional(),
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

const tableActionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('split'), pieceId: id, count: z.number().int().min(1).max(100) }),
  z.strictObject({ kind: z.literal('stack'), pieceId: id }),
  z.strictObject({ kind: z.literal('flip'), pieceId: id }),
  z.strictObject({ kind: z.literal('lock'), pieceId: id }),
  z.strictObject({ kind: z.literal('rotate'), pieceId: id, direction }),
  z.strictObject({ kind: z.literal('storm'), direction }),
  z.strictObject({ kind: z.literal('phase'), direction: direction.optional() }),
  z.strictObject({ kind: z.literal('turn'), turn: count.min(1) }),
  z.strictObject({ kind: z.literal('spice-spawn'), count: z.number().int().min(1).max(10) }),
  z.strictObject({ kind: z.literal('reset') }),
]);
export type TableAction = z.infer<typeof tableActionSchema>;
const deckActionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('deck-draw'), pieceId: id, recipient: id.optional() }),
  z.strictObject({ kind: z.literal('deck-shuffle'), pieceId: id }),
]);
export type DeckAction = z.infer<typeof deckActionSchema>;
const pieceActionSchema = z.discriminatedUnion('kind', [
  ...battleActionSchema.options,
  ...biddingActionSchema.options,
  ...spiceReserveActionSchema.options,
  ...publicActionSchema.options,
  ...seatActionSchema.options,
  ...removalActionSchema.options,
  ...resultActionSchema.options,
  ...draftActionSchema.options,
  ...swapActionSchema.options,
  ...setupActionSchema.options,
  ...tableActionSchema.options,
  ...deckActionSchema.options,
  ...peekActionSchema.options,
]);
export type PieceAction = z.infer<typeof pieceActionSchema>;
export const clientMessageSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('conversation-history'), requestId: id, factionId: id, peerId: id, before: count }),
  z.strictObject({
    type: z.literal('conversation-send'),
    requestId: id,
    factionId: id,
    peerId: id,
    text: conversationTextSchema,
  }),
  z.strictObject({ type: z.literal('conversation-read'), requestId: id, factionId: id, peerId: id, through: count }),
  z.strictObject({
    type: z.literal('admit'),
    ticket: z.string().regex(/^[a-f0-9]{64}$/),
    /* The connection this page held before it reconnected, which the Worker retires once this one is admitted. */
    replaces: id.optional(),
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
  z.strictObject({ type: z.literal('log-history'), tab: logTabSchema, before: count }),
  z.strictObject({ type: z.literal('metrics') }),
  z.strictObject({ type: z.literal('sync') }),
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;
/* The keys a change carries whole; revision, phase, table and versions have change fields of their own. */
const snapshotStateSchema = gameSnapshotSchema.omit({ revision: true, phase: true, table: true, versions: true });
export const snapshotStateKeys = snapshotStateSchema.keyof().options;
type SnapshotStateShape = typeof snapshotStateSchema.shape;
/* Absent means unchanged; null means the key has no value in the next frame. */
const stateChangeShape = Object.fromEntries(
  snapshotStateKeys.map((key) => [key, snapshotStateSchema.shape[key].nullable().optional()])
) as { [Key in keyof SnapshotStateShape]: z.ZodOptional<z.ZodNullable<SnapshotStateShape[Key]>> };
const snapshotChangeSchema = z.object({
  baseRevision: count,
  revision: count,
  phase: count,
  ...stateChangeShape,
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
    type: z.literal('conversations'),
    generation: count,
    factionId: id,
    entries: z.array(conversationSummarySchema),
  }),
  z.object({ type: z.literal('conversation-message'), factionId: id, peerId: id, message: conversationMessageSchema }),
  z.object({
    type: z.literal('conversation-history'),
    requestId: id,
    factionId: id,
    peerId: id,
    before: count,
    entries: z.array(conversationMessageSchema),
    more: z.boolean(),
  }),
  z.object({
    type: z.literal('log-history'),
    tab: logTabSchema,
    before: count,
    entries: z.array(logEntrySchema),
    more: z.boolean(),
  }),
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
    /* The room's newest history step, so playback offers the steps saved while a viewer looks back. */
    historySteps: count.optional(),
    sequence: count.optional(),
    viewer: viewerSchema,
    epoch: id,
    snapshot: gameSnapshotSchema,
    carries: z.array(carrySchema),
    pointers: z.array(pointerSchema),
    completedCommandId: id.optional(),
  }),
  z.object({
    type: z.literal('update'),
    phaseCooldownMs: count.optional(),
    battleCountdownMs: count.optional(),
    historySteps: count.optional(),
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
    /* Pointer and pose frames dropped because their sender's motion bucket was empty. */
    motionDropped: count.optional(),
    activityDeliveries: count.optional(),
    messagesSent: count,
    bytesSent: count,
    /*
     * The requester's own recent saved commands, with when the room began handling each by its clock
     * and when the storage write it made was confirmed durable.
     */
    commands: z.array(z.object({ commandId: id, handledAt: count, durableAt: count.optional() })).optional(),
    /* Recent moments the room's one-second sweep ran late, by the room's clock. */
    stalls: z.array(z.object({ at: count, lateMs: count })).optional(),
  }),
]);
export type ServerMessage = z.infer<typeof serverMessageSchema>;
/**
 * The code the Worker closes a socket with when its ticket lapsed or was already redeemed before admission.
 * Unlike a refusal it is not final: the browser requests a new ticket and reconnects.
 */
export const TICKET_EXPIRED_CLOSE_CODE = 4410;
/**
 * The standard "try again later" code the Worker closes a socket with when Convex could not be reached during admission.
 * Nothing was refused: the browser requests a new ticket and reconnects, with the same doubling wait as an expired ticket.
 */
export const ADMISSION_UNAVAILABLE_CLOSE_CODE = 1013;
/*
 * Cloudflare closes a WebSocket that carries nothing for 100 seconds, so every client sends this frame while its socket is open.
 * The room answers it without waking, and a client ignores the answer.
 */
export const KEEPALIVE_PING = 'ping';
export const KEEPALIVE_PONG = 'pong';
export const KEEPALIVE_INTERVAL_MS = 30_000;
/**
 * The Worker's wall clock at send, stamped on every frame but `admission`.
 * It sits beside the message rather than in it: an update copies its base view, so a stamp inside the view would go stale.
 */
export const serverClockSchema = z.object({ serverNow: count });
export type ServerClock = z.infer<typeof serverClockSchema>;
/** Each seated faction's display name by its id, as the roster fixed it. */
export function rosterFactionNames(roster: GameSnapshot['roster']): TableState['factionNames'] {
  return Object.fromEntries(
    roster?.seats.flatMap(({ faction }) => (faction ? [[faction.id, faction.name]] : [])) ?? []
  );
}
export function tableForViewer(snapshot: GameSnapshot, viewerSeat: Viewer['viewerSeat']): TableState {
  return {
    ...snapshot.table,
    viewerSeat,
    viewerFaction: rosterSeat(snapshot.roster, viewerSeat)?.faction?.id ?? null,
    factionNames: rosterFactionNames(snapshot.roster),
    selectedPieceId: null,
    draftMove: null,
  };
}
export function carryPieceId(carryId: string): string {
  return `carry-${carryId}`;
}
