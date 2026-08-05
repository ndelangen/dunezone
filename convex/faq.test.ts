/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import aggregateTest from '@convex-dev/aggregate/test';
import { convexTest } from 'convex-test';
import { describe, expect, test, vi } from 'vitest';

import { api } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

function faqTest(
  transactionLimits?:
    | true
    | {
        bytesRead: number;
        bytesWritten: number;
      }
) {
  const t = transactionLimits
    ? convexTest({ schema, modules, transactionLimits })
    : convexTest(schema, modules);
  aggregateTest.register(t, 'statistics');
  aggregateTest.register(t, 'profileDiscovery');
  return t;
}

async function faqFixture() {
  const t = faqTest();
  const ids = await t.run(async (ctx) => ({
    ownerId: await ctx.db.insert('users', { name: 'Question owner' }),
    answererId: await ctx.db.insert('users', { name: 'Answer author' }),
    outsiderId: await ctx.db.insert('users', { name: 'Unrelated user' }),
  }));
  const owner = t.withIdentity({ subject: ids.ownerId });
  const answerer = t.withIdentity({ subject: ids.answererId });
  const outsider = t.withIdentity({ subject: ids.outsiderId });
  const ruleset = await owner.mutation(api.rulesets.create, {
    name: 'FAQBehaviorRuleset',
    group_id: null,
    image_cover: null,
  });

  return { t, ids, owner, answerer, outsider, ruleset };
}

