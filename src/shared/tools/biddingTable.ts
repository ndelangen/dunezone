import { z } from 'zod';

/*
 * The IRL bidding tool's table link (Norbert, 2026-11-09: no sound, no Convex; one Cloudflare object per table, with a
 * websocket, and the phones talking to the tablet directly once they are introduced). The tablet opens a table under a
 * short code; phones join it by scanning the tablet's QR code. The table object only passes messages along: it keeps
 * nothing, and forgets the table when everyone has left.
 */

/** Table codes: six letters and digits that cannot be misread for each other. */
export const TABLE_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const TABLE_CODE_LENGTH = 6;
export const tableCodeSchema = z
  .string()
  .length(TABLE_CODE_LENGTH)
  .regex(new RegExp(`^[${TABLE_CODE_ALPHABET}]+$`));

/** A table's socket: `/__play/bidding/<code>/<role>/<client id>/socket` (the game worker takes no query strings). */
export const BIDDING_SOCKET_PREFIX = '/__play/bidding/';
export const biddingSocketPath = (code: string, role: TableRole, clientId: string) =>
  `${BIDDING_SOCKET_PREFIX}${code}/${role}/${clientId}/socket`;
export const biddingSocketPattern = /^\/__play\/bidding\/([^/]+)\/(tablet|phone)\/([a-z0-9-]{8,40})\/socket$/;

export type TableRole = 'tablet' | 'phone';
export const clientIdSchema = z.string().regex(/^[a-z0-9-]{8,40}$/);

/** Most phones a table takes, and the most a message may carry. */
export const TABLE_PHONE_LIMIT = 24;
export const TABLE_FRAME_LIMIT = 16_384;

/** What a client asks the table object to pass on: to the tablet, to one phone, or to every phone. */
export const relayOutSchema = z.object({
  to: z.union([z.literal('tablet'), z.literal('phones'), clientIdSchema]),
  data: z.unknown(),
});
export type RelayOut = z.infer<typeof relayOutSchema>;

/** What the table object hands a client: a message passed on, or who is there. */
export type RelayIn =
  | Readonly<{ type: 'message'; from: string; data: unknown }>
  /** For the tablet: the phones connected now. For a phone: whether the tablet is. */
  | Readonly<{ type: 'presence'; tablet: boolean; phones: readonly string[] }>;
