import { z } from 'zod';

import { tableCountSchema, tableIdSchema, tableIdentitySchema } from './schema';

/**
 * A table review: the seated players agree, by majority, to look back at one checkpoint together.
 * While it runs every viewer, seated or watching, sees that checkpoint's public board and nothing else, and the table takes no move, carry or peek.
 * It settles a dispute about what the board showed without letting anyone look back alone.
 */
const reviewChoiceSchema = z.enum(['review', 'decline']).nullable();
export const tableReviewSchema = z.object({
  id: tableIdSchema,
  step: tableCountSchema,
  /* Where the checkpoint is: a turn and phase, or a setup step. */
  context: z.string().max(200),
  proposer: z.object({ name: z.string(), seat: tableIdentitySchema }),
  openedAt: tableCountSchema,
  threshold: tableCountSchema,
  ballots: z.array(z.object({ name: z.string(), seat: tableIdentitySchema, choice: reviewChoiceSchema })),
  /* When the majority agreed and the table paused for everyone; null while the vote is open. */
  startedAt: tableCountSchema.nullable(),
});
export type TableReview = z.infer<typeof tableReviewSchema>;
export type ReviewChoice = TableReview['ballots'][number]['choice'];

/** A checkpoint the table can review, newest last. */
export const reviewCheckpointSchema = z.object({ step: tableCountSchema, context: z.string().max(200) });
export type ReviewCheckpoint = z.infer<typeof reviewCheckpointSchema>;

/* The checkpoints a proposal offers: recent enough to settle what just happened. */
export const REVIEW_CHECKPOINTS = 30;

export const reviewActionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('review-propose'), step: tableCountSchema }),
  z.strictObject({ kind: z.literal('review-ballot'), reviewId: tableIdSchema, choice: reviewChoiceSchema }),
  /* The proposer withdraws an open proposal; once the review runs, any seated player resumes play. */
  z.strictObject({ kind: z.literal('review-end'), reviewId: tableIdSchema }),
]);
export type ReviewAction = z.infer<typeof reviewActionSchema>;
export function isReviewAction(action: { kind: string }): action is ReviewAction {
  return action.kind === 'review-propose' || action.kind === 'review-ballot' || action.kind === 'review-end';
}

/** A majority of the seated players, the proposer included. */
export function reviewThreshold(players: number): number {
  return Math.floor(players / 2) + 1;
}

/** Where a review can be asked for: once the seats are dealt and before the game ends. */
export function reviewableStage(stage: string | undefined): boolean {
  return stage === 'setup' || stage === 'play';
}

/** Whether the table is paused for a review that is showing now. */
export function reviewRunning(review: TableReview | null | undefined): review is TableReview & { startedAt: number } {
  return Boolean(review && review.startedAt !== null);
}
