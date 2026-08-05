import type { Id } from '../_generated/dataModel';
import type { QueryCtx } from '../types';
import { profileSummary } from './profileSummary';

export async function loadFaqQuestionsAskedBy(ctx: QueryCtx, profileId: Id<'users'>) {
  const rows = await ctx.db
    .query('faq_items')
    .withIndex('by_asked_by_created', (q) => q.eq('asked_by', profileId))
    .take(200);
  const sorted = [...rows].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  return await Promise.all(
    sorted.map(async (item) => {
      const ruleset = await ctx.db.get(item.ruleset_id);
      if (!ruleset) {
        throw new Error(`Ruleset ${item.ruleset_id} missing for FAQ item ${item._id}`);
      }
      return {
        ...item,
        ruleset: { id: ruleset._id, name: ruleset.name, slug: ruleset.slug },
      };
    })
  );
}

export async function loadFaqAnswersGivenBy(ctx: QueryCtx, profileId: Id<'users'>) {
  const answers = await ctx.db
    .query('faq_answers')
    .withIndex('by_answered_by_created', (q) => q.eq('answered_by', profileId))
    .take(200);
  const sorted = [...answers].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  return await Promise.all(
    sorted.map(async (answer) => {
      const item = await ctx.db.get(answer.faq_item_id);
      if (!item) {
        throw new Error(`FAQ item ${answer.faq_item_id} missing for answer ${answer._id}`);
      }
      const ruleset = await ctx.db.get(item.ruleset_id);
      if (!ruleset) {
        throw new Error(`Ruleset ${item.ruleset_id} missing for FAQ item ${item._id}`);
      }
      return {
        ...answer,
        faq_item: {
          id: item._id,
          slug: item.slug,
          question: item.question,
          ruleset_id: item.ruleset_id,
          asked_by: item.asked_by,
          accepted_answer_id: item.accepted_answer_id ?? null,
        },
        asker_profile: await profileSummary(ctx, item.asked_by),
        ruleset: { id: ruleset._id, name: ruleset.name, slug: ruleset.slug },
      };
    })
  );
}
