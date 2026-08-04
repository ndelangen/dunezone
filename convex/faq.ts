import { v } from 'convex/values';

import { FAQ_TAG_VALUES } from '../src/app/faq/tags';
import { faqAnswerSchema, faqQuestionSchema, faqTagsSchema } from '../src/app/faq/validation';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { internalMutation, mutation, query } from './_generated/server';
import { loadFaqItemsForRuleset } from './lib/faqRulesetList';
import { adjustHomepageRulesetFaqTotals } from './lib/homepageCommunity';
import { requireAuthUserId } from './lib/policy';
import { profileSummary } from './lib/profileSummary';
import { nowIso } from './lib/utils';
import type { MutationCtx, QueryCtx } from './types';

const FAQ_ITEM_DELETE_BATCH_MAX_DOCUMENTS = 100;
const FAQ_ITEM_DELETE_TRANSACTION_RESERVE_BYTES = 2 * 1024 * 1024;
const FAQ_ITEM_DELETE_TRANSACTION_RESERVE_OPERATIONS = 16;

const faqTagValidator = v.union(
  v.literal(FAQ_TAG_VALUES[0]),
  v.literal(FAQ_TAG_VALUES[1]),
  v.literal(FAQ_TAG_VALUES[2]),
  v.literal(FAQ_TAG_VALUES[3]),
  v.literal(FAQ_TAG_VALUES[4]),
  v.literal(FAQ_TAG_VALUES[5])
);

async function getRuleset(ctx: QueryCtx | MutationCtx, id: Id<'rulesets'>) {
  return await ctx.db.get(id);
}

async function getRulesetBySlug(ctx: QueryCtx | MutationCtx, slug: string) {
  return await ctx.db
    .query('rulesets')
    .withIndex('by_slug', (q) => q.eq('slug', slug))
    .unique();
}

async function getFaqItem(ctx: QueryCtx | MutationCtx, id: Id<'faq_items'>) {
  return await ctx.db.get(id);
}

async function getFaqAnswer(ctx: QueryCtx | MutationCtx, id: Id<'faq_answers'>) {
  return await ctx.db.get(id);
}

async function deleteFaqAnswerBatch(ctx: MutationCtx, faqItemId: Id<'faq_items'>) {
  let deleted = 0;
  for await (const answer of ctx.db
    .query('faq_answers')
    .withIndex('by_faq_item_created', (q) => q.eq('faq_item_id', faqItemId))) {
    await ctx.db.delete(answer._id);
    deleted += 1;
    const metrics = await ctx.meta.getTransactionMetrics();
    if (
      deleted >= FAQ_ITEM_DELETE_BATCH_MAX_DOCUMENTS ||
      metrics.bytesRead.remaining < FAQ_ITEM_DELETE_TRANSACTION_RESERVE_BYTES ||
      metrics.bytesWritten.remaining < FAQ_ITEM_DELETE_TRANSACTION_RESERVE_BYTES ||
      metrics.databaseQueries.remaining < FAQ_ITEM_DELETE_TRANSACTION_RESERVE_OPERATIONS ||
      metrics.documentsWritten.remaining < FAQ_ITEM_DELETE_TRANSACTION_RESERVE_OPERATIONS
    ) {
      return { deleted, shouldContinue: true };
    }
  }
  return { deleted, shouldContinue: false };
}

async function assertAcceptedAnswerBelongsToItem(
  ctx: QueryCtx | MutationCtx,
  faqItemId: Id<'faq_items'>,
  acceptedAnswerId: Id<'faq_answers'> | null
) {
  if (acceptedAnswerId === null) {
    return;
  }
  const accepted = await getFaqAnswer(ctx, acceptedAnswerId);
  if (!accepted) {
    throw new Error(`FAQ answer ${acceptedAnswerId} not found`);
  }
  if (accepted.faq_item_id !== faqItemId) {
    throw new Error('Accepted answer must belong to this question');
  }
}

