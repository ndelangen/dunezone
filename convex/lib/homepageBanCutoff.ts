import { internal } from '../_generated/api';
import type { Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { playCredential } from './playAuthorization';

/** The operation's capability closes existing homepage leases without exposing an administrative credential. */
export async function queueHomepageBanCutoff(ctx: MutationCtx, operationId: Id<'account_deletion_operations'>) {
  await ctx.db.patch(operationId, { homepage_cutoff_token: playCredential(), homepage_cutoff_at: Date.now() });
  await ctx.scheduler.runAfter(0, internal.homepageBanCutoff.attempt, { operationId });
}
