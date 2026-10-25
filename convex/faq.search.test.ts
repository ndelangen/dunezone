/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { describe, expect, test } from 'vite-plus/test';

import { FAQ_CATALOGUE_PAGE_SIZE } from '../src/shared/faq/catalogueSearch';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { applicationTest } from './application.test.fixture';
import { applicationTriggers } from './lib/applicationTriggers';
import { reconcileCatalogueEntry } from './lib/catalogueEntries';
import { CATALOGUE_BOUNDED_READ } from './lib/catalogueOrder';

const at = (second: number) => new Date(Date.UTC(2026, 6, 2, 0, 0, second)).toISOString();

/* Rulesets with their questions, written through the triggers, as every real write is, so the FAQ lists follow. */
async function seedRulesets(t: ReturnType<typeof applicationTest>, rulesets: Record<string, string[]>) {
  return await t.run(async (rawCtx) => {
    const ctx = applicationTriggers.wrapDB(rawCtx);
    const askerId = await ctx.db.insert('users', { name: 'Asker' });
    await ctx.db.insert('profiles', {
      user_id: askerId,
      username: 'Asker',
      avatar_url: 'https://example.com/asker.png',
      account_state: 'active',
      slug: 'asker',
      created_at: at(0),
      updated_at: at(0),
    });
    const ids: Record<string, Id<'rulesets'>> = {};
    let second = 1;
    for (const [name, questions] of Object.entries(rulesets)) {
      const slug = name.toLowerCase().replaceAll(' ', '-');
      const rulesetId = await ctx.db.insert('rulesets', {
        name,
        about: 'A test ruleset with an About long enough to satisfy the fifty character floor.',
        slug,
        created_at: at(0),
        updated_at: at(0),
        owner_id: askerId,
        group_id: null,
        is_deleted: false,
        image_cover: null,
      });
      ids[slug] = rulesetId;
      for (const [index, question] of questions.entries()) {
        await ctx.db.insert('faq_items', {
          ruleset_id: rulesetId,
          slug: String(index + 1),
          question,
          tags: ['rules'],
          asked_by: askerId,
          created_at: at(second),
          updated_at: at(second),
          accepted_answer_id: null,
        });
        second += 1;
      }
    }
    return ids;
  });
}

/*
 * Questions in a ruleset with only the search rows the triggers would write, not their counting order:
 * a search reads its rows alone, and seeding a thousand questions through every trigger outlasts a test's time.
 */
async function seedSearchOnly(t: ReturnType<typeof applicationTest>, rulesetId: Id<'rulesets'>, count: number) {
  await t.run(async (ctx) => {
    const askerId = (await ctx.db.get('rulesets', rulesetId))!.owner_id;
    for (let index = 0; index < count; index += 1) {
      const itemId = await ctx.db.insert('faq_items', {
        ruleset_id: rulesetId,
        slug: String(index + 1),
        question: `Storm question ${index}?`,
        tags: ['rules'],
        asked_by: askerId,
        created_at: at(1000 + index),
        updated_at: at(1000 + index),
        accepted_answer_id: null,
      });
      await reconcileCatalogueEntry(ctx, 'faq', itemId);
    }
  });
}

const found = (page: { items: { question: string; ruleset: { slug: string } }[] }) =>
  page.items.map((item) => `${item.ruleset.slug}: ${item.question}`).toSorted();

