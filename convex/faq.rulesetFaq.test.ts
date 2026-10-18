/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { describe, expect, test } from 'vite-plus/test';

import { FAQ_CATALOGUE_PAGE_SIZE, FAQ_PREVIEW_SIZE } from '../src/shared/faq/catalogueSearch';
import type { FaqTag } from '../src/shared/faq/tags';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { applicationTest } from './application.test.fixture';
import { applicationTriggers } from './lib/applicationTriggers';

type Question = { question: string; tags?: FaqTag[]; answered?: boolean };

const at = (second: number) => new Date(Date.UTC(2026, 6, 2, 0, 0, second)).toISOString();

/* A ruleset with an asker, its questions written through the triggers, as every real write is, so the FAQ lists follow. */
async function seedFaq(t: ReturnType<typeof applicationTest>, questions: Question[], options = { triggers: true }) {
  return await t.run(async (rawCtx) => {
    const ctx = options.triggers ? applicationTriggers.wrapDB(rawCtx) : rawCtx;
    const askerId = await ctx.db.insert('users', { name: 'Asker' });
    const profileId = await ctx.db.insert('profiles', {
      user_id: askerId,
      username: 'Asker',
      avatar_url: 'https://example.com/asker.png',
      account_state: 'active',
      slug: 'asker',
      created_at: at(0),
      updated_at: at(0),
    });
    const rulesetId = await ctx.db.insert('rulesets', {
      name: 'Advanced',
      about: 'A test ruleset with an About long enough to satisfy the fifty character floor.',
      slug: 'advanced',
      created_at: at(0),
      updated_at: at(0),
      owner_id: askerId,
      group_id: null,
      is_deleted: false,
      image_cover: null,
    });
    const itemIds: Id<'faq_items'>[] = [];
    for (const [index, question] of questions.entries()) {
      const itemId = await ctx.db.insert('faq_items', {
        ruleset_id: rulesetId,
        slug: String(index + 1),
        question: question.question,
        tags: question.tags ?? ['rules'],
        asked_by: askerId,
        created_at: at(index + 1),
        updated_at: at(index + 1),
        accepted_answer_id: null,
      });
      if (question.answered) {
        const answerId = await ctx.db.insert('faq_answers', {
          faq_item_id: itemId,
          answer: 'Yes.',
          answered_by: askerId,
          created_at: at(index + 1),
        });
        await ctx.db.patch(itemId, { accepted_answer_id: answerId });
      }
      itemIds.push(itemId);
    }
    return { rulesetId, profileId, itemIds };
  });
}

const numbered = (count: number): Question[] =>
  Array.from({ length: count }, (_, index) => ({ question: `Question ${String(index + 1).padStart(2, '0')}?` }));

const questions = (page: { items: { question: string }[] } | null) => page?.items.map((item) => item.question);

