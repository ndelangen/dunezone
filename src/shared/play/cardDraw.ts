import { z } from 'zod';

import { factionTokenOf, factionTokenRingPose } from './factionToken';
import type { GameSnapshot, PieceAction } from './protocol';
import { tableCountSchema, tableIdSchema, tableOrientationSchema, tablePositionSchema } from './schema';
import { stackTopHeight, TABLE_SURFACE_Y } from './tableGeometry';
import { tableSeatAngles } from './tableSettings';

/** A committed public draw, with no card identity or face to connect to the recipient's hand. */
export const cardDrawSchema = z.strictObject({
  epoch: tableIdSchema,
  revision: tableCountSchema,
  recipient: tableIdSchema,
  count: z.literal([1, 4]),
  back: z.string().url().optional(),
  from: tablePositionSchema,
  orientation: tableOrientationSchema,
  to: tablePositionSchema,
  color: z.string(),
});

export type CardDraw = z.infer<typeof cardDrawSchema>;

/** Capture the public source before a draw can remove its last card. Callers publish only after acceptance. */
export function describeCardDraw(
  snapshot: Pick<GameSnapshot, 'table' | 'roster'>,
  action: PieceAction,
  actingFaction: string | undefined
): Omit<CardDraw, 'epoch' | 'revision'> | undefined {
  if (action.kind !== 'deck-draw') {
    return;
  }
  const recipient = action.recipient ?? actingFaction;
  const seat = snapshot.roster?.seats.find((entry) => entry.faction?.id === recipient);
  const deck = snapshot.table.pieces.find((piece) => piece.id === action.pieceId);
  if (!recipient || !seat?.faction || !deck || deck.kind !== 'card' || !deck.items.length) {
    return;
  }
  const token = factionTokenOf(snapshot.table.pieces, recipient);
  /* Legacy tables without faction tokens still identify the recipient's station. */
  const destination = token ?? factionTokenRingPose(tableSeatAngles(snapshot.roster!.seatCount)[seat.position]!);
  const [x, y, z] = deck.position;
  const [tx, ty, tz] = destination.position;
  /* All flights use the visible deck's back, even when the cards below it have different backs. */
  const back = deck.items.at(-1)?.artwork?.back;
  return {
    recipient,
    count: action.count ?? 1,
    ...(back && { back }),
    from: [x, y + stackTopHeight(deck), z],
    orientation: deck.orientation,
    to: [tx, ty + (token ? stackTopHeight(token) : TABLE_SURFACE_Y), tz],
    color: seat.faction.color,
  };
}
