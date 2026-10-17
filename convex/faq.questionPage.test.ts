/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vite-plus/test';

import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import schema from './schema';
import { faqQuestionPageAs } from './viewerAccess.test.fixture';

const modules = import.meta.glob('./**/*.ts');

type SeedResult = {
  askerId: Id<'users'>;
  answererId: Id<'users'>;
  thirdId: Id<'users'>;
  answererProfileId: Id<'profiles'>;
  acceptedAnswerId: Id<'faq_answers'>;
  ghostAnswerId: Id<'faq_answers'>;
  thirdAnswerId: Id<'faq_answers'>;
};

const at = (day: number) => `2026-07-${String(day).padStart(2, '0')}T00:00:00.000Z`;

async function seedQuestionPage(t: ReturnType<typeof convexTest>): Promise<SeedResult> {
  return await t.run(async (ctx) => {
    const askerId = await ctx.db.insert('users', { name: 'Asker' });
    const answererId = await ctx.db.insert('users', { name: 'Answerer' });
    const thirdId = await ctx.db.insert('users', { name: 'Third' });
    const ghostId = await ctx.db.insert('users', { name: 'Ghost' });

    const profile = (userId: Id<'users'>, name: string) =>
      ctx.db.insert('profiles', {
        user_id: userId,
        username: name,
        avatar_url: null,
        account_state: 'active',
        slug: name.toLowerCase(),
        created_at: at(1),
        updated_at: at(1),
      });
    await profile(askerId, 'Asker');
    const answererProfileId = await profile(answererId, 'Answerer');
    await profile(thirdId, 'Third');

    const rulesetId = await ctx.db.insert('rulesets', {
      name: 'Advanced',
      about: 'A test ruleset with an About long enough to satisfy the fifty character floor.',
      slug: 'advanced',
      created_at: at(1),
      updated_at: at(1),
      owner_id: askerId,
      group_id: null,
      is_deleted: false,
      image_cover: null,
    });

    const questionId = await ctx.db.insert('faq_items', {
      ruleset_id: rulesetId,
      slug: '1',
      question: 'How does the storm move?',
      asked_by: askerId,
      created_at: at(2),
      updated_at: at(2),
      accepted_answer_id: null,
    });

    const acceptedAnswerId = await ctx.db.insert('faq_answers', {
      faq_item_id: questionId,
      answer: 'One to six sectors.',
      answered_by: answererId,
      created_at: at(3),
    });
    const ghostAnswerId = await ctx.db.insert('faq_answers', {
      faq_item_id: questionId,
      answer: 'By storm deck.',
      answered_by: ghostId,
      created_at: at(4),
    });
    const thirdAnswerId = await ctx.db.insert('faq_answers', {
      faq_item_id: questionId,
      answer: 'Depends on the edition.',
      answered_by: thirdId,
      created_at: at(5),
    });
    await ctx.db.patch(questionId, { accepted_answer_id: acceptedAnswerId });

    return {
      askerId,
      answererId,
      thirdId,
      answererProfileId,
      acceptedAnswerId,
      ghostAnswerId,
      thirdAnswerId,
    };
  });
}

const locator = { rulesetSlug: 'advanced', questionSlug: '1' };

