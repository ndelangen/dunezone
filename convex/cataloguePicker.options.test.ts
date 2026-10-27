/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { expect, test } from 'vite-plus/test';

import { assetPublishingFaction } from '../src/shared/factions/fixtures/assetPublishingFaction';
import { api } from './_generated/api';
import { applicationTest } from './application.test.fixture';
import { applicationTriggers } from './lib/applicationTriggers';

test('catalogue choices page within a type, search every page, and omit deleted targets', async () => {
  const t = applicationTest();
  await t.run(async (rawCtx) => {
    const ctx = applicationTriggers.wrapDB(rawCtx);
    const owner = await ctx.db.insert('users', { name: 'Owner' });
    const base = {
      owner_id: owner,
      group_id: null,
      is_deleted: false,
      created_at: '2026-10-22T00:00:00.000Z',
      updated_at: '2026-10-22T00:00:00.000Z',
    };
    await ctx.db.insert('factions', { ...base, slug: 'atreides', data: assetPublishingFaction });
    for (const [type, name, deleted] of [
      ['card-treachery', 'Lasgun', false],
      ['card-treachery', 'Shield', false],
      ['card-treachery', 'Karama', false],
      ['card-treachery', 'Deleted card', true],
      ['token-disc', 'Karama token', false],
    ] as const) {
      await ctx.db.insert('assets', {
        ...base,
        type,
        slug: name.toLowerCase().replaceAll(' ', '-'),
        data: { name },
        is_deleted: deleted,
      });
    }
  });
  const args = { group: 'card-treachery', q: '', paginationOpts: { numItems: 2, cursor: null } };
  const first = await t.query(api.cataloguePicker.options, args);
  const rest = await t.query(api.cataloguePicker.options, {
    ...args,
    paginationOpts: { numItems: 2, cursor: first.continueCursor },
  });
  expect(
    [...first.page, ...rest.page]
      .map(({ choice: row }) => (row.kind === 'asset' ? row.asset.name : row.faction.data.name))
      .sort()
  ).toEqual(['Karama', 'Lasgun', 'Shield']);
  expect(rest.isDone).toBe(true);
  const searched = await t.query(api.cataloguePicker.options, { ...args, q: 'Lasgun' });
  expect(searched.page).toMatchObject([{ choice: { kind: 'asset', asset: { name: 'Lasgun' } }, selected: null }]);
  const factions = await t.query(api.cataloguePicker.options, { ...args, group: 'faction' });
  expect(factions.page).toMatchObject([{ choice: { kind: 'faction' } }]);
  await expect(t.query(api.cataloguePicker.options, { ...args, group: 'unknown-type' })).rejects.toThrow(
    'Unknown catalogue type'
  );
});

async function selectionFixture() {
  const t = applicationTest();
  const ids = await t.run(async (rawCtx) => {
    const ctx = applicationTriggers.wrapDB(rawCtx);
    const owner = await ctx.db.insert('users', { name: 'Owner' });
    const at = '2026-10-22T00:00:00.000Z';
    const ruleset = await ctx.db.insert('rulesets', {
      owner_id: owner,
      group_id: null,
      name: 'Classic',
      slug: 'classic',
      about: 'Rules for this discussion.',
      image_cover: null,
      is_deleted: false,
      created_at: at,
      updated_at: at,
    });
    const question = await ctx.db.insert('faq_items', {
      ruleset_id: ruleset,
      slug: '1',
      question: 'When can Karama be used?',
      tags: ['rules'],
      asked_by: owner,
      created_at: at,
      updated_at: at,
      accepted_answer_id: null,
    });
    const assets = [];
    for (let index = 0; index < 16; index++) {
      const asset = await ctx.db.insert('assets', {
        owner_id: owner,
        group_id: null,
        type: 'token-disc',
        slug: `token-${index}`,
        data: { name: index === 15 ? 'Candidate' : `Token ${index}` },
        is_deleted: false,
        created_at: at,
        updated_at: at,
      });
      assets.push(asset);
      if (index < 15) {
        await ctx.db.insert('faq_references', {
          faq_item_id: question,
          kind: 'asset',
          target_id: asset,
          question_created_at: at,
        });
      }
    }
    return { owner, ruleset, question, linked: assets[14]!, candidate: assets[15]! };
  });
  return { t, ids };
}

test('selection checks links beyond the rendered page and reacts to additions and removals', async () => {
  const { t, ids } = await selectionFixture();
  const rendered = await t.query(api.faq.questionPage, {
    rulesetSlug: 'classic',
    questionSlug: '1',
    paginationOpts: { numItems: 12, cursor: null },
  });
  const references = rendered.page[0]!.items;
  expect(references).toHaveLength(12);
  expect(references.map((entry) => entry.id)).not.toContain(ids.linked);
  const args = {
    group: 'token-disc',
    q: '',
    paginationOpts: { numItems: 24, cursor: null },
    selection: { faqQuestionId: ids.question },
  };
  const options = await t.query(api.cataloguePicker.options, args);
  expect(options.page.find((row) => row.choice.id === ids.linked)?.selected).toBe(true);
  expect(options.page.find((row) => row.choice.id === ids.candidate)?.selected).toBe(false);
  const viewer = t.withIdentity({ subject: ids.owner });
  const target = { kind: 'asset' as const, id: ids.candidate };
  await viewer.mutation(api.faqReferences.add, { questionId: ids.question, target });
  expect(
    (await t.query(api.cataloguePicker.options, args)).page.find((row) => row.choice.id === ids.candidate)?.selected
  ).toBe(true);
  await viewer.mutation(api.faqReferences.remove, { questionId: ids.question, target });
  expect(
    (await t.query(api.cataloguePicker.options, args)).page.find((row) => row.choice.id === ids.candidate)?.selected
  ).toBe(false);
  const legacy = await t.query(api.faqReferences.options, {
    kind: 'asset',
    q: 'Candidate',
    paginationOpts: { numItems: 3, cursor: null },
  });
  expect(legacy.page).toMatchObject([{ kind: 'asset', id: ids.candidate }]);
  await t.run((ctx) => ctx.db.patch('rulesets', ids.ruleset, { is_deleted: true }));
  await expect(t.query(api.cataloguePicker.options, args)).rejects.toThrow('Ruleset not found');
});

test('a search longer than the search index takes still answers', async () => {
  const t = applicationTest();
  await t.run(async (rawCtx) => {
    const ctx = applicationTriggers.wrapDB(rawCtx);
    const owner = await ctx.db.insert('users', { name: 'Owner' });
    await ctx.db.insert('assets', {
      owner_id: owner,
      group_id: null,
      is_deleted: false,
      created_at: '2026-10-22T00:00:00.000Z',
      updated_at: '2026-10-22T00:00:00.000Z',
      type: 'card-treachery',
      slug: 'lasgun',
      data: { name: 'Lasgun' },
    });
  });
  const q = Array.from({ length: 20 }, () => 'Lasgun').join(' ');
  const searched = await t.query(api.cataloguePicker.options, {
    group: 'card-treachery',
    q,
    paginationOpts: { numItems: 5, cursor: null },
  });
  expect(searched.page).toMatchObject([{ choice: { kind: 'asset', asset: { name: 'Lasgun' } } }]);
});
