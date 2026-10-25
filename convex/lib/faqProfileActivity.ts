import { PROFILE_FAQ_PAGE_SIZE, parseProfileFaqPages } from '../../src/shared/profiles/faqActivity';
import type { ProfileFaqPages } from '../../src/shared/profiles/faqActivity';
import { rulesetCoverThumbUrl } from '../../src/shared/rulesets/cover';
import type { Doc, Id } from '../_generated/dataModel';
import type { QueryCtx } from '../types';
import { projectFaqListItems } from './faqRulesetList';
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

export async function loadFaqQuestionsAskedBy(ctx: QueryCtx, profileId: Id<'users'>) {
  const rows = await ctx.db
    .query('faq_items')
    .withIndex('by_asked_by_created', (q) => q.eq('asked_by', profileId))
    .order('desc')
    .take(200);
  /* One profile's activity mostly sits in a few rulesets and threads, so each document is read once per request. */
  const rulesetOf = memoised((id: Id<'rulesets'>) => ctx.db.get('rulesets', id));
  const listed = await Promise.all(
    rows.map(async (item) => {
      const ruleset = await rulesetOf(item.ruleset_id);
      if (!ruleset) {
        throw new Error(`Ruleset ${item.ruleset_id} missing for FAQ item ${item._id}`);
      }
      /*
       * A soft-deleted ruleset's questions are gone everywhere else, and their links would 404.
       * Dropped after the window, so a profile whose newest activity sat in deleted rulesets shows fewer rows; the profile list's counts still include them.
       */
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

export async function loadFaqAnswersGivenBy(ctx: QueryCtx, profileId: Id<'users'>) {
  const answers = await ctx.db
    .query('faq_answers')
    .withIndex('by_answered_by_created', (q) => q.eq('answered_by', profileId))
    .order('desc')
    .take(200);
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

/** One question per row, sharing the projection used by ruleset, search and related FAQ lists. */
export async function loadProfileFaqLists(
  ctx: QueryCtx,
  asked: Awaited<ReturnType<typeof loadFaqQuestionsAskedBy>>,
  answers: Awaited<ReturnType<typeof loadFaqAnswersGivenBy>>,
  pages: ProfileFaqPages
) {
  const parsed = parseProfileFaqPages(pages);
  const answeredQuestions = (
    await Promise.all(
      [...new Set(answers.map((answer) => answer.faq_item.id))].map((id) => ctx.db.get('faq_items', id))
    )
  )
    .filter((item) => item !== null)
    .sort((a, b) => b.created_at.localeCompare(a.created_at) || b._creationTime - a._creationTime);
  const windowOf = <T>(items: T[], requested: number | undefined) => {
    const pageCount = Math.max(1, Math.ceil(items.length / PROFILE_FAQ_PAGE_SIZE));
    const page = Math.min(requested ?? 1, pageCount);
    return { page, pageCount, items: items.slice((page - 1) * PROFILE_FAQ_PAGE_SIZE, page * PROFILE_FAQ_PAGE_SIZE) };
  };
  const askedPage = windowOf(asked, parsed.askedPage);
  const answeredPage = windowOf(answeredQuestions, parsed.answeredPage);
  const rulesets = new Map([...asked, ...answers].map((row) => [row.ruleset.id, row.ruleset]));
  const items = new Map<Id<'faq_items'>, Doc<'faq_items'>>();
  for (const { ruleset: _ruleset, ...question } of askedPage.items) {
    items.set(question._id, question);
  }
  for (const question of answeredPage.items) {
    items.set(question._id, question);
  }
  const projected = await projectFaqListItems(ctx, [...items.values()]);
  const rows = new Map(
    projected.map((item) => {
      const ruleset = rulesets.get(item.ruleset_id);
      if (!ruleset) {
        throw new Error(`Ruleset ${item.ruleset_id} missing for FAQ item ${item._id}`);
      }
      return [item._id, { ...item, ruleset: { id: ruleset.id, name: ruleset.name, slug: ruleset.slug } }];
    })
  );
  return {
    asked: { ...askedPage, items: askedPage.items.flatMap((item) => rows.get(item._id) ?? []) },
    answered: { ...answeredPage, items: answeredPage.items.flatMap((item) => rows.get(item._id) ?? []) },
  };
}
