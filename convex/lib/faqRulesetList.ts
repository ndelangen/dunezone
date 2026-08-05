import type { Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../types';
import { profileSummary } from './profileSummary';

/** FAQ list projection used by ruleset views. */
export async function loadFaqItemsForRuleset(
  ctx: QueryCtx | MutationCtx,
  rulesetId: Id<'rulesets'>
) {
  const items = await ctx.db
    .query('faq_items')
    .withIndex('by_ruleset_created', (q) => q.eq('ruleset_id', rulesetId))
    .take(200);
  const sorted = [...items].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  if (sorted.length === 0) {
    return [];
  }

  const answers = await Promise.all(
    sorted.map((item) =>
      ctx.db
        .query('faq_answers')
        .withIndex('by_faq_item_created', (q) => q.eq('faq_item_id', item._id))
        .take(50)
    )
  );
  const askers = await Promise.all(sorted.map((item) => profileSummary(ctx, item.asked_by)));

  return sorted.map((item, index) => ({
    ...item,
    faq_answers: answers[index],
    asker_profile: askers[index],
  }));
}
