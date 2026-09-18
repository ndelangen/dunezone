import { z } from 'zod';

import { playStageSchema } from './admission';
import { tableSeatCountSchema } from './schema';
import { TABLE_SEAT_COUNTS } from './tableSettings';

/*
 * The directory summary: what a game tells Convex about itself so the lobby can list it.
 * The game database owns gameplay; this is its permitted projection, ordered by a sequence the
 * game assigns, so a delayed delivery can never overwrite a newer one. Nothing private travels
 * here: no hands, banks, predictions, plans, messages, seat history or events.
 */

export const PLAY_PUBLISH_SUMMARY_FUNCTION = 'playDirectory:publishSummary';
/** Retry cadence for an undelivered summary: doubles from the base to the ceiling, then holds. */
export const PLAY_DIRECTORY_RETRY_MS = 2000;
export const PLAY_DIRECTORY_RETRY_CEILING_MS = 30_000;
/** Activity alone earns a new summary at most this often; a change to stage, seats, phase or result always does. */
export const PLAY_DIRECTORY_ACTIVITY_MS = 60_000;

const identifierSchema = z.string().min(1).max(128);
const timestampSchema = z.number().finite().nonnegative();

/** One seated player as the lobby may show them: the seat, who holds it and the faction once publicly assigned. */
const summarySeatSchema = z.object({
  seat: identifierSchema,
  userId: identifierSchema,
  faction: z.object({ id: identifierSchema, name: z.string().max(160), color: z.string().max(32) }).nullable(),
});

/** The declared result while a game is finished; absent otherwise. */
const playResultSchema = z.object({
  kind: z.enum(['faction', 'alliance', 'none']),
  factionIds: z.array(identifierSchema).max(TABLE_SEAT_COUNTS[TABLE_SEAT_COUNTS.length - 1]!),
  declaredBy: identifierSchema,
  declaredAt: timestampSchema,
});

export const playDirectorySummarySchema = z.object({
  stage: playStageSchema,
  seatCount: tableSeatCountSchema,
  seats: z.array(summarySeatSchema).max(TABLE_SEAT_COUNTS[TABLE_SEAT_COUNTS.length - 1]!),
  /* The phase index during play; the lobby derives the turn and phase name from it. */
  phase: z.number().int().nonnegative().nullable(),
  lastActivityAt: timestampSchema,
  result: playResultSchema.nullable(),
});
export type PlayDirectorySummary = z.infer<typeof playDirectorySummarySchema>;

export const playPublishSummaryRequestSchema = z.strictObject({
  gameId: identifierSchema,
  secret: z.string().regex(/^[0-9a-f]{64}$/),
  sequence: z.number().int().positive(),
  summary: playDirectorySummarySchema,
});
/** The acknowledged sequence is the newest Convex holds; a stale or duplicate delivery is acknowledged without effect. */
export const playPublishSummaryResultSchema = z.union([
  z.object({ ok: z.literal(false) }),
  z.object({ ok: z.literal(true), sequence: z.number().int().nonnegative() }),
]);

/** One lobby entry: what the directory may show about a game to a viewer allowed to enter it. */
export const playLobbyEntrySchema = z.object({
  gameId: identifierSchema,
  name: z.string(),
  stage: playStageSchema,
  seatsFilled: z.number().int().nonnegative(),
  seatCount: z.number().int().positive(),
  viewerSeated: z.boolean(),
  players: z.array(z.object({ displayName: z.string(), faction: z.string().nullable() })),
  phase: z.number().int().nonnegative().nullable(),
  lastActivityAt: timestampSchema,
  /* The declared result with its factions named from the summary's seats; no user id reaches the lobby. */
  result: z.object({ kind: playResultSchema.shape.kind, factions: z.array(z.string()) }).nullable(),
});
export const playLobbySchema = z.union([
  z.object({ status: z.literal('sign_in_required') }),
  z.object({ status: z.literal('not_authorized') }),
  z.object({
    status: z.literal('ready'),
    ongoing: z.array(playLobbyEntrySchema),
    past: z.array(playLobbyEntrySchema),
  }),
]);
