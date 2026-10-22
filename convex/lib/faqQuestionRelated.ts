import type { Id } from '../_generated/dataModel';
import type { QueryCtx } from '../types';
import { liveFaqReferenceTarget } from './faqReferenceTarget';
import { projectFaqListItems } from './faqRulesetList';

/* Recommendations are best effort over bounded index ranges, never a scan of the FAQ table. */
const SOURCE_REFERENCE_LIMIT = 24;
const QUESTIONS_PER_TARGET = 32;
const CANDIDATE_LIMIT = 64;
const RELATED_LIMIT = 5;

/** Shared live targets determine overlap; question creation breaks ties, not reference creation. */
export async function loadRelatedFaqForQuestion(ctx: QueryCtx, questionId: Id<'faq_items'>) {
  const source = await ctx.db
    .query('faq_references')
    .withIndex('by_faq_item_id_and_target_id', (q) => q.eq('faq_item_id', questionId))
    .take(SOURCE_REFERENCE_LIMIT);
  const live = await Promise.all(
    source.map(async (reference) => {
      const target =
        reference.kind === 'faction'
          ? { kind: 'faction' as const, id: reference.target_id }
          : { kind: 'asset' as const, id: reference.target_id };
      return (await liveFaqReferenceTarget(ctx, target)) ? reference.target_id : null;
    })
  );
  const targets = live.filter((target) => target !== null);
  const ranges = await Promise.all(
    targets.map((targetId) =>
      ctx.db
        .query('faq_references')
        .withIndex('by_target_id_and_question_created_at', (q) => q.eq('target_id', targetId))
        .order('desc')
        .take(QUESTIONS_PER_TARGET)
    )
  );
  const candidates = new Map<Id<'faq_items'>, { id: Id<'faq_items'>; createdAt: string; targets: Set<string> }>();
  for (const reference of ranges.flat()) {
    if (reference.faq_item_id === questionId) {
      continue;
    }
    const candidate = candidates.get(reference.faq_item_id) ?? {
      id: reference.faq_item_id,
      createdAt: reference.question_created_at,
      targets: new Set<string>(),
    };
    candidate.targets.add(reference.target_id);
    candidates.set(candidate.id, candidate);
  }
  const shortlist = [...candidates.values()]
    .sort(
      (left, right) =>
        right.targets.size - left.targets.size ||
        right.createdAt.localeCompare(left.createdAt) ||
        left.id.localeCompare(right.id)
    )
    .slice(0, CANDIDATE_LIMIT);
  const ranked = await Promise.all(
    shortlist.map(async (candidate) => {
      const question = await ctx.db.get('faq_items', candidate.id);
      const ruleset = question ? await ctx.db.get('rulesets', question.ruleset_id) : null;
      if (!question || !ruleset || ruleset.is_deleted) {
        return null;
      }
      /* A candidate can fall outside one target's newest range. Check its actual overlap before ranking. */
      const matches = await Promise.all(
        targets.map((targetId) =>
          ctx.db
            .query('faq_references')
            .withIndex('by_faq_item_id_and_target_id', (q) =>
              q.eq('faq_item_id', candidate.id).eq('target_id', targetId)
            )
            .unique()
        )
      );
      return { question, ruleset, overlap: matches.filter((match) => match !== null).length };
    })
  );
  const selected = ranked
    .filter((candidate) => candidate !== null)
    .sort(
      (left, right) =>
        right.overlap - left.overlap ||
        right.question.created_at.localeCompare(left.question.created_at) ||
        left.question._id.localeCompare(right.question._id)
    )
    .slice(0, RELATED_LIMIT);
  const items = await projectFaqListItems(
    ctx,
    selected.map((candidate) => candidate.question)
  );
  return items.map((item, index) => {
    const ruleset = selected[index]!.ruleset;
    return { ...item, ruleset: { id: ruleset._id, name: ruleset.name, slug: ruleset.slug } };
  });
}
