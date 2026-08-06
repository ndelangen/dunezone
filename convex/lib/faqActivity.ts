import type { Doc, Id } from '../_generated/dataModel';
import type { QueryCtx } from '../types';
import { profileSummary } from './profileSummary';

const FAQ_ACTIVITY_LIMIT = 200;

export type FaqActivityRulesetLink = {
  id: Id<'rulesets'>;
  name: string;
  slug: string;
};

export type FaqQuestionAskedByUser = Doc<'faq_items'> & {
  ruleset: FaqActivityRulesetLink;
};

export type FaqAnswerParentLink = {
  id: Id<'faq_items'>;
  slug: string;
  question: string;
  ruleset_id: Id<'rulesets'>;
  asked_by: Id<'users'>;
  accepted_answer_id: Id<'faq_answers'> | null;
};

export type FaqAnswerGivenByUser = Doc<'faq_answers'> & {
  faq_item: FaqAnswerParentLink;
  asker_profile: Awaited<ReturnType<typeof profileSummary>>;
  ruleset: FaqActivityRulesetLink;
};

function byNewestCreated<T extends { created_at: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

async function requireRulesetLink(
  ctx: QueryCtx,
  item: Doc<'faq_items'>
): Promise<FaqActivityRulesetLink> {
  const ruleset = await ctx.db.get(item.ruleset_id);
  if (!ruleset) {
    throw new Error(`Ruleset ${item.ruleset_id} missing for FAQ item ${item._id}`);
  }
  return { id: ruleset._id, name: ruleset.name, slug: ruleset.slug };
}

/** Questions a user asked, newest first, each with the ruleset data its link needs. */
export async function listFaqQuestionsAskedBy(
  ctx: QueryCtx,
  userId: Id<'users'>
): Promise<FaqQuestionAskedByUser[]> {
  const rows = await ctx.db
    .query('faq_items')
    .withIndex('by_asked_by_created', (q) => q.eq('asked_by', userId))
    .take(FAQ_ACTIVITY_LIMIT);
  return await Promise.all(
    byNewestCreated(rows).map(async (item) => ({
      ...item,
      ruleset: await requireRulesetLink(ctx, item),
    }))
  );
}

/** Answers a user gave, newest first, each with parent question, asker, and ruleset link data. */
export async function listFaqAnswersGivenBy(
  ctx: QueryCtx,
  userId: Id<'users'>
): Promise<FaqAnswerGivenByUser[]> {
  const answers = await ctx.db
    .query('faq_answers')
    .withIndex('by_answered_by_created', (q) => q.eq('answered_by', userId))
    .take(FAQ_ACTIVITY_LIMIT);
  return await Promise.all(
    byNewestCreated(answers).map(async (answer) => {
      const item = await ctx.db.get(answer.faq_item_id);
      if (!item) {
        throw new Error(`FAQ item ${answer.faq_item_id} missing for answer ${answer._id}`);
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
        ruleset: await requireRulesetLink(ctx, item),
      };
    })
  );
}
