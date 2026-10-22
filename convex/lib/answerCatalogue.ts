import type { Id } from '../_generated/dataModel';
import { catalogueEditedAt, catalogueNameKey, catalogueSearchText, catalogueTimestamp } from './catalogueEntryShape';
import type { CatalogueKind } from './catalogueEntryShape';

/*
 * An answer has no length cap, but its entry is written once per list it is in, so it carries a bounded prefix: enough to order and count it.
 * Nothing searches answers yet;
 * the prefix is there so the kind reads like the others when something does.
 */
const ANSWER_SEARCH_TEXT_LIMIT = 2000;
const ANSWER_NAME_KEY_LIMIT = 200;

/** The list of one member's answers. */
export function answererPartition(userId: Id<'users'>) {
  return `answerer:${userId}`;
}

/** The list of one member's answers their question picked, kept so a profile can count them. */
export function pickedAnswererPartition(userId: Id<'users'>) {
  return `answerer:${userId}:picked`;
}

/**
 * The answer kind of `catalogue_entries`: one entry per answer in its answerer's list, and in the picked list while its question accepts it.
 * An answer whose question is gone is unlisted, as it links nowhere;
 * the question's deletion removes its answers right after, through their own trigger.
 * It has the one order anyone reads, newest first;
 * its counts read that order's namespace.
 */
export const answerCatalogueKind: CatalogueKind = {
  sorts: ['created'],
  expected: async (ctx, sourceId) => {
    const answerId = ctx.db.normalizeId('faq_answers', sourceId);
    const answer = answerId ? await ctx.db.get('faq_answers', answerId) : null;
    const item = answer ? await ctx.db.get('faq_items', answer.faq_item_id) : null;
    if (!answer || !item) {
      return null;
    }
    return {
      kind: 'answer',
      source_id: answer._id,
      slug: item.slug,
      search_text: catalogueSearchText([answer.answer.slice(0, ANSWER_SEARCH_TEXT_LIMIT)]),
      name_key: catalogueNameKey(answer.answer.slice(0, ANSWER_NAME_KEY_LIMIT)),
      created_at: catalogueTimestamp(answer.created_at),
      updated_at: catalogueTimestamp(answer.created_at),
      edited_at: catalogueEditedAt(answer.created_at, answer.created_at),
      complexity: 0,
      complexity_score: 0,
      facets: [
        answererPartition(answer.answered_by),
        ...(item.accepted_answer_id === answer._id ? [pickedAnswererPartition(answer.answered_by)] : []),
      ],
    };
  },
  listedSourceIds: async (ctx, limit) => {
    const rows = await ctx.db.query('faq_answers').take(limit);
    return rows.map((row) => row._id);
  },
};
