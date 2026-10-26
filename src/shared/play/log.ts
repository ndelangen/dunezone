import { z } from 'zod';

import { tableCountSchema } from './schema';

/**
 * The retained public log of a real game, as every viewer reads it: one sentence per public event with its classification and the turn or stage it happened in.
 * Game holds what happened on the table;
 * Audit holds who sat where and how votes ended.
 * Private cards, unrevealed plans, spice reserve balances and conversations never enter the log text.
 * Bug report entries disclose that a public export of hidden gameplay was requested and link to the resulting issue.
 */
export const logTabSchema = z.enum(['game', 'audit']);
export type LogTab = z.infer<typeof logTabSchema>;

const logClassSchema = z.enum([
  'phase',
  'spice',
  'battle',
  'prediction',
  'alliance',
  'deletion',
  'seat',
  'vote',
  'bug-report',
]);
export type LogClass = z.infer<typeof logClassSchema>;

/** Which tab each classification appears in; a class the log gains must choose one. */
export const LOG_CLASS_TABS = {
  phase: 'game',
  spice: 'game',
  battle: 'game',
  prediction: 'game',
  alliance: 'game',
  deletion: 'game',
  seat: 'audit',
  vote: 'audit',
  'bug-report': 'game',
} as const satisfies Record<LogClass, LogTab>;

export const LOG_PAGE_SIZE = 20;

export const logEntrySchema = z.object({
  sequence: tableCountSchema,
  /* Reports travel as a phase-class event so older clients can still read the Game log. */
  class: logClassSchema.exclude(['bug-report']),
  event: z.literal('bug-report').optional(),
  text: z.string(),
  /* Where it happened: a turn and phase in play, the setup step, or the stage before setup. */
  context: z.string(),
  /* When it happened; null for a row rebuilt from a record that kept no clock. */
  at: tableCountSchema.nullable(),
  issueUrl: z
    .string()
    .regex(/^https:\/\/github\.com\/ndelangen\/dunezone\/issues\/\d+$/u)
    .optional(),
});
export type LogEntry = z.infer<typeof logEntrySchema>;
