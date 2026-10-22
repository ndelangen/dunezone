import { paginationOptsValidator, paginationResultValidator } from 'convex/server';
import { v } from 'convex/values';

import type { FAQ_TAG_VALUES } from '../src/shared/faq/tags';
import { faqAnswerSchema, faqQuestionSchema, faqTagsSchema } from '../src/shared/faq/validation';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { internalMutation, mutation, publicQuery, viewerQuery } from './functions';
import { assignedGroupSummary } from './lib/collaborativeAccess';
import {
  faqListItemValidator,
  assignedGroupSummaryValidator,
  relatedFaqItemValidator,
  docValidator,
} from './lib/collaborativeAccessValidators';
import { loadRulesetFaqPage, loadRulesetFaqSearch, rulesetFaqSearchText } from './lib/faqCatalogue';
import {
  globalFaqPageValidator,
  globalFaqRulesetOptionsValidator,
  loadGlobalFaqPage,
  loadGlobalFaqRulesetOptions,
} from './lib/faqGlobalSearch';
import {
  faqQuestionPublicPageValidator,
  loadFaqQuestionPublicPage,
  loadFaqQuestionAtLocator,
  loadViewerAnswered,
} from './lib/faqQuestionPage';
import { loadRelatedFaqForQuestion } from './lib/faqQuestionRelated';
import { faqReferencePreview, faqReferencePreviewValidator } from './lib/faqReferencePreviews';
import { loadFaqReferenceTargets } from './lib/faqReferences';
import { faqTagValidator } from './lib/faqTags';
import { requireAuthUserId } from './lib/policy';
import { loadPublicRulesetBySlug } from './lib/rulesetDetailPage';
import { nowIso } from './lib/utils';
import type { MutationCtx, QueryCtx } from './types';

const FAQ_ITEM_DELETE_BATCH_MAX_DOCUMENTS = 100;
const FAQ_ITEM_DELETE_TRANSACTION_RESERVE_BYTES = 2 * 1024 * 1024;
const FAQ_ITEM_DELETE_TRANSACTION_RESERVE_OPERATIONS = 16;

async function getRuleset(ctx: QueryCtx | MutationCtx, id: Id<'rulesets'>) {
  return await ctx.db.get(id);
}

async function getFaqItem(ctx: QueryCtx | MutationCtx, id: Id<'faq_items'>) {
  return await ctx.db.get(id);
}

async function getFaqAnswer(ctx: QueryCtx | MutationCtx, id: Id<'faq_answers'>) {
  return await ctx.db.get(id);
}

