import { z } from 'zod';

/** The standard game ends after turn 10 (#1007 gap 11); a table may agree on a shorter or longer game. */
export const DEFAULT_LAST_TURN = 10;
export const MIN_LAST_TURN = 1;
export const MAX_LAST_TURN = 20;
export const lastTurnSchema = z.number().int().min(MIN_LAST_TURN).max(MAX_LAST_TURN);

/** Setting the last turn only changes what the turn wheel shows: reaching it never stops play. */
export const lastTurnActionSchema = z.strictObject({ kind: z.literal('last-turn'), turn: lastTurnSchema });
export type LastTurnAction = z.infer<typeof lastTurnActionSchema>;

/** A game stored before the setting existed plays the standard ten turns. */
export function lastTurnOf(snapshot: Readonly<{ lastTurn?: number }>): number {
  return snapshot.lastTurn ?? DEFAULT_LAST_TURN;
}