describe('the global FAQ', () => {
  test('before a search, finds nothing, and offers only the rulesets that hold questions, by name, with their counts', async () => {
    const t = applicationTest();
    await seedRulesets(t, { Basic: ['Does the storm move?'], Advanced: ['Can I ship?', 'Can I revive?'], Empty: [] });

    const page = await t.query(api.faq.search, {});
    expect(page).toEqual({
      searched: false,
      items: [],
      hasMore: false,
      capped: false,
      limit: FAQ_CATALOGUE_PAGE_SIZE,
      selected: [],
    });
    const options = await t.query(api.faq.rulesetOptions, {});
    expect(options.map(({ slug, questions }) => [slug, questions])).toEqual([
      ['advanced', 2],
      ['basic', 1],
    ]);
  });

  test('searches every ruleset, one picked ruleset, or several, and names each hit by its ruleset', async () => {
    const t = applicationTest();
    await seedRulesets(t, {
      Basic: ['Does the storm move first?', 'Can Fremen ride worms?'],
      Advanced: ['When does the storm stop?'],
      Expansion: ['Is the storm deadly to Fremen?'],
    });

    expect(found(await t.query(api.faq.search, { q: 'storm' }))).toEqual([
      'advanced: When does the storm stop?',
      'basic: Does the storm move first?',
      'expansion: Is the storm deadly to Fremen?',
    ]);
    const one = await t.query(api.faq.search, { q: 'storm', rulesets: ['basic'] });
    expect(found(one)).toEqual(['basic: Does the storm move first?']);
    expect(one).toMatchObject({ searched: true, selected: ['basic'], hasMore: false });
    expect(found(await t.query(api.faq.search, { q: 'storm fremen', rulesets: ['basic', 'expansion'] }))).toEqual([
      'expansion: Is the storm deadly to Fremen?',
    ]);
    /* A slug that names no live ruleset is dropped, and with none left the search covers every ruleset. */
    const unknown = await t.query(api.faq.search, { q: 'worms', rulesets: ['nowhere'] });
    expect(unknown.selected).toEqual([]);
    expect(found(unknown)).toEqual(['basic: Can Fremen ride worms?']);
  });

  test("leaves out a deleted ruleset's questions", async () => {
    const t = applicationTest();
    const ids = await seedRulesets(t, {
      Basic: ['Does the storm move?'],
      Gone: ['Is the storm gone?'],
      Other: ['Storm again?'],
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(ids.gone!, { is_deleted: true });
    });

    const page = await t.query(api.faq.search, { q: 'storm' });
    expect(found(page)).toEqual(['basic: Does the storm move?', 'other: Storm again?']);
    expect((await t.query(api.faq.rulesetOptions, {})).map((ruleset) => ruleset.slug)).toEqual(['basic', 'other']);
    const picked = await t.query(api.faq.search, { q: 'storm', rulesets: ['gone', 'basic'] });
    expect(picked.selected).toEqual(['basic']);
    expect(found(picked)).toEqual(['basic: Does the storm move?']);
    /* Two picked rulesets search the list of every question, which still leaves the deleted one out. */
    expect(found(await t.query(api.faq.search, { q: 'storm', rulesets: ['basic', 'other', 'gone'] }))).toEqual([
      'basic: Does the storm move?',
      'other: Storm again?',
    ]);
  });

  test('loads more by asking for a larger limit, best matches first and in the same order', async () => {
    const t = applicationTest();
    const many = Array.from({ length: FAQ_CATALOGUE_PAGE_SIZE + 1 }, (_, index) => `Spice question ${index}?`);
    await seedRulesets(t, { Basic: many.slice(0, 10), Advanced: many.slice(10) });

    const first = await t.query(api.faq.search, { q: 'spice' });
    expect(first).toMatchObject({ hasMore: true, limit: FAQ_CATALOGUE_PAGE_SIZE });
    expect(first.items).toHaveLength(FAQ_CATALOGUE_PAGE_SIZE);
    const more = await t.query(api.faq.search, { q: 'spice', limit: FAQ_CATALOGUE_PAGE_SIZE * 2 });
    expect(more).toMatchObject({ hasMore: false, limit: FAQ_CATALOGUE_PAGE_SIZE * 2 });
    expect(more.items).toHaveLength(FAQ_CATALOGUE_PAGE_SIZE + 1);
    expect(more.items.slice(0, FAQ_CATALOGUE_PAGE_SIZE).map((item) => item._id)).toEqual(
      first.items.map((item) => item._id)
    );
    expect((await t.query(api.faq.search, { q: 'spice', limit: 0 })).limit).toBe(FAQ_CATALOGUE_PAGE_SIZE);
    expect((await t.query(api.faq.search, { q: 'spice', limit: 1e9 })).limit).toBe(FAQ_CATALOGUE_PAGE_SIZE * 10);
  });

  test("reads further when a deleted ruleset's matches fill the first read", async () => {
    const t = applicationTest();
    const { gone } = await seedRulesets(t, { Basic: ['Does the storm move?'], Gone: [] });
    await seedSearchOnly(t, gone!, FAQ_CATALOGUE_PAGE_SIZE * 4);
    await t.run(async (ctx) => {
      await ctx.db.patch(gone!, { is_deleted: true });
    });

    const page = await t.query(api.faq.search, { q: 'storm' });
    expect(found(page)).toEqual(['basic: Does the storm move?']);
    expect(page.hasMore).toBe(false);
  });

  test("finds every picked ruleset's matches however many another ruleset holds", async () => {
    const t = applicationTest();
    /* More questions than one search reads. */
    const { busy } = await seedRulesets(t, {
      Basic: ['Does the storm move?'],
      Expansion: ['Is the storm deadly?'],
      Busy: [],
    });
    await seedSearchOnly(t, busy!, CATALOGUE_BOUNDED_READ + 4);

    const everywhere = await t.query(api.faq.search, { q: 'storm' });
    expect(everywhere.items).toHaveLength(FAQ_CATALOGUE_PAGE_SIZE);
    expect(everywhere.hasMore).toBe(true);
    const picked = await t.query(api.faq.search, { q: 'storm', rulesets: ['basic', 'expansion'] });
    expect(found(picked)).toEqual(['basic: Does the storm move?', 'expansion: Is the storm deadly?']);
    expect(picked.hasMore).toBe(false);
    const withBusy = await t.query(api.faq.search, { q: 'storm', rulesets: ['basic', 'busy'] });
    expect(
      withBusy.items
        .map((item) => item.ruleset.slug)
        .slice(0, 2)
        .toSorted()
    ).toEqual(['basic', 'busy']);
    expect(withBusy.hasMore).toBe(true);
    /* Loading more across lists of very different sizes only adds rows after those already shown. */
    const withBusyMore = await t.query(api.faq.search, {
      q: 'storm',
      rulesets: ['basic', 'busy'],
      limit: FAQ_CATALOGUE_PAGE_SIZE * 2,
    });
    expect(withBusyMore.items.slice(0, FAQ_CATALOGUE_PAGE_SIZE).map((item) => item._id)).toEqual(
      withBusy.items.map((item) => item._id)
    );

    /* Past the most one search shows, the reader is asked for another word rather than offered more. */
    const longest = await t.query(api.faq.search, { q: 'storm', limit: FAQ_CATALOGUE_PAGE_SIZE * 10 });
    expect(longest).toMatchObject({ hasMore: false, capped: true });
    expect(longest.items).toHaveLength(FAQ_CATALOGUE_PAGE_SIZE * 10);
    /* A search whose every candidate fails the every-word filter stops at the bound and says it may have missed some. */
    expect(await t.query(api.faq.search, { q: 'storm nowhere', rulesets: ['busy'] })).toMatchObject({
      items: [],
      hasMore: false,
      capped: true,
    });
    expect(await t.query(api.faq.search, { q: 'storm', rulesets: ['basic', 'expansion'] })).toMatchObject({
      capped: false,
    });
  }, 60_000);
});
