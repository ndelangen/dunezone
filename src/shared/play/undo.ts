import { z } from 'zod';

/*
 * Undo: a player takes back their own last table move (a drop, split, stack, flip, rotate or lock),
 * as long as nobody has changed the table since and the phase is the same.
 * The room keeps only each player's latest move, in memory, so a restarted room has nothing to undo.
 */

export const undoActionSchema = z.strictObject({ kind: z.literal('undo') });
export type UndoAction = z.infer<typeof undoActionSchema>;

/** The table commands a player can take back; a drop is the other. */
export const UNDOABLE_KINDS: ReadonlySet<string> = new Set(['split', 'stack', 'flip', 'rotate', 'lock']);

export function isUndoAction<Action extends { kind: string }>(action: Action): action is Action & UndoAction {
  return action.kind === 'undo';
}

export const NOTHING_TO_UNDO = 'There is nothing to undo.';
export const UNDO_CROSSED = 'The table changed since your last move, so it can no longer be undone.';