async function deleteFaqItemChildrenBatch(ctx: MutationCtx, faqItemId: Id<'faq_items'>) {
  let deleted = 0;
  const children = [
    ctx.db.query('faq_answers').withIndex('by_faq_item_created', (q) => q.eq('faq_item_id', faqItemId)),
    ctx.db.query('faq_references').withIndex('by_faq_item_id_and_target_id', (q) => q.eq('faq_item_id', faqItemId)),
  ];
  for (const query of children) {
    for await (const child of query) {
      await ctx.db.delete(child._id);
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

async function allocateNextFaqItemSlug(ctx: MutationCtx, rulesetId: Id<'rulesets'>): Promise<string> {
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

const rulesetCitationValidator = v.object({ id: v.id('rulesets'), name: v.string(), slug: v.string() });

/** A browsed page of a ruleset's FAQ: newest first, counted, in numbered pages. */
const rulesetFaqBrowseValidator = v.object({
  ruleset: rulesetCitationValidator,
  items: v.array(faqListItemValidator),
  /** Questions carrying the tag, or all of them, across every page. */
  total: v.number(),
  /** Always true now that a search is never paged; kept so the browse shape stays the one the page reads. */
  complete: v.boolean(),
  /** The page these rows are, which may lie past `pageCount`, with no rows. */
  page: v.number(),
  pageCount: v.number(),
  pageSize: v.number(),
});

/** A searched FAQ: the best matches first, no count and no pages, and more by asking for a larger limit. */
const rulesetFaqSearchValidator = v.object({
  mode: v.literal('search'),
  ruleset: rulesetCitationValidator,
  items: v.array(faqListItemValidator),
  /** Whether a larger limit would show more questions. */
  hasMore: v.boolean(),
  /** Whether more questions may match than one search shows, so the reader should add a word rather than load more. */
  capped: v.boolean(),
  /** The limit these rows answer, after clamping. */
  limit: v.number(),
});

/**
 * A ruleset's FAQ, one cached answer for every viewer: newest first in pages while browsing, and the best matches of a search up to `limit`, which loads more.
 * Null for an unknown ruleset.
 */
export const rulesetFaq = publicQuery({
  args: {
    rulesetSlug: v.string(),
    q: v.optional(v.string()),
    tag: v.optional(faqTagValidator),
    page: v.optional(v.number()),
    /** How many of the best matches to return; Load more asks again with a larger one. */
    limit: v.optional(v.number()),
  },
  returns: v.union(rulesetFaqBrowseValidator, rulesetFaqSearchValidator, v.null()),
  handler: async (ctx, args) => {
    const ruleset = await loadPublicRulesetBySlug(ctx, args.rulesetSlug);
    if (!ruleset) {
      return null;
    }
    const citation = { id: ruleset._id, name: ruleset.name, slug: ruleset.slug };
    /* Gated on the text the search runs, so a query that is blank once cut to length browses instead. */
    const list = rulesetFaqSearchText(args.q)
      ? await loadRulesetFaqSearch(ctx, ruleset._id, args)
      : await loadRulesetFaqPage(ctx, ruleset._id, args);
    return { ruleset: citation, ...list };
  },
});

/** The rulesets the global FAQ can be narrowed to: every live one holding questions, by name, with its count. One cached answer for every viewer and every search. */
export const rulesetOptions = publicQuery({
  args: {},
  returns: globalFaqRulesetOptionsValidator,
  handler: async (ctx) => await loadGlobalFaqRulesetOptions(ctx),
});

/**
 * One page of the global FAQ: questions matching a search across every ruleset, or the rulesets picked, best match first.
 * Before any search it returns no questions;
 * one cached answer for every viewer.
 */
export const search = publicQuery({
  args: {
    q: v.optional(v.string()),
    /** Ruleset slugs; none searches every ruleset. */
    rulesets: v.optional(v.array(v.string())),
    /** How many of the best matches to return; Load more asks again with a larger one. */
    limit: v.optional(v.number()),
  },
  returns: globalFaqPageValidator,
  handler: async (ctx, args) => await loadGlobalFaqPage(ctx, args),
});

/** The FAQ question page, one cached answer for every viewer. The browser combines its authorship facts with the viewer. */
export const question = publicQuery({
  args: { rulesetSlug: v.string(), questionSlug: v.string() },
  returns: faqQuestionPublicPageValidator,
  handler: async (ctx, args) => await loadFaqQuestionPublicPage(ctx, args),
});

const referencedQuestionValidator = faqQuestionPublicPageValidator.extend({
  relatedQuestions: v.array(relatedFaqItemValidator),
  referenceRuleset: v.object({
    owner_id: v.id('users'),
    assignedGroup: v.union(assignedGroupSummaryValidator, v.null()),
  }),
});

/** One page-data query, whose cursor ranges keep every loaded reference reactive. */
export const questionPage = publicQuery({
  args: { rulesetSlug: v.string(), questionSlug: v.string(), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(
    v.object({ detail: v.union(referencedQuestionValidator, v.null()), items: v.array(faqReferencePreviewValidator) })
  ),
  handler: async (ctx, args) => {
    const { item, ruleset } = await loadFaqQuestionAtLocator(ctx, args);
    const references = await loadFaqReferenceTargets(ctx, item._id, args.paginationOpts);
    const detail =
      args.paginationOpts.cursor === null
        ? {
            ...(await loadFaqQuestionPublicPage(ctx, args)),
            relatedQuestions: await loadRelatedFaqForQuestion(ctx, item._id),
            referenceRuleset: {
              owner_id: ruleset.owner_id,
              assignedGroup: await assignedGroupSummary(ctx, ruleset.group_id),
            },
          }
        : null;
    const items = await Promise.all(references.page.map((target) => faqReferencePreview(ctx, target)));
    return { ...references, page: [{ detail, items }] };
  },
});

/** Whether the viewer has answered one FAQ question: the viewer half of the question page's answer form. Null asks about no question. */
export const viewerAnswered = viewerQuery({
  args: { questionId: v.union(v.id('faq_items'), v.null()) },
  returns: v.boolean(),
  handler: async (ctx, args) => await loadViewerAnswered(ctx, args.questionId),
});

async function createQuestionHandler(
  ctx: MutationCtx,
  args: {
    rulesetId: Id<'rulesets'>;
    question: string;
    initialAnswer?: string;
    tags: (typeof FAQ_TAG_VALUES)[number][];
  }
) {
  const userId = await requireAuthUserId(ctx);
  const ruleset = await getRuleset(ctx, args.rulesetId);
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
  const slug = await allocateNextFaqItemSlug(ctx, args.rulesetId);
  const faqItemId = await ctx.db.insert('faq_items', {
    ruleset_id: args.rulesetId,
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

  const normalizedInitialAnswer = args.initialAnswer?.trim();
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
  }

  return row;
}

export const createQuestion = mutation({
  args: {
    rulesetId: v.id('rulesets'),
    question: v.string(),
    initialAnswer: v.optional(v.string()),
    tags: v.array(faqTagValidator),
  },
  handler: async (ctx, args) => {
    const question = await createQuestionHandler(ctx, args);
    const ruleset = await getRuleset(ctx, question.ruleset_id);
    if (!ruleset || ruleset.is_deleted) {
      throw new Error('Ruleset not found');
    }
    return {
      questionId: question._id,
      rulesetSlug: ruleset.slug,
      questionSlug: question.slug,
    };
  },
});

async function editQuestionHandler(
  ctx: MutationCtx,
  args: {
    questionId: Id<'faq_items'>;
    input: {
      question: string;
      tags: (typeof FAQ_TAG_VALUES)[number][];
    };
  }
) {
  const userId = await requireAuthUserId(ctx);
  const item = await getFaqItem(ctx, args.questionId);
  if (!item) {
    throw new Error(`FAQ item ${args.questionId} not found`);
  }

  const ruleset = await getRuleset(ctx, item.ruleset_id);
  if (!ruleset || ruleset.is_deleted) {
    throw new Error('Ruleset not found');
  }
  if (item.asked_by !== userId) {
    throw new Error('Not authorized');
  }

  const parsedQuestion = faqQuestionSchema.safeParse(args.input.question);
  if (!parsedQuestion.success) {
    const msg = parsedQuestion.error.issues.map((i) => i.message).join(' ');
    throw new Error(msg || 'Invalid FAQ input');
  }
  const parsedTags = faqTagsSchema.safeParse(args.input.tags);
  if (!parsedTags.success) {
    const msg = parsedTags.error.issues.map((i) => i.message).join(' ');
    throw new Error(msg || 'Invalid FAQ input');
  }

  await ctx.db.patch(item._id, {
    question: parsedQuestion.data,
    tags: parsedTags.data,
    updated_at: nowIso(),
  });
  const updated = await ctx.db.get(item._id);
  if (!updated) {
    throw new Error(`FAQ item ${args.questionId} not found`);
  }
  return updated;
}

export const editQuestion = mutation({
  args: {
    questionId: v.id('faq_items'),
    input: v.object({
      question: v.string(),
      tags: v.array(faqTagValidator),
    }),
  },
  handler: editQuestionHandler,
});

export const setAcceptedAnswer = mutation({
  args: {
    faq_item_id: v.id('faq_items'),
    accepted_answer_id: v.union(v.id('faq_answers'), v.null()),
  },
  returns: docValidator('faq_items'),
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

    if (item.accepted_answer_id === args.accepted_answer_id) {
      return item;
    }
    const acceptedAt = nowIso();
    await ctx.db.patch(item._id, {
      accepted_answer_id: args.accepted_answer_id,
      accepted_at: args.accepted_answer_id ? acceptedAt : null,
      updated_at: acceptedAt,
    });
    const updated = await ctx.db.get(item._id);
    if (!updated) {
      throw new Error(`FAQ item ${args.faq_item_id} not found`);
    }
    return updated;
  },
});

async function deleteQuestionHandler(ctx: MutationCtx, args: { questionId: Id<'faq_items'> }) {
  const userId = await requireAuthUserId(ctx);
  const item = await getFaqItem(ctx, args.questionId);
  if (!item) {
    throw new Error(`FAQ item ${args.questionId} not found`);
  }

  const ruleset = await getRuleset(ctx, item.ruleset_id);
  if (!ruleset || ruleset.is_deleted) {
    throw new Error('Ruleset not found');
  }
  if (item.asked_by !== userId) {
    throw new Error('Not authorized');
  }

  const { shouldContinue } = await deleteFaqItemChildrenBatch(ctx, item._id);
  const done = !shouldContinue;
  if (done) {
    await ctx.db.delete(item._id);
  }
  if (!done) {
    await ctx.scheduler.runAfter(0, internal.faq.deleteItemAnswerBatch, {
      faq_item_id: item._id,
    });
  }
  return { id: args.questionId, rulesetId: item.ruleset_id, askedBy: item.asked_by };
}

export const deleteQuestion = mutation({
  args: { questionId: v.id('faq_items') },
  handler: deleteQuestionHandler,
});

export const deleteItemAnswerBatch = internalMutation({
  args: {
    faq_item_id: v.id('faq_items'),
  },
  handler: async (ctx, args): Promise<{ deleted: number; done: boolean }> => {
    const item = await ctx.db.get(args.faq_item_id);
    const { deleted, shouldContinue } = await deleteFaqItemChildrenBatch(ctx, args.faq_item_id);
    const done = !shouldContinue;
    if (done && item) {
      await ctx.db.delete(item._id);
    }
    if (!done) {
      await ctx.scheduler.runAfter(0, internal.faq.deleteItemAnswerBatch, args);
    }
    return { deleted, done };
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
      .withIndex('by_faq_item_answered_by', (q) => q.eq('faq_item_id', args.faq_item_id).eq('answered_by', userId))
      .first();
    if (existing) {
      throw new Error('You already answered this question');
    }

    const _id = await ctx.db.insert('faq_answers', {
      faq_item_id: args.faq_item_id,
      answer: parsedAnswer.data,
      answered_by: userId,
      created_at: nowIso(),
    });
    const row = await ctx.db.get(_id);
    if (!row) {
      throw new Error('Failed to create FAQ answer');
    }
    return row;
  },
});

async function editAnswerHandler(ctx: MutationCtx, args: { answerId: Id<'faq_answers'>; input: { answer: string } }) {
  const userId = await requireAuthUserId(ctx);
  const parsedAnswer = faqAnswerSchema.safeParse(args.input.answer);
  if (!parsedAnswer.success) {
    const msg = parsedAnswer.error.issues.map((i) => i.message).join(' ');
    throw new Error(msg || 'Invalid FAQ input');
  }
  const answer = await getFaqAnswer(ctx, args.answerId);
  if (!answer) {
    throw new Error(`FAQ answer ${args.answerId} not found`);
  }
  if (answer.answered_by !== userId) {
    throw new Error('Not authorized');
  }
  const item = await getFaqItem(ctx, answer.faq_item_id);
  const ruleset = item ? await getRuleset(ctx, item.ruleset_id) : null;
  if (!ruleset || ruleset.is_deleted) {
    throw new Error('Ruleset not found');
  }

  await ctx.db.patch(answer._id, { answer: parsedAnswer.data });
  const updated = await ctx.db.get(answer._id);
  if (!updated) {
    throw new Error(`FAQ answer ${args.answerId} not found`);
  }
  return updated;
}

export const editAnswer = mutation({
  args: {
    answerId: v.id('faq_answers'),
    input: v.object({ answer: v.string() }),
  },
  handler: editAnswerHandler,
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
        accepted_at: null,
        updated_at: nowIso(),
      });
    }

    await ctx.db.delete(answer._id);
    const ruleset = await getRuleset(ctx, item.ruleset_id);
    if (!ruleset) {
      throw new Error('Ruleset not found');
    }
    return { id: args.id, faqItemId: answer.faq_item_id, answeredBy: answer.answered_by };
  },
});
