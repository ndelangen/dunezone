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

/** The top bar's "Turn 4 of 6"; past the last turn the table plays on, so the count drops its "of". */
export function turnCaption(turn: number, lastTurn = DEFAULT_LAST_TURN): string {
  return turn <= lastTurn ? `Turn ${turn} of ${lastTurn}` : `Turn ${turn}`;
}