async function allocateNextFaqItemSlug(
  ctx: MutationCtx,
  rulesetId: Id<'rulesets'>
): Promise<string> {
  const counterKey = `faq_item_slug:${rulesetId}`;
  let counter = await ctx.db
    .query('counters')
    .withIndex('by_key', (q) => q.eq('key', counterKey))
    .unique();

  if (!counter) {
    const inserted = await ctx.db.insert('counters', { key: counterKey, value: 0 });
    counter = await ctx.db.get(inserted);
    if (!counter) {
      throw new Error(`Failed to initialize FAQ slug counter for ruleset ${rulesetId}`);
    }
  }

  let candidate = counter.value + 1;
  while (true) {
    const slug = String(candidate);
    const existing = await ctx.db
      .query('faq_items')
      .withIndex('by_ruleset_slug', (q) => q.eq('ruleset_id', rulesetId).eq('slug', slug))
      .unique();
    if (!existing) {
      await ctx.db.patch(counter._id, { value: candidate });
      return slug;
    }
    candidate += 1;
  }
}

export const byRuleset = query({
  args: { ruleset_id: v.id('rulesets') },
  handler: async (ctx, args) => loadFaqItemsForRuleset(ctx, args.ruleset_id),
});

export const detail = query({
  args: { id: v.id('faq_items') },
  handler: async (ctx, args) => {
    const item = await getFaqItem(ctx, args.id);
    if (!item) {
      throw new Error(`FAQ item ${args.id} not found`);
    }
    const answers = await ctx.db
      .query('faq_answers')
      .withIndex('by_faq_item_created', (q) => q.eq('faq_item_id', item._id))
      .take(200);
    return {
      ...item,
      faq_answers: answers,
    };
  },
});

export const detailByRulesetSlugAndQuestionSlug = query({
  args: {
    ruleset_slug: v.string(),
    question_slug: v.string(),
  },
  handler: async (ctx, args) => {
    const ruleset = await getRulesetBySlug(ctx, args.ruleset_slug);
    if (!ruleset || ruleset.is_deleted) {
      throw new Error(`Ruleset with slug ${args.ruleset_slug} not found`);
    }
    const item = await ctx.db
      .query('faq_items')
      .withIndex('by_ruleset_slug', (q) =>
        q.eq('ruleset_id', ruleset._id).eq('slug', args.question_slug)
      )
      .unique();
    if (!item) {
      throw new Error(
        `FAQ item with slug ${args.question_slug} not found in ruleset ${args.ruleset_slug}`
      );
    }
    const answers = await ctx.db
      .query('faq_answers')
      .withIndex('by_faq_item_created', (q) => q.eq('faq_item_id', item._id))
      .take(200);
    const answerers = await Promise.all(
      answers.map((answer) => profileSummary(ctx, answer.answered_by))
    );
    const askerProfile = await profileSummary(ctx, item.asked_by);
    return {
      ...item,
      ruleset: {
        id: ruleset._id,
        slug: ruleset.slug,
        name: ruleset.name,
      },
      asker_profile: askerProfile,
      faq_answers: answers.map((answer, index) => ({
        ...answer,
        answerer_profile: answerers[index],
      })),
    };
  },
});

export const askedBy = query({
  args: { profile_id: v.id('users') },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query('faq_items')
      .withIndex('by_asked_by_created', (q) => q.eq('asked_by', args.profile_id))
      .take(200);
    const sorted = [...rows].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    return await Promise.all(
      sorted.map(async (item) => {
        const ruleset = await getRuleset(ctx, item.ruleset_id);
        if (!ruleset) {
          throw new Error(`Ruleset ${item.ruleset_id} missing for FAQ item ${item._id}`);
        }
        return {
          ...item,
          ruleset: { id: ruleset._id, name: ruleset.name, slug: ruleset.slug },
        };
      })
    );
  },
});

