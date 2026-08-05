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

    const withoutAnswer = await owner.mutation(api.faq.createQuestion, {
      rulesetId: ruleset._id,
      question: '  What happens without an initial answer?  ',
      tags: ['rules'],
    });
    const withoutAnswerPage = await owner.query(api.faq.questionPage, {
      rulesetSlug: ruleset.slug,
      questionSlug: withoutAnswer.questionSlug,
    });
    expect(withoutAnswerPage).toMatchObject({
      question: { text: 'What happens without an initial answer?', tags: ['rules'] },
      answers: [],
    });

    const withAnswer = await owner.mutation(api.faq.createQuestion, {
      rulesetId: ruleset._id,
      question: 'Can a question start answered?',
      initialAnswer: '  Yes, in the same mutation.  ',
      tags: ['errata'],
    });
    const withAnswerPage = await owner.query(api.faq.questionPage, {
      rulesetSlug: ruleset.slug,
      questionSlug: withAnswer.questionSlug,
    });
    expect(withAnswerPage.answers).toHaveLength(1);
    expect(withAnswerPage.answers[0]).toMatchObject({
      text: 'Yes, in the same mutation.',
    });
  });

  test('keeps only the agreed widened-release aliases behaviorally compatible', async () => {
    const { owner, answerer, ruleset } = await faqFixture();
    const question = await owner.mutation(api.faq.createItem, {
      ruleset_id: ruleset._id,
      question: 'Does the old application transport still work?',
      tags: ['rules'],
    });
    await owner.mutation(api.faq.updateItem, {
      id: question._id,
      question: 'Do the temporary aliases still work?',
    });
    const answer = await answerer.mutation(api.faq.createAnswer, {
      faq_item_id: question._id,
      answer: 'Yes, during the widened deployment.',
    });
    await answerer.mutation(api.faq.updateAnswer, {
      id: answer._id,
      answer: 'Yes, until the narrowed deployment.',
    });

    const legacyPage = await owner.query(api.faq.detailByRulesetSlugAndQuestionSlug, {
      ruleset_slug: ruleset.slug,
      question_slug: question.slug,
    });
    expect(legacyPage).toMatchObject({
      question: 'Do the temporary aliases still work?',
      faq_answers: [{ answer: 'Yes, until the narrowed deployment.' }],
    });
    await expect(owner.mutation(api.faq.deleteItem, { id: question._id })).resolves.toMatchObject({
      id: question._id,
    });
  });

  test('projects accepted-first answers and viewer capabilities on the server', async () => {
    const { owner, answerer, outsider, ruleset } = await faqFixture();
    const question = await owner.mutation(api.faq.createQuestion, {
      rulesetId: ruleset._id,
      question: 'Which answer should appear first?',
      tags: ['rules'],
    });
    const first = await answerer.mutation(api.faq.createAnswer, {
      faq_item_id: question.questionId,
      answer: 'The earlier answer.',
    });
    const accepted = await outsider.mutation(api.faq.createAnswer, {
      faq_item_id: question.questionId,
      answer: 'The accepted answer.',
    });
    await owner.mutation(api.faq.setAcceptedAnswer, {
      faq_item_id: question.questionId,
      accepted_answer_id: accepted._id,
    });

    const ownerPage = await owner.query(api.faq.questionPage, {
      rulesetSlug: ruleset.slug,
      questionSlug: question.questionSlug,
    });
    expect(ownerPage.question.capabilities).toEqual({
      editQuestion: true,
      deleteQuestion: true,
    });
    expect(ownerPage.answers.map((answer) => answer.id)).toEqual([accepted._id, first._id]);
    expect(ownerPage.answers[0].capabilities).toMatchObject({
      deleteAnswer: true,
      acceptAnswer: false,
      unacceptAnswer: true,
    });

    const answererPage = await answerer.query(api.faq.questionPage, {
      rulesetSlug: ruleset.slug,
      questionSlug: question.questionSlug,
    });
    expect(answererPage.viewer.answerQuestion).toBe(false);
    expect(
      answererPage.answers.find((answer) => answer.id === first._id)?.capabilities
    ).toMatchObject({
      editAnswer: true,
      deleteAnswer: true,
    });
  });

  test('enforces authoritative semantic validation for questions, tags, and answers', async () => {
    const { owner, answerer, ruleset } = await faqFixture();

    await expect(
      owner.mutation(api.faq.createQuestion, {
        rulesetId: ruleset._id,
        question: '   ',
        tags: ['rules'],
      })
    ).rejects.toThrow('Question is required');
    await expect(
      owner.mutation(api.faq.createQuestion, {
        rulesetId: ruleset._id,
        question: 'Which tag applies?',
        tags: [],
      })
    ).rejects.toThrow('Select at least one tag');

    const question = await owner.mutation(api.faq.createQuestion, {
      rulesetId: ruleset._id,
      question: 'What makes an answer valid?',
      tags: ['rules'],
    });
    await expect(
      answerer.mutation(api.faq.createAnswer, {
        faq_item_id: question.questionId,
        answer: '   ',
      })
    ).rejects.toThrow('Answer is required');
  });

  test('allows at most one answer per user for a question', async () => {
    const { owner, answerer, ruleset } = await faqFixture();
    const question = await owner.mutation(api.faq.createQuestion, {
      rulesetId: ruleset._id,
      question: 'Can one person answer twice?',
      tags: ['rules'],
    });

    await answerer.mutation(api.faq.createAnswer, {
      faq_item_id: question.questionId,
      answer: 'The first answer is accepted.',
    });
    await expect(
      answerer.mutation(api.faq.createAnswer, {
        faq_item_id: question.questionId,
        answer: 'The second answer is rejected.',
      })
    ).rejects.toThrow('You already answered this question');
  });

  test('does not offer another answer when the viewer answer is outside the visible bound', async () => {
    const { t, ids, owner, answerer, ruleset } = await faqFixture();
    const question = await owner.mutation(api.faq.createQuestion, {
      rulesetId: ruleset._id,
      question: 'Can a bounded page still detect that I answered?',
      tags: ['rules'],
    });
    await t.run(async (ctx) => {
      for (let index = 0; index < 200; index += 1) {
        await ctx.db.insert('faq_answers', {
          faq_item_id: question.questionId,
          answer: `Visible answer ${index}`,
          answered_by: ids.outsiderId,
          created_at: new Date(index).toISOString(),
        });
      }
      await ctx.db.insert('faq_answers', {
        faq_item_id: question.questionId,
        answer: 'The viewer answer beyond the page bound.',
        answered_by: ids.answererId,
        created_at: new Date(200).toISOString(),
      });
    });

    const page = await answerer.query(api.faq.questionPage, {
      rulesetSlug: ruleset.slug,
      questionSlug: question.questionSlug,
    });

    expect(page.answers).toHaveLength(200);
    expect(page.answers.some((answer) => answer.text.includes('viewer answer'))).toBe(false);
    expect(page.viewer.answerQuestion).toBe(false);
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
    const question = await questionOwner.mutation(api.faq.createQuestion, {
      rulesetId: ruleset._id,
      question: 'Who controls this question?',
      tags: ['rules'],
    });
    const answer = await groupMember.mutation(api.faq.createAnswer, {
      faq_item_id: question.questionId,
      answer: 'The answer remains owned by its author.',
    });

    await expect(
      questionOwner.mutation(api.faq.editQuestion, {
        questionId: question.questionId,
        input: { question: 'Does its author control this question?', tags: ['rules'] },
      })
    ).resolves.toMatchObject({ question: 'Does its author control this question?' });
    await expect(
      groupMember.mutation(api.faq.editAnswer, {
        answerId: answer._id,
        input: { answer: 'Only the answer author may rewrite it.' },
      })
    ).resolves.toMatchObject({ answer: 'Only the answer author may rewrite it.' });
    await expect(
      questionOwner.mutation(api.faq.editAnswer, {
        answerId: answer._id,
        input: { answer: 'The question owner may not rewrite it.' },
      })
    ).rejects.toThrow('Not authorized');
    await expect(
      outsider.mutation(api.faq.editQuestion, {
        questionId: question.questionId,
        input: { question: 'An unrelated user cannot rewrite it.', tags: ['rules'] },
      })
    ).rejects.toThrow('Not authorized');
    await expect(
      outsider.mutation(api.faq.deleteQuestion, { questionId: question.questionId })
    ).rejects.toThrow('Not authorized');
    await expect(outsider.mutation(api.faq.deleteAnswer, { id: answer._id })).rejects.toThrow(
      'Not authorized'
    );
    await expect(
      questionOwner.mutation(api.faq.deleteAnswer, { id: answer._id })
    ).resolves.toMatchObject({ id: answer._id });
    await expect(
      questionOwner.mutation(api.faq.deleteQuestion, { questionId: question.questionId })
    ).resolves.toMatchObject({ id: question.questionId });
  });

  test('accepts only an answer from the same question and supports unaccepting it', async () => {
    const { owner, answerer, outsider, ruleset } = await faqFixture();
    const question = await owner.mutation(api.faq.createQuestion, {
      rulesetId: ruleset._id,
      question: 'Which answer is accepted?',
      tags: ['rules'],
    });
    const otherQuestion = await owner.mutation(api.faq.createQuestion, {
      rulesetId: ruleset._id,
      question: 'Which answer belongs elsewhere?',
      tags: ['rules'],
    });
    const answer = await answerer.mutation(api.faq.createAnswer, {
      faq_item_id: question.questionId,
      answer: 'This answer belongs to the first question.',
    });
    const otherAnswer = await outsider.mutation(api.faq.createAnswer, {
      faq_item_id: otherQuestion.questionId,
      answer: 'This answer belongs to the second question.',
    });

    await expect(
      answerer.mutation(api.faq.setAcceptedAnswer, {
        faq_item_id: question.questionId,
        accepted_answer_id: answer._id,
      })
    ).rejects.toThrow('Not authorized');
    await expect(
      owner.mutation(api.faq.setAcceptedAnswer, {
        faq_item_id: question.questionId,
        accepted_answer_id: otherAnswer._id,
      })
    ).rejects.toThrow('Accepted answer must belong to this question');

    await owner.mutation(api.faq.setAcceptedAnswer, {
      faq_item_id: question.questionId,
      accepted_answer_id: answer._id,
    });
    expect(
      await owner.query(api.faq.questionPage, {
        rulesetSlug: ruleset.slug,
        questionSlug: question.questionSlug,
      })
    ).toMatchObject({ answers: [{ id: answer._id, accepted: true }] });

    await owner.mutation(api.faq.setAcceptedAnswer, {
      faq_item_id: question.questionId,
      accepted_answer_id: null,
    });
    expect(
      await owner.query(api.faq.questionPage, {
        rulesetSlug: ruleset.slug,
        questionSlug: question.questionSlug,
      })
    ).toMatchObject({ answers: [{ id: answer._id, accepted: false }] });
  });

  test('clears acceptance when the accepted answer is deleted', async () => {
    const { owner, answerer, ruleset } = await faqFixture();
    const question = await owner.mutation(api.faq.createQuestion, {
      rulesetId: ruleset._id,
      question: 'What happens when the accepted answer is removed?',
      tags: ['rules'],
    });
    const answer = await answerer.mutation(api.faq.createAnswer, {
      faq_item_id: question.questionId,
      answer: 'The accepted-answer reference is cleared.',
    });
    await owner.mutation(api.faq.setAcceptedAnswer, {
      faq_item_id: question.questionId,
      accepted_answer_id: answer._id,
    });

    await answerer.mutation(api.faq.deleteAnswer, { id: answer._id });

    const page = await owner.query(api.faq.questionPage, {
      rulesetSlug: ruleset.slug,
      questionSlug: question.questionSlug,
    });
    expect(page.answers).toEqual([]);
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
    const question = await asUser.mutation(api.faq.createQuestion, {
      rulesetId: ruleset._id,
      question: 'How are large discussions deleted safely?',
      tags: ['rules'],
    });
    await t.run(async (ctx) => {
      for (let index = 0; index < 501; index += 1) {
        await ctx.db.insert('faq_answers', {
          faq_item_id: question.questionId,
          answer: `Answer ${index}`,
          answered_by: userId,
          created_at: new Date(index).toISOString(),
        });
      }
    });

    vi.useFakeTimers();
    try {
      await asUser.mutation(api.faq.deleteQuestion, { questionId: question.questionId });
      const afterFirstBatch = await t.run(async (ctx) => ({
        question: await ctx.db.get(question.questionId),
        answers: await ctx.db
          .query('faq_answers')
          .withIndex('by_faq_item_created', (q) => q.eq('faq_item_id', question.questionId))
          .take(600),
      }));
      expect(afterFirstBatch.question).not.toBeNull();
      expect(afterFirstBatch.answers).toHaveLength(401);

      await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    } finally {
      vi.useRealTimers();
    }

    const afterCleanup = await t.run(async (ctx) => ({
      question: await ctx.db.get(question.questionId),
      answers: await ctx.db
        .query('faq_answers')
        .withIndex('by_faq_item_created', (q) => q.eq('faq_item_id', question.questionId))
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
    const question = await asUser.mutation(api.faq.createQuestion, {
      rulesetId: ruleset._id,
      question: 'Can large answers be deleted without exhausting a transaction?',
      tags: ['rules'],
    });
    const largeAnswer = 'a'.repeat(400 * 1024);
    for (let index = 0; index < 6; index += 1) {
      await t.run((ctx) =>
        ctx.db.insert('faq_answers', {
          faq_item_id: question.questionId,
          answer: largeAnswer,
          answered_by: userId,
          created_at: new Date(index).toISOString(),
        })
      );
    }

    vi.useFakeTimers();
    try {
      await asUser.mutation(api.faq.deleteQuestion, { questionId: question.questionId });
      const remainingAfterFirstBatch = await t.run((ctx) =>
        ctx.db
          .query('faq_answers')
          .withIndex('by_faq_item_created', (q) => q.eq('faq_item_id', question.questionId))
          .take(10)
      );
      expect(remainingAfterFirstBatch.length).toBeGreaterThan(0);
      expect(remainingAfterFirstBatch.length).toBeLessThan(6);

      await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    } finally {
      vi.useRealTimers();
    }

    const afterCleanup = await t.run(async (ctx) => ({
      question: await ctx.db.get(question.questionId),
      answers: await ctx.db
        .query('faq_answers')
        .withIndex('by_faq_item_created', (q) => q.eq('faq_item_id', question.questionId))
        .take(1),
    }));
    expect(afterCleanup.question).toBeNull();
    expect(afterCleanup.answers).toEqual([]);
  });
});
