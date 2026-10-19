/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import type { FunctionReturnType } from 'convex/server';
import { describe, expect, test } from 'vite-plus/test';

import {
  FAQ_CATALOGUE_PAGE_SIZE,
  FAQ_CATALOGUE_QUERY_LIMIT,
  FAQ_PREVIEW_SIZE,
} from '../src/shared/faq/catalogueSearch';
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

type RulesetFaqAnswer = FunctionReturnType<typeof api.faq.rulesetFaq>;

/** The browsed shape, which every call without a limit answers with. */
function browsed(answer: RulesetFaqAnswer) {
  if (answer === null || 'mode' in answer) {
    throw new Error('Expected a browsed page.');
  }
  return answer;
}

/** The searched shape, which a search with a limit answers with. */
function searched(answer: RulesetFaqAnswer) {
  if (answer === null || !('mode' in answer)) {
    throw new Error('Expected a search.');
  }
  return answer;
}

describe("a ruleset's FAQ", () => {
  test('the ruleset page shows the newest few with their answers, and counts every question and every answered one', async () => {
    const t = applicationTest();
    const { profileId } = await seedFaq(t, [
      ...numbered(FAQ_PREVIEW_SIZE + 3),
      { question: 'Newest?', answered: true },
    ]);

    const detail = await t.query(api.rulesets.detailPage, { slug: 'advanced' });
    expect(detail?.faqPreview.map((item) => item.question)).toEqual([
      'Newest?',
      'Question 08?',
      'Question 07?',
      'Question 06?',
      'Question 05?',
    ]);
    expect(detail?.faqCounts).toEqual({ questions: FAQ_PREVIEW_SIZE + 4, answered: 1 });
    expect(detail?.faqPreview[0]?.faq_answers.map((answer) => answer.answer)).toEqual(['Yes.']);
    expect(detail?.faqPreview[0]?.asker_profile).toMatchObject({ id: profileId, slug: 'asker', username: 'Asker' });
  });

  test('pages every question newest first, and counts them', async () => {
    const t = applicationTest();
    await seedFaq(t, numbered(FAQ_CATALOGUE_PAGE_SIZE + 2));

    const first = await t.query(api.faq.rulesetFaq, { rulesetSlug: 'advanced' });
    expect(first).toMatchObject({
      ruleset: { slug: 'advanced', name: 'Advanced' },
      total: FAQ_CATALOGUE_PAGE_SIZE + 2,
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

  test('narrows to one tag and finds questions by their words', async () => {
    const t = applicationTest();
    await seedFaq(t, [
      { question: 'Does the storm move first?', tags: ['rules'] },
      { question: 'Is Harkonnen too strong?', tags: ['balance', 'strategy'] },
      { question: 'When does the storm stop?', tags: ['errata'] },
    ]);

    const balance = await t.query(api.faq.rulesetFaq, { rulesetSlug: 'advanced', tag: 'balance' });
    expect(questions(balance)).toEqual(['Is Harkonnen too strong?']);
    expect(balance).toMatchObject({ total: 1 });

    const storm = await t.query(api.faq.rulesetFaq, { rulesetSlug: 'advanced', q: 'storm' });
    expect(questions(storm)?.toSorted()).toEqual(['Does the storm move first?', 'When does the storm stop?']);
    expect(storm).toMatchObject({ total: 2 });
    expect(
      questions(await t.query(api.faq.rulesetFaq, { rulesetSlug: 'advanced', q: 'storm', tag: 'errata' }))
    ).toEqual(['When does the storm stop?']);
  });

  test('lists a question from before tags under its ruleset alone, and answers nothing for a deleted ruleset', async () => {
    const t = applicationTest();
    const {
      rulesetId,
      itemIds: [legacy],
    } = await seedFaq(t, [{ question: 'Untagged?' }]);
    await t.run(async (rawCtx) => {
      await applicationTriggers.wrapDB(rawCtx).db.patch(legacy!, { tags: undefined });
    });
    expect(questions(await t.query(api.faq.rulesetFaq, { rulesetSlug: 'advanced' }))).toEqual(['Untagged?']);
    expect(await t.query(api.faq.rulesetFaq, { rulesetSlug: 'advanced', tag: 'rules' })).toMatchObject({ total: 0 });

    await t.run(async (ctx) => {
      await ctx.db.patch(rulesetId, { is_deleted: true });
    });
    expect(await t.query(api.faq.rulesetFaq, { rulesetSlug: 'advanced' })).toBeNull();
  });

  test('lists a very long question under a bounded prefix of its words', async () => {
    const t = applicationTest();
    const long = `Can a Guild ship carry ${'spice and '.repeat(30_000)}troops?`;
    await seedFaq(t, [{ question: long }]);

    const entries = await t.run(async (ctx) => await ctx.db.query('catalogue_entries').collect());
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry.search_text.length).toBeLessThanOrEqual(2000);
      expect(entry.name_key.length).toBeLessThanOrEqual(200);
    }
    expect(browsed(await t.query(api.faq.rulesetFaq, { rulesetSlug: 'advanced', q: 'guild ship' })).total).toBe(1);
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

  test('a search with a limit loads more by asking for a larger one, best matches first and only ever appending', async () => {
    const t = applicationTest();
    const count = FAQ_CATALOGUE_PAGE_SIZE + 3;
    await seedFaq(t, [
      ...Array.from({ length: count }, (_, index) => ({
        question: `Storm question ${String(index + 1).padStart(2, '0')}?`,
        tags: (index % 2 === 0 ? ['rules'] : ['errata']) as FaqTag[],
      })),
      { question: 'Is Harkonnen too strong?', tags: ['balance'] },
    ]);
    const search = async (args: Omit<Parameters<typeof t.query<typeof api.faq.rulesetFaq>>[1], 'rulesetSlug'>) =>
      searched(await t.query(api.faq.rulesetFaq, { rulesetSlug: 'advanced', ...args }));

    const first = await search({ q: 'storm', limit: FAQ_CATALOGUE_PAGE_SIZE });
    expect(first).toMatchObject({
      mode: 'search',
      ruleset: { slug: 'advanced', name: 'Advanced' },
      hasMore: true,
      capped: false,
      limit: FAQ_CATALOGUE_PAGE_SIZE,
    });
    expect(first.items).toHaveLength(FAQ_CATALOGUE_PAGE_SIZE);
    expect(first).not.toHaveProperty('total');
    expect(first).not.toHaveProperty('page');
    expect(first).not.toHaveProperty('pageCount');

    const more = await search({ q: 'storm', limit: FAQ_CATALOGUE_PAGE_SIZE * 2 });
    expect(more).toMatchObject({ hasMore: false, capped: false, limit: FAQ_CATALOGUE_PAGE_SIZE * 2 });
    expect(more.items).toHaveLength(count);
    expect(more.items.slice(0, FAQ_CATALOGUE_PAGE_SIZE).map((item) => item._id)).toEqual(
      first.items.map((item) => item._id)
    );
    expect(questions(more)).not.toContain('Is Harkonnen too strong?');
    /* An odd limit is one step; past the ceiling it is the ceiling. */
    expect((await search({ q: 'storm', limit: 0 })).limit).toBe(FAQ_CATALOGUE_PAGE_SIZE);
    expect((await search({ q: 'storm', limit: 1e9 })).limit).toBe(FAQ_CATALOGUE_PAGE_SIZE * 10);
    expect(await search({ q: 'storm nowhere', limit: FAQ_CATALOGUE_PAGE_SIZE })).toMatchObject({
      items: [],
      hasMore: false,
      capped: false,
    });

    /* A tag is the list searched: the matches come from its questions alone. */
    const errata = await search({ q: 'storm', tag: 'errata', limit: FAQ_CATALOGUE_PAGE_SIZE });
    expect(errata.items).toHaveLength(Math.floor(count / 2));
    expect(errata.hasMore).toBe(false);
    for (const item of errata.items) {
      expect(item.tags).toEqual(['errata']);
    }
    expect(await search({ q: 'harkonnen', tag: 'errata', limit: FAQ_CATALOGUE_PAGE_SIZE })).toMatchObject({
      items: [],
      hasMore: false,
    });

    /* A limit sent with an unknown ruleset answers like any other call. */
    expect(await t.query(api.faq.rulesetFaq, { rulesetSlug: 'nowhere', q: 'storm', limit: 1 })).toBeNull();
  }, 60_000);

  test('a search that is blank once cut to length browses, and an old bundle keeps its paged search', async () => {
    const t = applicationTest();
    await seedFaq(t, numbered(FAQ_CATALOGUE_PAGE_SIZE + 2));

    /* Spaces past the cut are all that is left once the query is cut and trimmed, so it is no search. */
    const blankAfterCut = `${' '.repeat(FAQ_CATALOGUE_QUERY_LIMIT)}Question`;
    const browsedAnyway = browsed(
      await t.query(api.faq.rulesetFaq, { rulesetSlug: 'advanced', q: blankAfterCut, limit: FAQ_CATALOGUE_PAGE_SIZE })
    );
    expect(browsedAnyway).toMatchObject({ total: FAQ_CATALOGUE_PAGE_SIZE + 2, page: 1, pageCount: 2 });
    expect(browsedAnyway).not.toHaveProperty('mode');
    /* A browsed page ignores a limit. */
    expect(browsed(await t.query(api.faq.rulesetFaq, { rulesetSlug: 'advanced', limit: 5 })).items).toHaveLength(
      FAQ_CATALOGUE_PAGE_SIZE
    );

    /* An old bundle's search, with a page and no limit, still gets the paged shape it reads. */
    const old = browsed(await t.query(api.faq.rulesetFaq, { rulesetSlug: 'advanced', q: 'question', page: 2 }));
    expect(old).toMatchObject({ page: 2, pageCount: 2, total: FAQ_CATALOGUE_PAGE_SIZE + 2, complete: true });
    expect(old.items).toHaveLength(2);
    expect(old).not.toHaveProperty('mode');
  }, 60_000);

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
