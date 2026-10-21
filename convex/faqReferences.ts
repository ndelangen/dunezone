import { paginationOptsValidator, paginationResultValidator } from 'convex/server';
import { v } from 'convex/values';

import { mutation, publicQuery } from './functions';
import { faqReferencePreview, faqReferencePreviewValidator } from './lib/faqReferencePreviews';
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

/** Lazily mounted reference choices use the catalogue's complete, indexed search rather than the authoring load pickers. */
export const options = publicQuery({
  args: {
    kind: v.union(v.literal('faction'), v.literal('asset')),
    q: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(faqReferencePreviewValidator),
  handler: async (ctx, args) => {
    const text = args.q.trim();
    const rows = text
      ? await ctx.db
          .query('catalogue_entries')
          .withSearchIndex('search_text', (q) =>
            q.search('search_text', text).eq('kind', args.kind).eq('partition', 'all')
          )
          .paginate(args.paginationOpts)
      : await ctx.db
          .query('catalogue_entries')
          .withIndex('by_kind_partition_created', (q) => q.eq('kind', args.kind).eq('partition', 'all'))
          .order('desc')
          .paginate(args.paginationOpts);
    const choices = await Promise.all(
      rows.page.map(async (entry) => {
        const target =
          args.kind === 'faction'
            ? { kind: 'faction' as const, id: ctx.db.normalizeId('factions', entry.source_id) }
            : { kind: 'asset' as const, id: ctx.db.normalizeId('assets', entry.source_id) };
        if (!target.id) {
          return null;
        }
        const live =
          target.kind === 'faction'
            ? await liveFaqReferenceTarget(ctx, { kind: 'faction', id: target.id })
            : await liveFaqReferenceTarget(ctx, { kind: 'asset', id: target.id });
        return live ? await faqReferencePreview(ctx, live) : null;
      })
    );
    return { ...rows, page: choices.filter((choice) => choice !== null) };
  },
});