describe('FAQ question page projection (api.faq.question)', () => {
  test('anonymous viewers get the page with no capabilities', async () => {
    const t = convexTest(schema, modules);
    await seedQuestionPage(t);

    const page = await faqQuestionPageAs(t, locator);

    expect(page.viewer.answerQuestion).toBe(false);
    expect(page.question.capabilities).toEqual({ editQuestion: false, deleteQuestion: false });
    for (const answer of page.answers) {
      expect(answer.capabilities).toEqual({
        editAnswer: false,
        deleteAnswer: false,
        acceptAnswer: false,
        unacceptAnswer: false,
      });
    }
  });

  test('the page shows the newest answers, and the accepted one leads even when older than them', async () => {
    const t = convexTest(schema, modules);
    const seed = await seedQuestionPage(t);
    await t.run(async (ctx) => {
      const question = (await ctx.db.query('faq_items').first())!;
      for (let index = 0; index < 200; index += 1) {
        await ctx.db.insert('faq_answers', {
          faq_item_id: question._id,
          answer: `Filler ${index}`,
          answered_by: seed.thirdId,
          created_at: at(6),
        });
      }
    });

    const page = await t.query(api.faq.question, locator);

    expect(page.answers[0]).toMatchObject({ id: seed.acceptedAnswerId, accepted: true });
    expect(page.answers.slice(1).map((answer) => answer.text)).toEqual(
      Array.from({ length: 200 }, (_, index) => `Filler ${index}`)
    );
  });

  test('the question owner moderates: edit, delete, accept, unaccept', async () => {
    const t = convexTest(schema, modules);
    const seed = await seedQuestionPage(t);

    const page = await faqQuestionPageAs(t.withIdentity({ subject: seed.askerId }), locator);

    expect(page.question.capabilities).toEqual({ editQuestion: true, deleteQuestion: true });
    const accepted = page.answers.find((answer) => answer.id === seed.acceptedAnswerId);
    expect(accepted?.capabilities).toMatchObject({
      acceptAnswer: false,
      unacceptAnswer: true,
      deleteAnswer: true,
      editAnswer: false,
    });
    const third = page.answers.find((answer) => answer.id === seed.thirdAnswerId);
    expect(third?.capabilities).toMatchObject({ acceptAnswer: true, unacceptAnswer: false });
    expect(page.viewer.answerQuestion).toBe(true);
  });

  test('an answer author owns only their answer and cannot answer twice', async () => {
    const t = convexTest(schema, modules);
    const seed = await seedQuestionPage(t);

    const page = await faqQuestionPageAs(t.withIdentity({ subject: seed.answererId }), locator);

    const own = page.answers.find((answer) => answer.id === seed.acceptedAnswerId);
    expect(own?.capabilities).toMatchObject({ editAnswer: true, deleteAnswer: true });
    const others = page.answers.filter((answer) => answer.id !== seed.acceptedAnswerId);
    expect(others.every((answer) => !answer.capabilities.editAnswer)).toBe(true);
    expect(page.viewer.answerQuestion).toBe(false);
  });

  test('a missing author profile yields a null chip without corrupting the page', async () => {
    const t = convexTest(schema, modules);
    const seed = await seedQuestionPage(t);

    const page = await faqQuestionPageAs(t, locator);

    const ghost = page.answers.find((answer) => answer.id === seed.ghostAnswerId);
    expect(ghost?.author).toBeNull();
    expect(page.answers).toHaveLength(3);
    const accepted = page.answers.find((answer) => answer.id === seed.acceptedAnswerId);
    expect(accepted?.author).toEqual({
      id: seed.answererProfileId,
      slug: 'answerer',
      username: 'Answerer',
      avatarUrl: null,
    });
  });

  test('is the same answer for every viewer', async () => {
    const t = convexTest(schema, modules);
    const seed = await seedQuestionPage(t);

    const anonymous = await t.query(api.faq.question, locator);
    for (const userId of [seed.askerId, seed.answererId]) {
      expect(await t.withIdentity({ subject: userId }).query(api.faq.question, locator)).toEqual(anonymous);
    }
  });

  test('unknown locators throw', async () => {
    const t = convexTest(schema, modules);
    await seedQuestionPage(t);

    await expect(t.query(api.faq.question, { rulesetSlug: 'advanced', questionSlug: '99' })).rejects.toMatchObject({
      data: { code: 'NOT_FOUND' },
    });
    await expect(t.query(api.faq.question, { rulesetSlug: 'missing', questionSlug: '1' })).rejects.toMatchObject({
      data: { code: 'NOT_FOUND' },
    });
  });
});
