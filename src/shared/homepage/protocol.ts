import { z } from 'zod';

import { clientMessageSchema } from '../play/protocol';
import type { ClientMessage, PieceAction } from '../play/protocol';

export const HOMEPAGE_SOCKET_PATH = '/__play/homepage/socket';
export const HOMEPAGE_RESET_MS = 60 * 60 * 1000;
/*
 * Every renewal is a ticket issued and redeemed in Convex, so the lease is minutes rather than seconds. Renewals come at
 * under half the lease, so one failed renewal is covered by the next before the lease runs out. Sign-out elsewhere reaches
 * a member's open table at the latest when the lease runs out. The ticket itself stays short-lived: it only has to survive
 * the hop from the browser to the table.
 */
export const HOMEPAGE_LEASE_MS = 5 * 60_000;
export const HOMEPAGE_RENEW_MS = 2 * 60_000;
export const HOMEPAGE_TICKET_TTL_MS = 30_000;
export const HOMEPAGE_CONNECTION_LIMIT = 128;
export const HOMEPAGE_EDITOR_LIMIT = 24;
export const HOMEPAGE_FRAME_LIMIT = 2048;
export const homepageTicketSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const homepageAdmissionSchema = z.discriminatedUnion('allowed', [
  z.object({ allowed: z.literal(false) }),
  z.object({
    allowed: z.literal(true),
    userKey: z.string(),
    leaseUntil: z.number().finite(),
    avatarUrl: z.string().max(2048).nullable().optional(),
  }),
]);

/* The homepage grants physical table handling only. Game lifecycle and private content stay in Play. */
export type HomepageAction =
  | Extract<ClientMessage, { type: 'begin' | 'pose' | 'pointer' | 'take' | 'flip' | 'drop' | 'cancel' | 'renew' }>
  | (Extract<ClientMessage, { type: 'command' }> & {
      action: Extract<PieceAction, { kind: 'flip' | 'rotate' | 'split' | 'stack' }>;
    });

export function homepageCommandAllowed(kind: PieceAction['kind']) {
  return ['flip', 'rotate', 'split', 'stack'].includes(kind);
}

function allowed(message: ClientMessage): message is HomepageAction {
  return message.type === 'command'
    ? homepageCommandAllowed(message.action.kind)
    : ['begin', 'pose', 'pointer', 'take', 'flip', 'drop', 'cancel', 'renew'].includes(message.type);
}

export const homepageActionSchema = clientMessageSchema.transform((message, ctx) => {
  if (allowed(message)) {
    return message;
  }
  ctx.addIssue({ code: 'custom', message: 'This action is unavailable on the homepage table.' });
  return z.NEVER;
});

export const homepageMessageSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('authenticate'), ticket: homepageTicketSchema }),
  z.strictObject({ type: z.literal('anonymous') }),
  z.strictObject({ type: z.literal('sync') }),
  z.strictObject({ type: z.literal('act'), epoch: z.string().max(100), message: homepageActionSchema }),
]);