describe('FAQ lifecycle', () => {
  test('creates questions with and without an atomic initial answer', async () => {
    const { owner, ruleset } = await faqFixture();

    const withoutAnswer = await owner.mutation(api.faq.createItem, {
      ruleset_id: ruleset._id,
      question: '  What happens without an initial answer?  ',
      tags: ['rules'],
    });
    const withoutAnswerPage = await owner.query(api.faq.detailByRulesetSlugAndQuestionSlug, {
      ruleset_slug: ruleset.slug,
      question_slug: withoutAnswer.slug,
    });
    expect(withoutAnswerPage).toMatchObject({
      question: 'What happens without an initial answer?',
      tags: ['rules'],
      accepted_answer_id: null,
      faq_answers: [],
    });

    const withAnswer = await owner.mutation(api.faq.createItem, {
      ruleset_id: ruleset._id,
      question: 'Can a question start answered?',
      answer: '  Yes, in the same mutation.  ',
      tags: ['errata'],
    });
    const withAnswerPage = await owner.query(api.faq.detailByRulesetSlugAndQuestionSlug, {
      ruleset_slug: ruleset.slug,
      question_slug: withAnswer.slug,
    });
    expect(withAnswerPage.faq_answers).toHaveLength(1);
    expect(withAnswerPage.faq_answers[0]).toMatchObject({
      faq_item_id: withAnswer._id,
      answer: 'Yes, in the same mutation.',
      answered_by: withAnswer.asked_by,
    });
  });

  test('enforces authoritative semantic validation for questions, tags, and answers', async () => {
    const { owner, answerer, ruleset } = await faqFixture();

    await expect(
      owner.mutation(api.faq.createItem, {
        ruleset_id: ruleset._id,
        question: '   ',
        tags: ['rules'],
      })
    ).rejects.toThrow('Question is required');
    await expect(
      owner.mutation(api.faq.createItem, {
        ruleset_id: ruleset._id,
        question: 'Which tag applies?',
        tags: [],
      })
    ).rejects.toThrow('Select at least one tag');

    const question = await owner.mutation(api.faq.createItem, {
      ruleset_id: ruleset._id,
      question: 'What makes an answer valid?',
      tags: ['rules'],
    });
    await expect(
      answerer.mutation(api.faq.createAnswer, {
        faq_item_id: question._id,
        answer: '   ',
      })
    ).rejects.toThrow('Answer is required');
  });

  test('allows at most one answer per user for a question', async () => {
    const { owner, answerer, ruleset } = await faqFixture();
    const question = await owner.mutation(api.faq.createItem, {
      ruleset_id: ruleset._id,
      question: 'Can one person answer twice?',
      tags: ['rules'],
    });

    await answerer.mutation(api.faq.createAnswer, {
      faq_item_id: question._id,
      answer: 'The first answer is accepted.',
    });
    await expect(
      answerer.mutation(api.faq.createAnswer, {
        faq_item_id: question._id,
        answer: 'The second answer is rejected.',
      })
    ).rejects.toThrow('You already answered this question');
  });

  test('keeps question ownership and answer moderation independent of ruleset membership', async () => {
    const t = faqTest();
    const ids = await t.run(async (ctx) => {
      const rulesetOwnerId = await ctx.db.insert('users', { name: 'Ruleset owner' });
      const groupMemberId = await ctx.db.insert('users', { name: 'Group member' });
      const questionOwnerId = await ctx.db.insert('users', { name: 'Question owner' });
      const outsiderId = await ctx.db.insert('users', { name: 'Unrelated user' });
      const groupId = await ctx.db.insert('groups', {
        name: 'FAQ maintainers',
        slug: 'faq-maintainers',
        created_at: '2026-08-05T00:00:00.000Z',
        created_by: rulesetOwnerId,
      });
      await ctx.db.insert('group_members', {
        group_id: groupId,
        user_id: rulesetOwnerId,
        status: 'active',
        requested_at: '2026-08-05T00:00:00.000Z',
        approved_at: '2026-08-05T00:00:00.000Z',
        approved_by: rulesetOwnerId,
      });
      await ctx.db.insert('group_members', {
        group_id: groupId,
        user_id: groupMemberId,
        status: 'active',
        requested_at: '2026-08-05T00:00:00.000Z',
        approved_at: '2026-08-05T00:00:00.000Z',
        approved_by: rulesetOwnerId,
      });
      return { rulesetOwnerId, groupMemberId, questionOwnerId, outsiderId, groupId };
    });
    const rulesetOwner = t.withIdentity({ subject: ids.rulesetOwnerId });
    const groupMember = t.withIdentity({ subject: ids.groupMemberId });
    const questionOwner = t.withIdentity({ subject: ids.questionOwnerId });
    const outsider = t.withIdentity({ subject: ids.outsiderId });
    const ruleset = await rulesetOwner.mutation(api.rulesets.create, {
      name: 'CollaborativeFAQRuleset',
      group_id: ids.groupId,
      image_cover: null,
    });
    const question = await questionOwner.mutation(api.faq.createItem, {
      ruleset_id: ruleset._id,
      question: 'Who controls this question?',
      tags: ['rules'],
    });
    const answer = await groupMember.mutation(api.faq.createAnswer, {
      faq_item_id: question._id,
      answer: 'The answer remains owned by its author.',
    });

    await expect(
      questionOwner.mutation(api.faq.updateItem, {
        id: question._id,
        question: 'Does its author control this question?',
      })
    ).resolves.toMatchObject({ question: 'Does its author control this question?' });
    await expect(
      groupMember.mutation(api.faq.updateAnswer, {
        id: answer._id,
        answer: 'Only the answer author may rewrite it.',
      })
    ).resolves.toMatchObject({ answer: 'Only the answer author may rewrite it.' });
    await expect(
      questionOwner.mutation(api.faq.updateAnswer, {
        id: answer._id,
        answer: 'The question owner may not rewrite it.',
      })
    ).rejects.toThrow('Not authorized');
    await expect(
      outsider.mutation(api.faq.updateItem, {
        id: question._id,
        question: 'An unrelated user cannot rewrite it.',
      })
    ).rejects.toThrow('Not authorized');
    await expect(outsider.mutation(api.faq.deleteItem, { id: question._id })).rejects.toThrow(
      'Not authorized'
    );
    await expect(outsider.mutation(api.faq.deleteAnswer, { id: answer._id })).rejects.toThrow(
      'Not authorized'
    );
    await expect(
      questionOwner.mutation(api.faq.deleteAnswer, { id: answer._id })
    ).resolves.toMatchObject({ id: answer._id });
    await expect(
      questionOwner.mutation(api.faq.deleteItem, { id: question._id })
    ).resolves.toMatchObject({ id: question._id });
  });

  test('accepts only an answer from the same question and supports unaccepting it', async () => {
    const { owner, answerer, outsider, ruleset } = await faqFixture();
    const question = await owner.mutation(api.faq.createItem, {
      ruleset_id: ruleset._id,
      question: 'Which answer is accepted?',
      tags: ['rules'],
    });
    const otherQuestion = await owner.mutation(api.faq.createItem, {
      ruleset_id: ruleset._id,
      question: 'Which answer belongs elsewhere?',
      tags: ['rules'],
    });
    const answer = await answerer.mutation(api.faq.createAnswer, {
      faq_item_id: question._id,
      answer: 'This answer belongs to the first question.',
    });
    const otherAnswer = await outsider.mutation(api.faq.createAnswer, {
      faq_item_id: otherQuestion._id,
      answer: 'This answer belongs to the second question.',
    });

    await expect(
      answerer.mutation(api.faq.setAcceptedAnswer, {
        faq_item_id: question._id,
        accepted_answer_id: answer._id,
      })
    ).rejects.toThrow('Not authorized');
    await expect(
      owner.mutation(api.faq.setAcceptedAnswer, {
        faq_item_id: question._id,
        accepted_answer_id: otherAnswer._id,
      })
    ).rejects.toThrow('Accepted answer must belong to this question');

    await owner.mutation(api.faq.setAcceptedAnswer, {
      faq_item_id: question._id,
      accepted_answer_id: answer._id,
    });
    expect(
      await owner.query(api.faq.detailByRulesetSlugAndQuestionSlug, {
        ruleset_slug: ruleset.slug,
        question_slug: question.slug,
      })
    ).toMatchObject({ accepted_answer_id: answer._id });

    await owner.mutation(api.faq.setAcceptedAnswer, {
      faq_item_id: question._id,
      accepted_answer_id: null,
    });
    expect(
      await owner.query(api.faq.detailByRulesetSlugAndQuestionSlug, {
        ruleset_slug: ruleset.slug,
        question_slug: question.slug,
      })
    ).toMatchObject({ accepted_answer_id: null });
  });

  test('clears acceptance when the accepted answer is deleted', async () => {
    const { owner, answerer, ruleset } = await faqFixture();
    const question = await owner.mutation(api.faq.createItem, {
      ruleset_id: ruleset._id,
      question: 'What happens when the accepted answer is removed?',
      tags: ['rules'],
    });
    const answer = await answerer.mutation(api.faq.createAnswer, {
      faq_item_id: question._id,
      answer: 'The accepted-answer reference is cleared.',
    });
    await owner.mutation(api.faq.setAcceptedAnswer, {
      faq_item_id: question._id,
      accepted_answer_id: answer._id,
    });

    await answerer.mutation(api.faq.deleteAnswer, { id: answer._id });

    const page = await owner.query(api.faq.detailByRulesetSlugAndQuestionSlug, {
      ruleset_slug: ruleset.slug,
      question_slug: question.slug,
    });
    expect(page.accepted_answer_id).toBeNull();
    expect(page.faq_answers).toEqual([]);
  });

  test('deletes large answer sets in bounded aggregate-safe batches', async () => {
    const t = faqTest(true);
    const userId = await t.run((ctx) => ctx.db.insert('users', { name: 'FAQ owner' }));
    const asUser = t.withIdentity({ subject: userId });
    const ruleset = await asUser.mutation(api.rulesets.create, {
      name: 'LargeFAQRuleset',
      group_id: null,
      image_cover: null,
    });
    const question = await asUser.mutation(api.faq.createItem, {
      ruleset_id: ruleset._id,
      question: 'How are large discussions deleted safely?',
      tags: ['rules'],
    });
    await t.run(async (ctx) => {
      for (let index = 0; index < 501; index += 1) {
        await ctx.db.insert('faq_answers', {
          faq_item_id: question._id,
          answer: `Answer ${index}`,
          answered_by: userId,
          created_at: new Date(index).toISOString(),
        });
      }
    });

    vi.useFakeTimers();
    try {
      await asUser.mutation(api.faq.deleteItem, { id: question._id });
      const afterFirstBatch = await t.run(async (ctx) => ({
        question: await ctx.db.get(question._id),
        answers: await ctx.db
          .query('faq_answers')
          .withIndex('by_faq_item_created', (q) => q.eq('faq_item_id', question._id))
          .take(600),
      }));
      expect(afterFirstBatch.question).not.toBeNull();
      expect(afterFirstBatch.answers).toHaveLength(401);

      await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    } finally {
      vi.useRealTimers();
    }

    const afterCleanup = await t.run(async (ctx) => ({
      question: await ctx.db.get(question._id),
      answers: await ctx.db
        .query('faq_answers')
        .withIndex('by_faq_item_created', (q) => q.eq('faq_item_id', question._id))
        .take(1),
    }));
    expect(afterCleanup.question).toBeNull();
    expect(afterCleanup.answers).toEqual([]);
  });

  test('reserves transaction headroom while deleting large answer documents', async () => {
    const t = faqTest({
      bytesRead: 3 * 1024 * 1024,
      bytesWritten: 3 * 1024 * 1024,
    });
    const userId = await t.run((ctx) => ctx.db.insert('users', { name: 'Large answer owner' }));
    const asUser = t.withIdentity({ subject: userId });
    const ruleset = await asUser.mutation(api.rulesets.create, {
      name: 'LargeAnswerRuleset',
      group_id: null,
      image_cover: null,
    });
    const question = await asUser.mutation(api.faq.createItem, {
      ruleset_id: ruleset._id,
      question: 'Can large answers be deleted without exhausting a transaction?',
      tags: ['rules'],
    });
    const largeAnswer = 'a'.repeat(400 * 1024);
    for (let index = 0; index < 6; index += 1) {
      await t.run((ctx) =>
        ctx.db.insert('faq_answers', {
          faq_item_id: question._id,
          answer: largeAnswer,
          answered_by: userId,
          created_at: new Date(index).toISOString(),
        })
      );
    }

    vi.useFakeTimers();
    try {
      await asUser.mutation(api.faq.deleteItem, { id: question._id });
      const remainingAfterFirstBatch = await t.run((ctx) =>
        ctx.db
          .query('faq_answers')
          .withIndex('by_faq_item_created', (q) => q.eq('faq_item_id', question._id))
          .take(10)
      );
      expect(remainingAfterFirstBatch.length).toBeGreaterThan(0);
      expect(remainingAfterFirstBatch.length).toBeLessThan(6);

      await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    } finally {
      vi.useRealTimers();
    }

    const afterCleanup = await t.run(async (ctx) => ({
      question: await ctx.db.get(question._id),
      answers: await ctx.db
        .query('faq_answers')
        .withIndex('by_faq_item_created', (q) => q.eq('faq_item_id', question._id))
        .take(1),
    }));
    expect(afterCleanup.question).toBeNull();
    expect(afterCleanup.answers).toEqual([]);
  });
});