export const answeredBy = query({
  args: { profile_id: v.id('users') },
  handler: async (ctx, args) => {
    const answers = await ctx.db
      .query('faq_answers')
      .withIndex('by_answered_by_created', (q) => q.eq('answered_by', args.profile_id))
      .take(200);
    const sorted = [...answers].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    return await Promise.all(
      sorted.map(async (answer) => {
        const item = await getFaqItem(ctx, answer.faq_item_id);
        if (!item) {
          throw new Error(`FAQ item ${answer.faq_item_id} missing for answer ${answer._id}`);
        }
        const ruleset = await getRuleset(ctx, item.ruleset_id);
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
          ruleset: {
            id: ruleset._id,
            name: ruleset.name,
            slug: ruleset.slug,
          },
        };
      })
    );
  },
});

export const createItem = mutation({
  args: {
    ruleset_id: v.id('rulesets'),
    question: v.string(),
    answer: v.optional(v.string()),
    tags: v.array(faqTagValidator),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const ruleset = await getRuleset(ctx, args.ruleset_id);
    if (!ruleset || ruleset.is_deleted) {
      throw new Error('Ruleset not found');
    }
    const parsedQuestion = faqQuestionSchema.safeParse(args.question);
    if (!parsedQuestion.success) {
      const msg = parsedQuestion.error.issues.map((i) => i.message).join(' ');
      throw new Error(msg || 'Invalid FAQ input');
    }
    const normalizedQuestion = parsedQuestion.data;
    const parsedTags = faqTagsSchema.safeParse(args.tags);
    if (!parsedTags.success) {
      const msg = parsedTags.error.issues.map((i) => i.message).join(' ');
      throw new Error(msg || 'Invalid FAQ input');
    }
    const normalizedTags = parsedTags.data;

    const now = nowIso();
    const slug = await allocateNextFaqItemSlug(ctx, args.ruleset_id);
    const faqItemId = await ctx.db.insert('faq_items', {
      ruleset_id: args.ruleset_id,
      slug,
      question: normalizedQuestion,
      tags: normalizedTags,
      asked_by: userId,
      created_at: now,
      updated_at: now,
      accepted_answer_id: null,
    });
    const row = await ctx.db.get(faqItemId);
    if (!row) {
      throw new Error('Failed to create FAQ item');
    }

    const normalizedInitialAnswer = args.answer?.trim();
    let answerDelta = 0;
    if (normalizedInitialAnswer && normalizedInitialAnswer.length > 0) {
      const parsedAnswer = faqAnswerSchema.safeParse(normalizedInitialAnswer);
      if (!parsedAnswer.success) {
        const msg = parsedAnswer.error.issues.map((i) => i.message).join(' ');
        throw new Error(msg || 'Invalid FAQ input');
      }
      await ctx.db.insert('faq_answers', {
        faq_item_id: row._id,
        answer: parsedAnswer.data,
        answered_by: userId,
        created_at: nowIso(),
      });
      answerDelta = 1;
    }

    await adjustHomepageRulesetFaqTotals(ctx, ruleset._id, {
      questions: 1,
      answers: answerDelta,
    });

    return row;
  },
});

