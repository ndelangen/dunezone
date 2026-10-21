import { ConvexError, v } from 'convex/values';

import type { Id } from '../_generated/dataModel';
import type { QueryCtx } from '../types';
import { optionalActiveUserId } from './accountLifecycle';
import { faqTagValidator } from './faqTags';
import { profileSummary } from './profileSummary';

const QUESTION_PAGE_ANSWER_LIMIT = 200;

const authorChipValidator = v.object({
  id: v.id('profiles'),
  slug: v.string(),
  username: v.union(v.string(), v.null()),
  avatarUrl: v.union(v.string(), v.null()),
});

const questionValidator = v.object({
  id: v.id('faq_items'),
  slug: v.string(),
  text: v.string(),
  tags: v.optional(v.array(faqTagValidator)),
  author: v.union(authorChipValidator, v.null()),
  createdAt: v.string(),
  updatedAt: v.string(),
});

const answerValidator = v.object({
  id: v.id('faq_answers'),
  text: v.string(),
  author: v.union(authorChipValidator, v.null()),
  createdAt: v.string(),
  accepted: v.boolean(),
});

const rulesetCitationValidator = v.object({ id: v.id('rulesets'), slug: v.string(), name: v.string() });

/**
 * The question page, the same for every viewer.
 * `askedBy` and `answeredBy` are the facts the browser combines with the viewer (`faqQuestionPageForViewer`).
 */
export const faqQuestionPublicPageValidator = v.object({
  ruleset: rulesetCitationValidator,
  question: questionValidator.extend({ askedBy: v.id('users') }),
  answers: v.array(answerValidator.extend({ answeredBy: v.id('users') })),
});

function authorChip(summary: Awaited<ReturnType<typeof profileSummary>>) {
  return summary
    ? {
        id: summary.id,
        slug: summary.slug,
        username: summary.username,
        avatarUrl: summary.avatar_url,
      }
    : null;
}

/**
 * Whether the viewer has answered one question, through the same index the answer-once rule in `createAnswer` reads.
 * Uncapped, unlike the page's answer list, so a viewer whose answer sits past the page's bound is still never offered a second.
 */
export async function loadViewerAnswered(ctx: QueryCtx, questionId: Id<'faq_items'> | null) {
  const viewerId = await optionalActiveUserId(ctx);
  if (!viewerId || !questionId) {
    return false;
  }
  const own = await ctx.db
    .query('faq_answers')
    .withIndex('by_faq_item_answered_by', (q) => q.eq('faq_item_id', questionId).eq('answered_by', viewerId))
    .first();
  return own !== null;
}

/**
 * FAQ question-page read model, the same for every viewer.
 * Owns the locator resolution and the accepted-first ordering behind `api.faq.question` (see CONTEXT.md: FAQ question, FAQ answer);
 * who may do what is `faqQuestionPageForViewer`, run in the browser with `api.faq.viewerAnswered`.
 * The wire contract is `faqQuestionPublicPageValidator`.
 */
export async function loadFaqQuestionPublicPage(ctx: QueryCtx, args: { rulesetSlug: string; questionSlug: string }) {
  const { ruleset, item } = await loadFaqQuestionAtLocator(ctx, args);
  /* The newest answers, shown oldest first, so a new answer always appears even on a long thread. */
  const answers = (
    await ctx.db
      .query('faq_answers')
      .withIndex('by_faq_item_created', (q) => q.eq('faq_item_id', item._id))
      .order('desc')
      .take(QUESTION_PAGE_ANSWER_LIMIT)
  ).reverse();
  /* The accepted answer leads the page even when it is older than the limit's window. */
  if (item.accepted_answer_id && !answers.some((answer) => answer._id === item.accepted_answer_id)) {
    const accepted = await ctx.db.get(item.accepted_answer_id);
    if (accepted) {
      answers.push(accepted);
    }
  }

  const asker = await profileSummary(ctx, item.asked_by);
  const answerers = await Promise.all(answers.map((answer) => profileSummary(ctx, answer.answered_by)));
  const projectedAnswers = answers.map((answer, index) => ({
    id: answer._id,
    text: answer.answer,
    author: authorChip(answerers[index] ?? null),
    answeredBy: answer.answered_by,
    createdAt: answer.created_at,
    accepted: item.accepted_answer_id === answer._id,
  }));
  projectedAnswers.sort((left, right) => Number(right.accepted) - Number(left.accepted));

  return {
    ruleset: { id: ruleset._id, slug: ruleset.slug, name: ruleset.name },
    question: {
      id: item._id,
      slug: item.slug,
      text: item.question,
      tags: item.tags,
      author: authorChip(asker),
      askedBy: item.asked_by,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    },
    answers: projectedAnswers,
  };
}

/** Resolve a live question without subscribing to its answers. */
export async function loadFaqQuestionAtLocator(ctx: QueryCtx, args: { rulesetSlug: string; questionSlug: string }) {
  const ruleset = await ctx.db
    .query('rulesets')
    .withIndex('by_slug', (q) => q.eq('slug', args.rulesetSlug))
    .unique();
  if (!ruleset || ruleset.is_deleted) {
    throw new ConvexError({ code: 'NOT_FOUND', message: `Ruleset with slug ${args.rulesetSlug} not found` });
  }
  const item = await ctx.db
    .query('faq_items')
    .withIndex('by_ruleset_slug', (q) => q.eq('ruleset_id', ruleset._id).eq('slug', args.questionSlug))
    .unique();
  if (!item) {
    throw new ConvexError({
      code: 'NOT_FOUND',
      message: `FAQ item with slug ${args.questionSlug} not found in ruleset ${args.rulesetSlug}`,
    });
  }
  return { ruleset, item };
}
