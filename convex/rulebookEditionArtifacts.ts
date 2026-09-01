import { v } from 'convex/values';

import { internalMutation } from './functions';
import {
  completeRulebookEditionArtifact,
  rulebookEditionArtifactKindValidator,
  rulebookEditionSummaryValidator,
} from './lib/rulebookEditionArtifacts';

/** Completion changes readiness only; the permanent Edition identity and path never enter the mutation. */
export const complete = internalMutation({
  args: {
    edition_id: v.id('rulebook_editions'),
    kind: rulebookEditionArtifactKindValidator,
    outcome: v.union(
      v.object({ status: v.literal('ready') }),
      v.object({ status: v.literal('failed'), reason: v.string() })
    ),
  },
  returns: rulebookEditionSummaryValidator,
  handler: async (ctx, args) =>
    await completeRulebookEditionArtifact(ctx, {
      editionId: args.edition_id,
      kind: args.kind,
      outcome: args.outcome,
    }),
});