export const updateItem = mutation({
  args: {
    id: v.id('faq_items'),
    question: v.optional(v.string()),
    tags: v.optional(v.array(faqTagValidator)),
    accepted_answer_id: v.optional(v.union(v.id('faq_answers'), v.null())),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const item = await getFaqItem(ctx, args.id);
    if (!item) {
      throw new Error(`FAQ item ${args.id} not found`);
    }

    const ruleset = await getRuleset(ctx, item.ruleset_id);
    if (!ruleset || ruleset.is_deleted) {
      throw new Error('Ruleset not found');
    }
    if (item.asked_by !== userId) {
      throw new Error('Not authorized');
    }

    const patch: {
      updated_at: string;
      question?: string;
      tags?: (typeof FAQ_TAG_VALUES)[number][];
      accepted_answer_id?: Id<'faq_answers'> | null;
    } = {
      updated_at: nowIso(),
    };
    if (args.question !== undefined) {
      const parsedQuestion = faqQuestionSchema.safeParse(args.question);
      if (!parsedQuestion.success) {
        const msg = parsedQuestion.error.issues.map((i) => i.message).join(' ');
        throw new Error(msg || 'Invalid FAQ input');
      }
      patch.question = parsedQuestion.data;
    }
    if (args.accepted_answer_id !== undefined) {
      await assertAcceptedAnswerBelongsToItem(ctx, item._id, args.accepted_answer_id);
      patch.accepted_answer_id = args.accepted_answer_id;
    }
    if (args.tags !== undefined) {
      const parsedTags = faqTagsSchema.safeParse(args.tags);
      if (!parsedTags.success) {
        const msg = parsedTags.error.issues.map((i) => i.message).join(' ');
        throw new Error(msg || 'Invalid FAQ input');
      }
      patch.tags = parsedTags.data;
    }

    await ctx.db.patch(item._id, patch);
    const updated = await ctx.db.get(item._id);
    if (!updated) {
      throw new Error(`FAQ item ${args.id} not found`);
    }
    return updated;
  },
});

export const setAcceptedAnswer = mutation({
  args: {
    faq_item_id: v.id('faq_items'),
    accepted_answer_id: v.union(v.id('faq_answers'), v.null()),
  },
  handler: async (ctx, args) => {
    const item = await getFaqItem(ctx, args.faq_item_id);
    if (!item) {
      throw new Error(`FAQ item ${args.faq_item_id} not found`);
    }
    const userId = await requireAuthUserId(ctx);
    const ruleset = await getRuleset(ctx, item.ruleset_id);
    if (!ruleset || ruleset.is_deleted) {
      throw new Error('Ruleset not found');
    }
    if (item.asked_by !== userId) {
      throw new Error('Not authorized');
    }

    await assertAcceptedAnswerBelongsToItem(ctx, item._id, args.accepted_answer_id);

    await ctx.db.patch(item._id, {
      accepted_answer_id: args.accepted_answer_id,
      updated_at: nowIso(),
    });
    const updated = await ctx.db.get(item._id);
    if (!updated) {
      throw new Error(`FAQ item ${args.faq_item_id} not found`);
    }
    return updated;
  },
});

export const deleteItem = mutation({
  args: { id: v.id('faq_items') },
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const item = await getFaqItem(ctx, args.id);
    if (!item) {
      throw new Error(`FAQ item ${args.id} not found`);
    }

    const ruleset = await getRuleset(ctx, item.ruleset_id);
    if (!ruleset || ruleset.is_deleted) {
      throw new Error('Ruleset not found');
    }
    if (item.asked_by !== userId) {
      throw new Error('Not authorized');
    }

    const { deleted: deletedAnswerCount, shouldContinue } = await deleteFaqAnswerBatch(
      ctx,
      item._id
    );
    const done = !shouldContinue;
    if (done) {
      await ctx.db.delete(item._id);
    }
    await adjustHomepageRulesetFaqTotals(ctx, ruleset._id, {
      questions: done ? -1 : 0,
      answers: -deletedAnswerCount,
    });
    if (!done) {
      await ctx.scheduler.runAfter(0, internal.faq.deleteItemAnswerBatch, {
        faq_item_id: item._id,
        ruleset_id: ruleset._id,
      });
    }
    return { id: args.id, rulesetId: item.ruleset_id, askedBy: item.asked_by };
  },
});

