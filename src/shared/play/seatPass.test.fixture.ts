import type { SeatPassPayload } from './seatPass';
import { signSeatPass } from './seatPass';

/** A pass for a synthetic player of game `game`, signed with a test secret, ending at `exp`. */
export function testSeatPass(exp: number, overrides: Partial<SeatPassPayload> = {}) {
  return signSeatPass('a'.repeat(64), {
    v: 1,
    gameId: 'game',
    actorId: 'user',
    principalId: 'user',
    sessionId: 'session',
    sessionCreatedAt: 0,
    issuedAt: Date.now(),
    exp,
    displayName: 'Player',
    avatarUrl: null,
    profileSlug: null,
    ...overrides,
  });
}
