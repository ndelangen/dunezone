import type { PaginationOptions } from 'convex/server';

import type { Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../types';
import { loadRulesetAccessForLoadedSubject } from './collaborativeAccess';
import { liveFaqReferenceTarget } from './faqReferenceTarget';
import type { FaqReferenceTarget } from './faqReferenceTarget';
export { liveFaqReferenceTarget } from './faqReferenceTarget';
import { projectFaqListItems } from './faqRulesetList';
import { requireAuthUserId } from './policy';

/* Envelopes carry page detail beside list items, so Convex's server split signals bound range growth. */
const REFERENCE_RANGE_MAX_ROWS = 24;

function referencePagination(options: PaginationOptions): PaginationOptions {
  return {
    ...options,
    maximumRowsRead: Math.min(options.maximumRowsRead ?? REFERENCE_RANGE_MAX_ROWS, REFERENCE_RANGE_MAX_ROWS),
  };
}

/** Reference maintenance is independent of the asker's exclusive right to edit question text. */
export async function requireFaqReferenceEdit(ctx: MutationCtx, questionId: Id<'faq_items'>) {
  const userId = await requireAuthUserId(ctx);
  const { question, ruleset } = await loadLiveFaqQuestion(ctx, questionId);
  if (question.asked_by !== userId) {
    const access = await loadRulesetAccessForLoadedSubject(ctx, ruleset);
    if (!access.viewerAccess.capabilities.edit) {
      throw new Error('Not authorized');
    }
  }
  return question;
}

export function faqReferencePair(ctx: QueryCtx, questionId: Id<'faq_items'>, target: FaqReferenceTarget) {
  return ctx.db
    .query('faq_references')
    .withIndex('by_faq_item_id_and_target_id', (q) => q.eq('faq_item_id', questionId).eq('target_id', target.id))
    .unique();
}

/** Page composers project the live targets into their existing preview shapes before returning them to the browser. */
export async function loadFaqReferenceTargets(
  ctx: QueryCtx,
  questionId: Id<'faq_items'>,
  paginationOpts: PaginationOptions
) {
  await loadLiveFaqQuestion(ctx, questionId);
  const result = await ctx.db
    .query('faq_references')
    .withIndex('by_faq_item_id_and_target_id', (q) => q.eq('faq_item_id', questionId))
    .paginate(referencePagination(paginationOpts));
  const targets = await Promise.all(
    result.page.map(async (reference) => {
      const target = await liveFaqReferenceTarget(
        ctx,
        reference.kind === 'faction'
          ? { kind: 'faction', id: reference.target_id }
          : { kind: 'asset', id: reference.target_id }
      );
      return target ? { reference, ...target } : null;
    })
  );
  return { ...result, page: targets.filter((target) => target !== null) };
}

/** Reverse pages keep the native cursor even when deleted questions or rulesets leave a short page. */
export async function loadFaqQuestionsForTarget(
  ctx: QueryCtx,
  target: FaqReferenceTarget,
  paginationOpts: PaginationOptions
) {
  const liveTarget = await liveFaqReferenceTarget(ctx, target);
  if (!liveTarget) {
    return { page: [], isDone: true, continueCursor: '' };
  }
  const result = await ctx.db
    .query('faq_references')
    .withIndex('by_target_id_and_question_created_at', (q) => q.eq('target_id', target.id))
    .order('desc')
    .paginate(referencePagination(paginationOpts));
  const questions = await Promise.all(
    result.page.map(async (reference) => {
      const question = await ctx.db.get('faq_items', reference.faq_item_id);
      const ruleset = question ? await ctx.db.get('rulesets', question.ruleset_id) : null;
      return question && ruleset && !ruleset.is_deleted ? { question, ruleset } : null;
    })
  );
  return { ...result, page: questions.filter((question) => question !== null) };
}

export async function loadLiveFaqQuestion(ctx: QueryCtx, questionId: Id<'faq_items'>) {
  const question = await ctx.db.get('faq_items', questionId);
  if (!question) {
    throw new Error('FAQ question not found');
  }
  const ruleset = await ctx.db.get('rulesets', question.ruleset_id);
  if (!ruleset) {
    throw new Error('Ruleset not found');
  }
  if (ruleset.is_deleted) {
    throw new Error('Ruleset not found');
  }
  return { question, ruleset };
}

export async function loadRelatedFaqPage(ctx: QueryCtx, target: FaqReferenceTarget, paginationOpts: PaginationOptions) {
  const result = await loadFaqQuestionsForTarget(ctx, target, paginationOpts);
  const items = await projectFaqListItems(
    ctx,
    result.page.map((entry) => entry.question)
  );
  return {
    ...result,
    page: items.map((item, index) => ({
      ...item,
      ruleset: {
        id: result.page[index]!.ruleset._id,
        name: result.page[index]!.ruleset.name,
        slug: result.page[index]!.ruleset.slug,
      },
    })),
  };
}
