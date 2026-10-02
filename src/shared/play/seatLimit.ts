import { z } from 'zod';

import { playCreateGameResultSchema, playRedeemTicketResultSchema } from './admission';

/*
 * The seat limit and the answers that carry it live here rather than in admission.ts or participation.ts.
 * Both of those reach the publisher's capture bundle through the faction schema, so any byte changed in them changes Renderer identity and recaptures every published sheet.
 * This module is imported only by Convex, the game Worker and the Play routes.
 */

/**
 * The most games one player may be seated in at once.
 * A created game holds its creator's seat from creation;
 * a finished, discarded or expired game holds none.
 * Convex refuses a creation at the limit, and the game Worker refuses a seat request.
 */
export const PLAY_SEAT_LIMIT = 30;
export const PLAY_SEAT_LIMIT_MESSAGE = `You are already seated in ${PLAY_SEAT_LIMIT} games. For technical reasons that is the maximum, so to create or join a new game, leave a seat in another game first. If you think this limit is too low, contact the system administrator.`;
/** What the approving player reads when the requester is at the limit. */
export const PLAY_SEAT_LIMIT_APPROVAL_MESSAGE = `That player is already seated in ${PLAY_SEAT_LIMIT} games, the most one player may hold, so their request cannot be approved until they leave a seat in another game.`;

const [created, createRefused] = playCreateGameResultSchema.options;
/** A creation's answer: the admission contract's, plus the refusal at the seat limit. */
export const playCreateGameOutcomeSchema = z.union([
  created,
  z.object({ ok: z.literal(false), reason: z.enum([...createRefused.shape.reason.options, 'seat_limit']) }),
]);

const [redeemRefused, redeemAdmitted] = playRedeemTicketResultSchema.options;
/** A redemption's answer: the admission contract's, plus whether the player is at the seat limit. */
export const playRedeemTicketOutcomeSchema = z.union([
  redeemRefused,
  redeemAdmitted.extend({
    /*
     * True when the player already holds `PLAY_SEAT_LIMIT` seats in other games, so the room refuses their seat request.
     * Absent means not at the limit, which is also how a Convex deployment from before the limit answers.
     */
    seatLimitReached: z.boolean().optional(),
  }),
]);
