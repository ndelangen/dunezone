import { z } from 'zod';

import { TABLE_SEAT_COUNTS, TABLE_SECTOR_COUNT } from './tableSettings';

export const tableIdSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,160}$/);
export const tableCountSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const tablePositionSchema = z.tuple([
  z.number().min(-30).max(30),
  z.number().min(-30).max(30),
  z.number().min(-30).max(30),
]);
export const tableOrientationSchema = z.number().min(-100_000).max(100_000);

/** A viewer without a seat. Spectators watch; they never own, ready or publish. */
export const SPECTATOR_SEAT = 'neutral';
/** A piece no faction owns: decks, the spice disc, anything in the shared inventory. */
const SHARED_OWNER = 'shared';
const RESERVED_WORDS: ReadonlySet<string> = new Set([SPECTATOR_SEAT, SHARED_OWNER]);
/*
 * Seats and factions are identified by opaque strings the game assigned: a real game numbers its
 * seats and carries catalogue faction ids, the fixtures name theirs after the two houses they seat.
 * The two reserved words above are never identities, so a sentinel can never collide with a faction.
 */
export const tableIdentitySchema = tableIdSchema.refine((value) => !RESERVED_WORDS.has(value), {
  message: 'A reserved word is not a seat or faction identity.',
});
export const tableSeatSchema = z.union([z.literal(SPECTATOR_SEAT), tableIdentitySchema]);
const tableOwnerSchema = z.union([z.literal(SHARED_OWNER), tableIdentitySchema]);

export const tableSeatCountSchema = z.literal([...TABLE_SEAT_COUNTS]);
/*
 * The seating a game fixed: every seat's station around the rim and the faction it carries.
 * Occupancy is not here; the public controls list the seats a current player holds.
 * The faction's display name is presentation only and may repeat; its id is the identity.
 */
function distinct<T>(values: T[]) {
  return new Set(values).size === values.length;
}
export const tableRosterSchema = z
  .object({
    seatCount: tableSeatCountSchema,
    seats: z.array(
      z.object({
        id: tableIdentitySchema,
        position: z
          .number()
          .int()
          .min(0)
          .max(TABLE_SECTOR_COUNT - 1),
        faction: z.object({ id: tableIdentitySchema, name: z.string().max(160), color: z.string() }).nullable(),
      })
    ),
  })
  .refine((roster) => roster.seats.every((seat) => seat.position < roster.seatCount), {
    message: 'Every seat sits at a station below the count.',
  })
  .refine(
    (roster) =>
      distinct(roster.seats.map((seat) => seat.id)) &&
      distinct(roster.seats.map((seat) => seat.position)) &&
      distinct(roster.seats.flatMap((seat) => (seat.faction ? [seat.faction.id] : []))),
    { message: 'Seats, stations and factions are each held once.' }
  );
export type TableRoster = z.infer<typeof tableRosterSchema>;

/** The seat a roster names by this id, if any. */
export function rosterSeat(roster: TableRoster | undefined, seatId: string) {
  return roster?.seats.find((seat) => seat.id === seatId);
}

export const tablePieceSchema = z.object({
  id: tableIdSchema,
  label: z.string(),
  owner: tableOwnerSchema,
  color: z.string(),
  accent: z.string(),
  items: z.array(
    z.object({
      id: tableIdSchema,
      faceUp: z.boolean(),
      artwork: z
        .object({
          front: z.string().url().optional(),
          back: z.string().url(),
          name: z.string().optional(),
          type: z.string(),
        })
        .optional(),
    })
  ),
  inventory: z.literal('shared').optional(),
  battleOverlay: tableIdSchema.optional(),
  stackKey: z.string().nullable(),
  position: tablePositionSchema,
  orientation: tableOrientationSchema,
  /* Counts explicit flips, so rendering can distinguish them from other item changes. */
  flipRevision: tableCountSchema.optional(),
  /* A committed shuffle restarts its scene animation without exposing the order. */
  shuffleRevision: tableCountSchema.optional(),
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
});

const tableEventSchema = z.object({
  id: tableIdSchema,
  command: z.string(),
  message: z.string(),
  status: z.enum(['accepted', 'rejected']),
});

export const durableTableSchema = z.object({
  phase: z.literal('Harkonnen shipment'),
  stormSectorIndex: tableCountSchema,
  pieces: z.array(tablePieceSchema),
  events: z.array(tableEventSchema),
  nextEventNumber: tableCountSchema,
});
