import { getAuthUserId } from '@convex-dev/auth/server';
import { v } from 'convex/values';

import type { QueryCtx } from '../types';
import { faqTagValidator } from './faqTags';
import { profileSummary } from './profileSummary';

const QUESTION_PAGE_ANSWER_LIMIT = 200;

const authorChipValidator = v.object({
  id: v.id('profiles'),
  slug: v.string(),
  username: v.union(v.string(), v.null()),
  avatarUrl: v.union(v.string(), v.null()),
});

export const faqQuestionPageValidator = v.object({
  ruleset: v.object({ id: v.id('rulesets'), slug: v.string(), name: v.string() }),
  question: v.object({
    id: v.id('faq_items'),
    slug: v.string(),
    text: v.string(),
    tags: v.optional(v.array(faqTagValidator)),
    author: v.union(authorChipValidator, v.null()),
    createdAt: v.string(),
    updatedAt: v.string(),
    capabilities: v.object({ editQuestion: v.boolean(), deleteQuestion: v.boolean() }),
  }),
  viewer: v.object({ answerQuestion: v.boolean() }),
  answers: v.array(
    v.object({
      id: v.id('faq_answers'),
      text: v.string(),
      author: v.union(authorChipValidator, v.null()),
      createdAt: v.string(),
      accepted: v.boolean(),
      capabilities: v.object({
        editAnswer: v.boolean(),
        deleteAnswer: v.boolean(),
        acceptAnswer: v.boolean(),
        unacceptAnswer: v.boolean(),
      }),
    })
  ),
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
 * FAQ question-page read model.
 * Owns the locator resolution, the per-role capability rules (the FAQ question owner accepts/unaccepts/removes answers;
 * an answer author alone edits their answer;
 * each viewer may answer once), and the accepted-first ordering behind `api.faq.questionPage` (see CONTEXT.md: FAQ question, FAQ answer).
 * The wire contract is `faqQuestionPageValidator`.
 */
export async function loadFaqQuestionPage(ctx: QueryCtx, args: { rulesetSlug: string; questionSlug: string }) {
  const ruleset = await ctx.db
    .query('rulesets')
    .withIndex('by_slug', (q) => q.eq('slug', args.rulesetSlug))
    .unique();
  if (!ruleset || ruleset.is_deleted) {
    throw new Error(`Ruleset with slug ${args.rulesetSlug} not found`);
  }
  const item = await ctx.db
    .query('faq_items')
    .withIndex('by_ruleset_slug', (q) => q.eq('ruleset_id', ruleset._id).eq('slug', args.questionSlug))
    .unique();
  if (!item) {
    throw new Error(`FAQ item with slug ${args.questionSlug} not found in ruleset ${args.rulesetSlug}`);
  }
  const answers = await ctx.db
    .query('faq_answers')
    .withIndex('by_faq_item_created', (q) => q.eq('faq_item_id', item._id))
    .take(QUESTION_PAGE_ANSWER_LIMIT);

  const viewerId = await getAuthUserId(ctx);
  const questionOwner = viewerId === item.asked_by;
  const viewerAnswered = viewerId
    ? (await ctx.db
        .query('faq_answers')
        .withIndex('by_faq_item_answered_by', (q) => q.eq('faq_item_id', item._id).eq('answered_by', viewerId))
        .unique()) !== null
    : false;
  const asker = await profileSummary(ctx, item.asked_by);
  const answerers = await Promise.all(answers.map((answer) => profileSummary(ctx, answer.answered_by)));
  const projectedAnswers = answers.map((answer, index) => {
    const answerOwner = viewerId === answer.answered_by;
    const accepted = item.accepted_answer_id === answer._id;
    return {
      id: answer._id,
      text: answer.answer,
      author: authorChip(answerers[index] ?? null),
      createdAt: answer.created_at,
      accepted,
      capabilities: {
        editAnswer: answerOwner,
        deleteAnswer: answerOwner || questionOwner,
        acceptAnswer: questionOwner && !accepted,
        unacceptAnswer: questionOwner && accepted,
      },
    };
  });
  projectedAnswers.sort((left, right) => Number(right.accepted) - Number(left.accepted));

  return {
    ruleset: { id: ruleset._id, slug: ruleset.slug, name: ruleset.name },
    question: {
      id: item._id,
      slug: item.slug,
      text: item.question,
      tags: item.tags,
      author: authorChip(asker),
      createdAt: item.created_at,
      updatedAt: item.updated_at,
      capabilities: {
        editQuestion: questionOwner,
        deleteQuestion: questionOwner,
      },
    },
    viewer: { answerQuestion: viewerId !== null && !viewerAnswered },
    answers: projectedAnswers,
  };
}
