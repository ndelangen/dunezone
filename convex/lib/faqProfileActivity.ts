import { rulesetCoverThumbUrl } from '../../src/shared/rulesets/cover';
import type { Doc, Id } from '../_generated/dataModel';
import type { QueryCtx } from '../types';
import { memoised } from './memoised';
import { profileSummaryReader } from './profileSummary';

/*
 * A ruleset as a citation: flat, with the cover already folded, the way `profileSummary` folds an avatar.
 * The fold lives in `src/shared` so this and the client derive it from one function rather than two that agree today.
 */
function rulesetCitation(ruleset: Doc<'rulesets'>) {
  return {
    id: ruleset._id,
    name: ruleset.name,
    slug: ruleset.slug,
    coverThumbUrl: rulesetCoverThumbUrl(ruleset),
  };
}

/** Every question a member asked, newest first, as the profile page before its sections listed them. */
export async function loadFaqQuestionsAskedBy(ctx: QueryCtx, profileId: Id<'users'>) {
  const rows = await ctx.db
    .query('faq_items')
    .withIndex('by_asked_by_created', (q) => q.eq('asked_by', profileId))
    .order('desc')
    .take(200);
  return await projectQuestionsAsked(ctx, rows);
}

/**
 * Questions as a profile lists them, in the order given, each with the ruleset it was asked in.
 * A soft-deleted ruleset's questions are gone everywhere else, and their links would 404, so they are dropped;
 * a page that reads them from a counted list comes up that many short.
 */
export async function projectQuestionsAsked(ctx: QueryCtx, rows: Doc<'faq_items'>[]) {
  /* One profile's activity mostly sits in a few rulesets and threads, so each document is read once per request. */
  const rulesetOf = memoised((id: Id<'rulesets'>) => ctx.db.get('rulesets', id));
  const listed = await Promise.all(
    rows.map(async (item) => {
      const ruleset = await rulesetOf(item.ruleset_id);
      if (!ruleset) {
        throw new Error(`Ruleset ${item.ruleset_id} missing for FAQ item ${item._id}`);
      }
      if (ruleset.is_deleted) {
        return null;
      }
      return {
        ...item,
        ruleset: rulesetCitation(ruleset),
      };
    })
  );
  return listed.filter((item) => item !== null);
}

/** Every answer a member gave, newest first, as the profile page before its sections listed them. */
export async function loadFaqAnswersGivenBy(ctx: QueryCtx, profileId: Id<'users'>) {
  const answers = await ctx.db
    .query('faq_answers')
    .withIndex('by_answered_by_created', (q) => q.eq('answered_by', profileId))
    .order('desc')
    .take(200);
  return await projectAnswersGiven(ctx, answers);
}

/** Answers as a profile lists them, in the order given, each with its question, the asker and the ruleset; a soft-deleted ruleset's are dropped, as its questions are. */
export async function projectAnswersGiven(ctx: QueryCtx, answers: Doc<'faq_answers'>[]) {
  const itemOf = memoised((id: Id<'faq_items'>) => ctx.db.get('faq_items', id));
  const rulesetOf = memoised((id: Id<'rulesets'>) => ctx.db.get('rulesets', id));
  const summaryOf = profileSummaryReader(ctx);
  const listed = await Promise.all(
    answers.map(async (answer) => {
      const item = await itemOf(answer.faq_item_id);
      if (!item) {
        throw new Error(`FAQ item ${answer.faq_item_id} missing for answer ${answer._id}`);
      }
      const ruleset = await rulesetOf(item.ruleset_id);
      if (!ruleset) {
        throw new Error(`Ruleset ${item.ruleset_id} missing for FAQ item ${item._id}`);
      }
      if (ruleset.is_deleted) {
        return null;
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
        asker_profile: await summaryOf(item.asked_by),
        ruleset: rulesetCitation(ruleset),
      };
    })
  );
  return listed.filter((answer) => answer !== null);
}