export const deleteItemAnswerBatch = internalMutation({
  args: {
    faq_item_id: v.id('faq_items'),
    ruleset_id: v.id('rulesets'),
  },
  handler: async (ctx, args): Promise<{ deleted: number; done: boolean }> => {
    const item = await ctx.db.get(args.faq_item_id);
    const { deleted: deletedAnswerCount, shouldContinue } = await deleteFaqAnswerBatch(
      ctx,
      args.faq_item_id
    );
    const done = !shouldContinue;
    if (done && item) {
      await ctx.db.delete(item._id);
    }
    if (deletedAnswerCount > 0 || (done && item)) {
      await adjustHomepageRulesetFaqTotals(ctx, args.ruleset_id, {
        questions: done && item ? -1 : 0,
        answers: -deletedAnswerCount,
      });
    }
    if (!done) {
      await ctx.scheduler.runAfter(0, internal.faq.deleteItemAnswerBatch, args);
    }
    return { deleted: deletedAnswerCount, done };
  },
});

export const createAnswer = mutation({
  args: {
    faq_item_id: v.id('faq_items'),
    answer: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const parsedAnswer = faqAnswerSchema.safeParse(args.answer);
    if (!parsedAnswer.success) {
      const msg = parsedAnswer.error.issues.map((i) => i.message).join(' ');
      throw new Error(msg || 'Invalid FAQ input');
    }
    const item = await getFaqItem(ctx, args.faq_item_id);
    if (!item) {
      throw new Error('FAQ item not found');
    }
    const ruleset = await getRuleset(ctx, item.ruleset_id);
    if (!ruleset || ruleset.is_deleted) {
      throw new Error('Ruleset not found');
    }

    const existing = await ctx.db
      .query('faq_answers')
      .withIndex('by_faq_item_answered_by', (q) =>
        q.eq('faq_item_id', args.faq_item_id).eq('answered_by', userId)
      )
      .unique();
    if (existing) {
      throw new Error('You already answered this question');
    }

    const _id = await ctx.db.insert('faq_answers', {
      faq_item_id: args.faq_item_id,
      answer: parsedAnswer.data,
      answered_by: userId,
      created_at: nowIso(),
    });
    await adjustHomepageRulesetFaqTotals(ctx, ruleset._id, { answers: 1 });
    const row = await ctx.db.get(_id);
    if (!row) {
      throw new Error('Failed to create FAQ answer');
    }
    return row;
  },
});

export const updateAnswer = mutation({
  args: { id: v.id('faq_answers'), answer: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const parsedAnswer = faqAnswerSchema.safeParse(args.answer);
    if (!parsedAnswer.success) {
      const msg = parsedAnswer.error.issues.map((i) => i.message).join(' ');
      throw new Error(msg || 'Invalid FAQ input');
    }
    const answer = await getFaqAnswer(ctx, args.id);
    if (!answer) {
      throw new Error(`FAQ answer ${args.id} not found`);
    }
    if (answer.answered_by !== userId) {
      throw new Error('Not authorized');
    }

    await ctx.db.patch(answer._id, { answer: parsedAnswer.data });
    const updated = await ctx.db.get(answer._id);
    if (!updated) {
      throw new Error(`FAQ answer ${args.id} not found`);
    }
    return updated;
  },
});

export const deleteAnswer = mutation({
  args: { id: v.id('faq_answers') },
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const answer = await getFaqAnswer(ctx, args.id);
    if (!answer) {
      throw new Error(`FAQ answer ${args.id} not found`);
    }

    const item = await getFaqItem(ctx, answer.faq_item_id);
    if (!item) {
      throw new Error(`FAQ item ${answer.faq_item_id} not found`);
    }
    if (answer.answered_by !== userId && item.asked_by !== userId) {
      throw new Error('Not authorized');
    }

    if (item.accepted_answer_id === answer._id) {
      await ctx.db.patch(item._id, {
        accepted_answer_id: null,
        updated_at: nowIso(),
      });
    }

    await ctx.db.delete(answer._id);
    const ruleset = await getRuleset(ctx, item.ruleset_id);
    if (!ruleset) {
      throw new Error('Ruleset not found');
    }
    await adjustHomepageRulesetFaqTotals(ctx, ruleset._id, { answers: -1 });
    return { id: args.id, faqItemId: answer.faq_item_id, answeredBy: answer.answered_by };
  },
});
