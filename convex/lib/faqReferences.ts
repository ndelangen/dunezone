import type { PaginationOptions } from 'convex/server';

import type { Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../types';
import { loadRulesetAccessForLoadedSubject } from './collaborativeAccess';
import type { FaqReferenceTarget } from './faqReferenceTarget';
import { requireAuthUserId } from './policy';

/** Reference maintenance is independent of the asker's exclusive right to edit question text. */
export async function requireFaqReferenceEdit(ctx: MutationCtx, questionId: Id<'faq_items'>) {
  const userId = await requireAuthUserId(ctx);
  const question = await ctx.db.get('faq_items', questionId);
  if (!question) {
    throw new Error('FAQ question not found');
  }
  const ruleset = await ctx.db.get('rulesets', question.ruleset_id);
  if (!ruleset || ruleset.is_deleted) {
    throw new Error('Ruleset not found');
  }
  if (question.asked_by !== userId) {
    const access = await loadRulesetAccessForLoadedSubject(ctx, ruleset);
    if (!access.viewerAccess.capabilities.edit) {
      throw new Error('Not authorized');
    }
  }
  return question;
}

/** The same live-target projection used by faction relationships: retain links and skip unavailable targets. */
export async function liveFaqReferenceTarget(ctx: QueryCtx, target: FaqReferenceTarget) {
  if (target.kind === 'faction') {
    const faction = await ctx.db.get('factions', target.id);
    return faction && !faction.is_deleted ? { kind: 'faction' as const, faction } : null;
  }
  const asset = await ctx.db.get('assets', target.id);
  return asset && !asset.is_deleted ? { kind: 'asset' as const, asset } : null;
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
  const question = await ctx.db.get('faq_items', questionId);
  const ruleset = question ? await ctx.db.get('rulesets', question.ruleset_id) : null;
  if (!question || !ruleset || ruleset.is_deleted) {
    throw new Error('FAQ question not found');
  }
  const result = await ctx.db
    .query('faq_references')
    .withIndex('by_faq_item_id_and_target_id', (q) => q.eq('faq_item_id', questionId))
    .paginate(paginationOpts);
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
    .paginate(paginationOpts);
  const questions = await Promise.all(
    result.page.map(async (reference) => {
      const question = await ctx.db.get('faq_items', reference.faq_item_id);
      const ruleset = question ? await ctx.db.get('rulesets', question.ruleset_id) : null;
      return question && ruleset && !ruleset.is_deleted ? { question, ruleset } : null;
    })
  );
  return { ...result, page: questions.filter((question) => question !== null) };
}
