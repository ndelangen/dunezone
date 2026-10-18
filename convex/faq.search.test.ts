/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { describe, expect, test } from 'vite-plus/test';

import { FAQ_CATALOGUE_PAGE_SIZE } from '../src/shared/faq/catalogueSearch';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { applicationTest } from './application.test.fixture';
import { applicationTriggers } from './lib/applicationTriggers';

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

const found = (page: { items: { question: string; ruleset: { slug: string } }[] }) =>
  page.items.map((item) => `${item.ruleset.slug}: ${item.question}`).toSorted();

describe('the global FAQ', () => {
  test('before a search, offers only the rulesets that hold questions, by name, with their counts', async () => {
    const t = applicationTest();
    await seedRulesets(t, { Basic: ['Does the storm move?'], Advanced: ['Can I ship?', 'Can I revive?'], Empty: [] });

    const page = await t.query(api.faq.search, {});
    expect(page).toMatchObject({ searched: false, items: [], total: 0, page: 1, pageCount: 1, selected: [] });
    expect(page.rulesets.map(({ slug, questions }) => [slug, questions])).toEqual([
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
    expect(one).toMatchObject({ searched: true, selected: ['basic'], total: 1, complete: true });
    expect(found(await t.query(api.faq.search, { q: 'storm fremen', rulesets: ['basic', 'expansion'] }))).toEqual([
      'expansion: Is the storm deadly to Fremen?',
    ]);
    /* A slug that names no ruleset with questions is dropped, and with none left the search covers every ruleset. */
    const unknown = await t.query(api.faq.search, { q: 'worms', rulesets: ['nowhere'] });
    expect(unknown.selected).toEqual([]);
    expect(found(unknown)).toEqual(['basic: Can Fremen ride worms?']);
  });

  test("leaves out a deleted ruleset's questions", async () => {
    const t = applicationTest();
    const ids = await seedRulesets(t, { Basic: ['Does the storm move?'], Gone: ['Is the storm gone?'] });
    await t.run(async (ctx) => {
      await ctx.db.patch(ids.gone!, { is_deleted: true });
    });

    const page = await t.query(api.faq.search, { q: 'storm' });
    expect(found(page)).toEqual(['basic: Does the storm move?']);
    expect(page.rulesets.map((ruleset) => ruleset.slug)).toEqual(['basic']);
    expect((await t.query(api.faq.search, { q: 'storm', rulesets: ['gone'] })).selected).toEqual([]);
  });

  test('pages the matches with a page count, across rulesets', async () => {
    const t = applicationTest();
    const many = Array.from({ length: FAQ_CATALOGUE_PAGE_SIZE + 1 }, (_, index) => `Spice question ${index}?`);
    await seedRulesets(t, { Basic: many.slice(0, 10), Advanced: many.slice(10) });

    const first = await t.query(api.faq.search, { q: 'spice' });
    expect(first).toMatchObject({ total: FAQ_CATALOGUE_PAGE_SIZE + 1, pageCount: 2 });
    expect(first.items).toHaveLength(FAQ_CATALOGUE_PAGE_SIZE);
    expect((await t.query(api.faq.search, { q: 'spice', page: 2 })).items).toHaveLength(1);
    expect((await t.query(api.faq.search, { q: 'spice', page: 3 })).items).toHaveLength(0);
  });
});
