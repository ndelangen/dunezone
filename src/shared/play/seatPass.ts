import { z } from 'zod';

import { PLAY_DISPLAY_NAME_MAX_LENGTH, PLAY_PROFILE_SLUG_MAX_LENGTH } from './admission';

/*
 * A seat pass is a player's own proof of who they are at one game, signed by Convex with the game's secret and checked by the room alone.
 * It replaces the single-use ticket and the room's 90-second Convex checks: the room trusts the pass until it expires,
 * and Convex pushes the few events that must end it sooner (every session revoked, a merge, a deletion).
 * A pass is identity, never a seat: the room keeps owning seats, so giving one up takes effect at once with no Convex involved.
 * Decided with Norbert on 2026-10-17; docs/technical/play-hosted.md describes the lifetime.
 */

/* The longest a pass stays valid, and so the longest a lost revocation push leaves a copied pass usable (Norbert, 2026-10-17). */
export const PLAY_SEAT_PASS_TTL_MS = 60 * 60_000;
/* A browser renews a pass this long before it expires when no fresher one arrived on its own. */
export const PLAY_SEAT_PASS_RENEW_MS = 5 * 60_000;
/* Bounds the encoded pass, so a socket frame carrying one stays small. */
const PLAY_SEAT_PASS_MAX_LENGTH = 4096;

const identifier = z.string().min(1).max(128);
const timestamp = z.number().finite().nonnegative();

const seatPassPayloadSchema = z.strictObject({
  v: z.literal(1),
  gameId: identifier,
  /* The game actor the pass seats, which after a merge can differ from the account that signed in. */
  actorId: identifier,
  /* The signed-in account; account-wide revocation cutoffs apply to it. */
  principalId: identifier,
  sessionId: identifier,
  sessionCreatedAt: timestamp,
  issuedAt: timestamp,
  exp: timestamp,
  displayName: z.string().max(PLAY_DISPLAY_NAME_MAX_LENGTH),
  avatarUrl: z.string().max(2048).nullable(),
  profileSlug: z.string().min(1).max(PLAY_PROFILE_SLUG_MAX_LENGTH).nullable(),
});
export type SeatPassPayload = z.infer<typeof seatPassPayloadSchema>;

export const seatPassSchema = z
  .string()
  .max(PLAY_SEAT_PASS_MAX_LENGTH)
  .regex(/^[\w-]+\.[\w-]+$/);

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCodePoint(byte);
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function fromBase64Url(text: string) {
  const binary = atob(text.replaceAll('-', '+').replaceAll('_', '/'));
  return Uint8Array.from(binary, (character) => character.codePointAt(0)!);
}

function signingKey(secret: string, usage: 'sign' | 'verify') {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [usage]);
}

export async function signSeatPass(secret: string, payload: SeatPassPayload): Promise<string> {
  const body = encoder.encode(JSON.stringify(seatPassPayloadSchema.parse(payload)));
  const tag = new Uint8Array(await crypto.subtle.sign('HMAC', await signingKey(secret, 'sign'), body));
  return `${toBase64Url(body)}.${toBase64Url(tag)}`;
}

/** The payload of a pass this game's secret signed, or null for anything else: a forged, altered or malformed pass reads the same. */
export async function verifySeatPass(secret: string, pass: unknown): Promise<SeatPassPayload | null> {
  const parsed = seatPassSchema.safeParse(pass);
  if (!parsed.success) {
    return null;
  }
  const [body, tag] = parsed.data.split('.') as [string, string];
  try {
    const bytes = fromBase64Url(body);
    /* crypto.subtle.verify compares in constant time. */
    if (!(await crypto.subtle.verify('HMAC', await signingKey(secret, 'verify'), fromBase64Url(tag), bytes))) {
      return null;
    }
    const payload = seatPassPayloadSchema.safeParse(JSON.parse(decoder.decode(bytes)));
    return payload.success ? payload.data : null;
  } catch {
    return null;
  }
}

/** Reads a pass's payload without checking its signature, for the browser deciding when to renew; never for authorization. */
export function peekSeatPass(pass: string): SeatPassPayload | null {
  try {
    const parsed = seatPassPayloadSchema.safeParse(JSON.parse(decoder.decode(fromBase64Url(pass.split('.')[0] ?? ''))));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
