import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../types';
import { profileSummaryReader } from './profileSummary';

/* A question's answers as the list counts them; a thread longer than this lists as this long. */
const LIST_ANSWER_LIMIT = 50;

/** FAQ list projection used by ruleset views: each question with its answers and the asker's summary. */
export async function projectFaqListItems(ctx: QueryCtx | MutationCtx, items: Doc<'faq_items'>[]) {
  const answers = await Promise.all(
    items.map((item) =>
      ctx.db
        .query('faq_answers')
        .withIndex('by_faq_item_created', (q) => q.eq('faq_item_id', item._id))
        .take(LIST_ANSWER_LIMIT)
    )
  );
  const summaryOf = profileSummaryReader(ctx);
  const askers = await Promise.all(items.map((item) => summaryOf(item.asked_by)));

  return items.map((item, index) => ({
    ...item,
    faq_answers: answers[index]!,
    asker_profile: askers[index]!,
  }));
}

/** The questions a page of catalogue entries names, in its order; an entry whose question is gone is skipped. */
export async function faqItemsOfEntries(ctx: QueryCtx | MutationCtx, entries: Doc<'catalogue_entries'>[]) {
  const items: Doc<'faq_items'>[] = [];
  for (const entry of entries) {
    const itemId = ctx.db.normalizeId('faq_items', entry.source_id);
    const item = itemId ? await ctx.db.get('faq_items', itemId) : null;
    if (!item) {
      /* Drift: the page comes up one row short until the backfill or the question's next save. */
      console.warn(`Catalogue entry for FAQ item ${entry.source_id} has no question.`);
      continue;
    }
    items.push(item);
  }
  return items;
}

/** A ruleset's newest questions, for its own page. */
export async function loadNewestFaqItems(ctx: QueryCtx | MutationCtx, rulesetId: Id<'rulesets'>, limit: number) {
  const newest = await ctx.db
    .query('faq_items')
    .withIndex('by_ruleset_created', (q) => q.eq('ruleset_id', rulesetId))
    .order('desc')
    .take(limit);
  return await projectFaqListItems(ctx, newest);
}
