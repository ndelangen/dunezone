// @vitest-environment edge-runtime
import { expect, test } from 'vite-plus/test';

import { api } from './_generated/api';
import { applicationTest } from './application.test.fixture';

const at = '2026-10-21T00:00:00.000Z';

test('list rows cite accepted authors beyond the answer window and keep references bounded and live', async () => {
  const t = applicationTest();
  const ids = await t.run(async (ctx) => {
    const asker = await ctx.db.insert('users', { name: 'Asker' });
    const answerer = await ctx.db.insert('users', { name: 'Answerer' });
    await ctx.db.insert('profiles', {
      user_id: answerer,
      slug: 'chani',
      username: 'Chani',
      account_state: 'active',
      avatar_url: null,
      created_at: at,
      updated_at: at,
    });
    const ruleset = await ctx.db.insert('rulesets', {
      name: 'Classic',
      slug: 'classic',
      about: 'Ruleset description',
      owner_id: asker,
      group_id: null,
      is_deleted: false,
      image_cover: null,
      created_at: at,
      updated_at: at,
    });
    const question = await ctx.db.insert('faq_items', {
      ruleset_id: ruleset,
      slug: 'question',
      question: 'A question?',
      asked_by: asker,
      accepted_answer_id: null,
      created_at: at,
      updated_at: at,
    });
    for (let i = 0; i < 50; i++) {
      await ctx.db.insert('faq_answers', {
        faq_item_id: question,
        answered_by: asker,
        answer: 'An unaccepted answer',
        created_at: at,
      });
    }
    const accepted = await ctx.db.insert('faq_answers', {
      faq_item_id: question,
      answered_by: answerer,
      answer: '*Accepted* answer.\n\n- First point\n- ' + 'A longer explanation. '.repeat(15),
      created_at: '2026-10-22T00:00:00.000Z',
    });
    await ctx.db.patch('faq_items', question, { accepted_answer_id: accepted });
    for (let i = 0; i < 8; i++) {
      const asset = await ctx.db.insert('assets', {
        owner_id: asker,
        group_id: null,
        slug: `asset-${i}`,
        type: 'card-treachery',
        data: { name: `Asset ${i}` },
        is_deleted: i === 0,
        created_at: at,
        updated_at: at,
      });
      await ctx.db.insert('faq_references', {
        faq_item_id: question,
        question_created_at: at,
        kind: 'asset',
        target_id: asset,
      });
    }
    return { question, accepted, ruleset };
  });
  const row = (await t.query(api.rulesets.detailPage, { slug: 'classic' }))!.faqPreview[0]!;
  expect(row.faq_answers).toHaveLength(50);
  expect(row.list_details.has_more_answers).toBe(true);
  expect(row.list_details.accepted_answer?.excerpt).toMatch(/^Accepted answer\. First point A longer explanation\./);
  expect(Array.from(row.list_details.accepted_answer!.excerpt)).toHaveLength(181);
  expect(row.list_details.accepted_answer?.excerpt.endsWith('…')).toBe(true);
  expect(row.list_details.answerers).toMatchObject([{ slug: 'chani', username: 'Chani' }]);
  expect(row.list_details.references.length).toBeLessThanOrEqual(6);
  expect(row.list_details.references.some((reference) => reference.slug === 'asset-0')).toBe(false);
  expect(row.list_details.has_more_references).toBe(true);

  await t.run((ctx) => ctx.db.patch('faq_items', ids.question, { accepted_answer_id: null }));
  const discussion = (await t.query(api.rulesets.detailPage, { slug: 'classic' }))!.faqPreview[0]!;
  expect(discussion.list_details.accepted_answer).toBeNull();
  expect(discussion.list_details.answerers).toEqual([null]);
  expect(discussion.list_details.has_more_answers).toBe(true);
});

test('a stale accepted-answer pointer never previews another question', async () => {
  const t = applicationTest();
  await t.run(async (ctx) => {
    const user = await ctx.db.insert('users', {});
    const ruleset = await ctx.db.insert('rulesets', {
      name: 'Classic',
      slug: 'classic',
      about: 'Rules',
      owner_id: user,
      group_id: null,
      is_deleted: false,
      image_cover: null,
      created_at: at,
      updated_at: at,
    });
    const question = await ctx.db.insert('faq_items', {
      ruleset_id: ruleset,
      slug: 'one',
      question: 'One?',
      asked_by: user,
      accepted_answer_id: null,
      created_at: at,
      updated_at: at,
    });
    const other = await ctx.db.insert('faq_items', {
      ruleset_id: ruleset,
      slug: 'two',
      question: 'Two?',
      asked_by: user,
      accepted_answer_id: null,
      created_at: at,
      updated_at: at,
    });
    const answer = await ctx.db.insert('faq_answers', {
      faq_item_id: other,
      answered_by: user,
      answer: 'Other answer',
      created_at: at,
    });
    await ctx.db.patch('faq_items', question, { accepted_answer_id: answer });
  });
  const page = await t.query(api.rulesets.detailPage, { slug: 'classic' });
  expect(page!.faqPreview.find((row) => row.slug === 'one')!.list_details).toEqual({
    accepted_answer: null,
    answerers: [],
    references: [],
    has_more_references: false,
    has_more_answers: false,
  });
});
