import { z } from 'zod';

import { tableCountSchema } from './schema';

/**
 * The retained public log of a real game, as every viewer reads it: one sentence per public event with its classification and the turn or stage it happened in.
 * Game holds what happened on the table;
 * Audit holds who sat where and how votes ended.
 * Private cards, unrevealed plans, bank balances and conversations never enter it.
 */
export const logTabSchema = z.enum(['game', 'audit']);
export type LogTab = z.infer<typeof logTabSchema>;

const logClassSchema = z.enum(['phase', 'spice', 'battle', 'prediction', 'seat', 'vote']);
export type LogClass = z.infer<typeof logClassSchema>;

/** Which tab each classification appears in; a class the log gains must choose one. */
export const LOG_CLASS_TABS = {
  phase: 'game',
  spice: 'game',
  battle: 'game',
  prediction: 'game',
  seat: 'audit',
  vote: 'audit',
} as const satisfies Record<LogClass, LogTab>;

export const LOG_PAGE_SIZE = 20;

export const logEntrySchema = z.object({
  sequence: tableCountSchema,
  class: logClassSchema,
  text: z.string(),
  /* Where it happened: a turn and phase in play, the setup step, or the stage before setup. */
  context: z.string(),
  at: tableCountSchema,
});
export type LogEntry = z.infer<typeof logEntrySchema>;