describe("a ruleset's FAQ", () => {
  test('the ruleset page shows the newest few with their answers, and counts every question and every answered one', async () => {
    const t = applicationTest();
    const { profileId } = await seedFaq(t, [...numbered(FAQ_PREVIEW_SIZE + 3), { question: 'Newest?', answered: true }]);

    const detail = await t.query(api.rulesets.detailPage, { slug: 'advanced' });
    expect(detail?.faqItems.map((item) => item.question)).toEqual([
      'Newest?',
      'Question 08?',
      'Question 07?',
      'Question 06?',
      'Question 05?',
    ]);
    expect(detail?.faqCounts).toEqual({ questions: FAQ_PREVIEW_SIZE + 4, answered: 1 });
    expect(detail?.faqItems[0]?.faq_answers.map((answer) => answer.answer)).toEqual(['Yes.']);
    expect(detail?.faqItems[0]?.asker_profile).toMatchObject({ id: profileId, slug: 'asker', username: 'Asker' });
  });

  test('pages every question newest first, and counts them', async () => {
    const t = applicationTest();
    await seedFaq(t, numbered(FAQ_CATALOGUE_PAGE_SIZE + 2));

    const first = await t.query(api.faq.rulesetFaq, { rulesetSlug: 'advanced' });
    expect(first).toMatchObject({
      ruleset: { slug: 'advanced', name: 'Advanced' },
      total: FAQ_CATALOGUE_PAGE_SIZE + 2,
      rulesetTotal: FAQ_CATALOGUE_PAGE_SIZE + 2,
      complete: true,
      page: 1,
      pageCount: 2,
      pageSize: FAQ_CATALOGUE_PAGE_SIZE,
    });
    expect(questions(first)?.[0]).toBe('Question 26?');
    expect(questions(await t.query(api.faq.rulesetFaq, { rulesetSlug: 'advanced', page: 2 }))).toEqual([
      'Question 02?',
      'Question 01?',
    ]);
    expect(await t.query(api.faq.rulesetFaq, { rulesetSlug: 'nowhere' })).toBeNull();
  });

  test('narrows to one tag and finds questions by their words, counting the ruleset apart from the matches', async () => {
    const t = applicationTest();
    await seedFaq(t, [
      { question: 'Does the storm move first?', tags: ['rules'] },
      { question: 'Is Harkonnen too strong?', tags: ['balance', 'strategy'] },
      { question: 'When does the storm stop?', tags: ['errata'] },
    ]);

    const balance = await t.query(api.faq.rulesetFaq, { rulesetSlug: 'advanced', tag: 'balance' });
    expect(questions(balance)).toEqual(['Is Harkonnen too strong?']);
    expect(balance).toMatchObject({ total: 1, rulesetTotal: 3 });

    const storm = await t.query(api.faq.rulesetFaq, { rulesetSlug: 'advanced', q: 'storm' });
    expect(questions(storm)?.toSorted()).toEqual(['Does the storm move first?', 'When does the storm stop?']);
    expect(storm).toMatchObject({ total: 2, rulesetTotal: 3 });
    expect(questions(await t.query(api.faq.rulesetFaq, { rulesetSlug: 'advanced', q: 'storm', tag: 'errata' }))).toEqual(
      ['When does the storm stop?']
    );
  });

  test('follows an accepted answer, a retag and a deletion, and leaves no drift', async () => {
    const t = applicationTest();
    const {
      itemIds: [first, second],
    } = await seedFaq(t, [{ question: 'First?' }, { question: 'Second?' }]);

    await t.run(async (rawCtx) => {
      const ctx = applicationTriggers.wrapDB(rawCtx);
      const answerId = await ctx.db.insert('faq_answers', {
        faq_item_id: first!,
        answer: 'Accepted.',
        answered_by: (await ctx.db.get('faq_items', first!))!.asked_by,
        created_at: at(9),
      });
      await ctx.db.patch(first!, { accepted_answer_id: answerId, tags: ['errata'] });
    });
    expect((await t.query(api.rulesets.detailPage, { slug: 'advanced' }))?.faqCounts).toEqual({
      questions: 2,
      answered: 1,
    });
    expect(questions(await t.query(api.faq.rulesetFaq, { rulesetSlug: 'advanced', tag: 'errata' }))).toEqual([
      'First?',
    ]);
    expect(questions(await t.query(api.faq.rulesetFaq, { rulesetSlug: 'advanced', tag: 'rules' }))).toEqual([
      'Second?',
    ]);

    await t.run(async (rawCtx) => {
      await applicationTriggers.wrapDB(rawCtx).db.delete(second!);
    });
    expect(questions(await t.query(api.faq.rulesetFaq, { rulesetSlug: 'advanced' }))).toEqual(['First?']);

    const drift = await t.query(internal.catalogueMaintenance.catalogueDrift, { kind: 'faq' });
    expect(drift).toMatchObject({ missing: [], stale: [], duplicated: [], unordered: [], orphaned: [] });
  });

  test('backfills questions asked before the FAQ lists existed, and verification refuses a gap', async () => {
    const t = applicationTest();
    await seedFaq(t, [{ question: 'Old?', answered: true }], { triggers: false });
    expect(await t.query(api.faq.rulesetFaq, { rulesetSlug: 'advanced' })).toMatchObject({ total: 0 });

    await t.mutation(internal.migrations.catalogue_entries_faq_verify_v1, {});
    await t.finishAllScheduledFunctions(() => undefined);
    await expect(
      t.query(internal.migrations.assertReadyForNarrow, { required: ['catalogue_entries_faq_verify_v1'] })
    ).rejects.toThrow(/catalogue_entries_faq_verify_v1\(failed/);

    await t.mutation(internal.migrations.catalogue_entries_faq_v1, {});
    await t.finishAllScheduledFunctions(() => undefined);
    expect(questions(await t.query(api.faq.rulesetFaq, { rulesetSlug: 'advanced' }))).toEqual(['Old?']);
    expect((await t.query(api.rulesets.detailPage, { slug: 'advanced' }))?.faqCounts).toEqual({
      questions: 1,
      answered: 1,
    });
  });
});
