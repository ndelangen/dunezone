import { v } from 'convex/values';

import { mutation } from './functions';
import { faqReferencePair, liveFaqReferenceTarget, requireFaqReferenceEdit } from './lib/faqReferences';
import { faqReferenceTargetValidator } from './lib/faqReferenceTarget';

export const add = mutation({
  args: { questionId: v.id('faq_items'), target: faqReferenceTargetValidator },
  returns: v.id('faq_references'),
  handler: async (ctx, args) => {
    const question = await requireFaqReferenceEdit(ctx, args.questionId);
    if (!(await liveFaqReferenceTarget(ctx, args.target))) {
      throw new Error('Referenced faction or asset not found');
    }
    const existing = await faqReferencePair(ctx, args.questionId, args.target);
    if (existing) {
      return existing._id;
    }
    const link =
      args.target.kind === 'faction'
        ? { kind: 'faction' as const, target_id: args.target.id }
        : { kind: 'asset' as const, target_id: args.target.id };
    return await ctx.db.insert('faq_references', {
      faq_item_id: args.questionId,
      question_created_at: question.created_at,
      ...link,
    });
  },
});

export const remove = mutation({
  args: { questionId: v.id('faq_items'), target: faqReferenceTargetValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireFaqReferenceEdit(ctx, args.questionId);
    const reference = await faqReferencePair(ctx, args.questionId, args.target);
    if (reference) {
      await ctx.db.delete('faq_references', reference._id);
    }
    return null;
  },
});
