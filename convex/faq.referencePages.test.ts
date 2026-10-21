/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { describe, expect, test } from 'vite-plus/test';

import { assetPublishingFaction } from '../src/shared/factions/fixtures/assetPublishingFaction';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { applicationTest } from './application.test.fixture';
import { applicationTriggers } from './lib/applicationTriggers';
import type { MutationCtx } from './types';

const at = '2026-10-21T00:00:00.000Z';
const paginationOpts = { numItems: 2, cursor: null };

async function fixture() {
  const t = applicationTest();
  const ids = await t.run(async (raw) => {
    const ctx = applicationTriggers.wrapDB(raw);
    const user = await ctx.db.insert('users', { name: 'Asker' });
    await ctx.db.insert('profiles', {
      user_id: user,
      username: 'Asker',
      slug: 'asker',
      avatar_url: null,
      account_state: 'active',
      created_at: at,
      updated_at: at,
    });
    const ruleset = await ctx.db.insert('rulesets', {
      name: 'Classic',
      slug: 'classic',
      about: 'A ruleset description long enough to meet its authoring requirement.',
      owner_id: user,
      group_id: null,
      is_deleted: false,
      image_cover: null,
      created_at: at,
      updated_at: at,
    });
    const otherRuleset = await ctx.db.insert('rulesets', {
      name: 'Advanced',
      slug: 'advanced',
      about: 'Another ruleset description long enough to meet its authoring requirement.',
      owner_id: user,
      group_id: null,
      is_deleted: false,
      image_cover: null,
      created_at: at,
      updated_at: at,
    });
    const { faction, assets } = await seedTargets(ctx, user, otherRuleset);
    const questions = [];
    for (let day = 1; day <= 5; day++) {
      const created = `2026-10-0${day}T00:00:00.000Z`;
      questions.push(
        await ctx.db.insert('faq_items', {
          ruleset_id: day % 2 === 0 ? otherRuleset : ruleset,
          slug: String(day),
          question: `Question ${day}?`,
          asked_by: user,
          tags: ['rules'],
          created_at: created,
          updated_at: created,
          accepted_answer_id: null,
        })
      );
    }
    return { user, ruleset, otherRuleset, faction, assets, questions };
  });
  return { t, ids, viewer: t.withIdentity({ subject: ids.user }) };
}

describe('FAQ reference public pages', () => {
  test('FAQ pages return catalogue previews across rulesets and asset types, retaining cursors through deleted targets', async () => {
    const { t, ids, viewer } = await fixture();
    for (const id of ids.assets) {
      await viewer.mutation(api.faqReferences.add, { questionId: ids.questions[0]!, target: { kind: 'asset', id } });
    }
    await viewer.mutation(api.faqReferences.add, {
      questionId: ids.questions[0]!,
      target: { kind: 'faction', id: ids.faction },
    });
    const locator = { rulesetSlug: 'classic', questionSlug: '1' };
    const first = await t.query(api.faq.questionPage, { ...locator, paginationOpts });
    expect(first.page[0]!.detail).toMatchObject({
      question: { id: ids.questions[0] },
      referenceRuleset: { owner_id: ids.user },
    });
    const firstIds = first.page[0]!.items.map((item) => item.id);
    await t.run(async (ctx) => {
      for (const id of firstIds) {
        const asset = ctx.db.normalizeId('assets', id);
        if (asset) {
          await ctx.db.patch('assets', asset, { is_deleted: true });
        } else {
          await ctx.db.patch('factions', ctx.db.normalizeId('factions', id)!, { is_deleted: true });
        }
      }
    });
    const hidden = await t.query(api.faq.questionPage, { ...locator, paginationOpts });
    expect(hidden.page[0]!.items).toEqual([]);
    expect(hidden.isDone).toBe(false);
    const seen = [];
    let page = hidden;
    while (!page.isDone) {
      page = await t.query(api.faq.questionPage, {
        ...locator,
        paginationOpts: { numItems: 2, cursor: page.continueCursor },
      });
      expect(page.page[0]!.detail).toBeNull();
      seen.push(...page.page[0]!.items);
    }
    expect(seen).toHaveLength(3);
    expect(new Set(seen.map((item) => item.id)).size).toBe(3);
  });

  test('asset and faction feeds share one newest-question-first list with ruleset labels, regardless of link order', async () => {
    const { t, ids, viewer } = await fixture();
    for (const questionId of ids.questions.toReversed()) {
      await viewer.mutation(api.faqReferences.add, { questionId, target: { kind: 'asset', id: ids.assets[0]! } });
      await viewer.mutation(api.faqReferences.add, { questionId, target: { kind: 'faction', id: ids.faction } });
    }
    const assetArgs = { type: 'card-treachery', slug: 'card-treachery' };
    const first = await t.query(api.assets.detailPage, { ...assetArgs, paginationOpts });
    expect(first.page[0]!.detail).toEqual(await t.query(api.assets.page, assetArgs));
    expect(first.page[0]!.items.map((item) => [item.question, item.ruleset.slug])).toEqual([
      ['Question 5?', 'classic'],
      ['Question 4?', 'advanced'],
    ]);
    const items = [...first.page[0]!.items];
    let page = first;
    while (!page.isDone) {
      page = await t.query(api.assets.detailPage, {
        ...assetArgs,
        paginationOpts: { numItems: 2, cursor: page.continueCursor },
      });
      expect(page.page[0]!.detail).toBeNull();
      items.push(...page.page[0]!.items);
    }
    expect(items.map((item) => item._id)).toEqual(ids.questions.toReversed());
    const faction = await t.query(api.factions.detailPage, {
      slug: 'atreides',
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(faction.page[0]!.detail).toEqual(await t.query(api.factions.pageBySlug, { slug: 'atreides' }));
    expect(faction.page[0]!.items.map((item) => item._id)).toEqual(ids.questions.toReversed());
    await t.run((ctx) => ctx.db.patch('rulesets', ids.otherRuleset, { is_deleted: true }));
    const filtered = await t.query(api.assets.detailPage, {
      ...assetArgs,
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(filtered.page[0]!.items.map((item) => item.question)).toEqual(['Question 5?', 'Question 3?', 'Question 1?']);
  });

  test('an empty reverse range retains its native cursor when its questions are missing', async () => {
    const { t, ids, viewer } = await fixture();
    for (const questionId of ids.questions) {
      await viewer.mutation(api.faqReferences.add, { questionId, target: { kind: 'asset', id: ids.assets[0]! } });
    }
    await t.run(async (ctx) => {
      await ctx.db.delete('faq_items', ids.questions[4]!);
      await ctx.db.delete('faq_items', ids.questions[3]!);
    });
    const args = { type: 'card-treachery', slug: 'card-treachery' };
    const empty = await t.query(api.assets.detailPage, { ...args, paginationOpts });
    expect(empty.page[0]!.detail?.asset.id).toBe(ids.assets[0]);
    expect(empty.page[0]!.items).toEqual([]);
    expect(empty.isDone).toBe(false);
    const next = await t.query(api.assets.detailPage, {
      ...args,
      paginationOpts: { numItems: 2, cursor: empty.continueCursor },
    });
    expect(next.page[0]!.items.map((item) => item.question)).toEqual(['Question 3?', 'Question 2?']);
  });

  test('picker choices use the complete catalogue with all asset types and exclude deleted targets', async () => {
    const { t, ids } = await fixture();
    const assets = await t.query(api.faqReferences.options, {
      kind: 'asset',
      q: '',
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(assets.page.map((item) => (item.kind === 'asset' ? item.asset.type : ''))).toEqual(
      expect.arrayContaining(['card-treachery', 'token-disc', 'board', 'bundle'])
    );
    const faction = await t.query(api.faqReferences.options, { kind: 'faction', q: 'Atreides', paginationOpts });
    expect(faction.page[0]).toMatchObject({
      kind: 'faction',
      id: ids.faction,
      faction: { rulesets: [{ slug: 'advanced' }] },
    });
    await t.run((ctx) => ctx.db.patch('assets', ids.assets[0]!, { is_deleted: true }));
    const deleted = await t.query(api.faqReferences.options, { kind: 'asset', q: 'card-treachery', paginationOpts });
    expect(deleted.page).toEqual([]);
  });
});

async function seedTargets(ctx: MutationCtx, user: Id<'users'>, otherRuleset: Id<'rulesets'>) {
  const faction = await ctx.db.insert('factions', {
    owner_id: user,
    group_id: null,
    slug: 'atreides',
    data: assetPublishingFaction,
    is_deleted: false,
    created_at: at,
    updated_at: at,
  });
  await ctx.db.insert('ruleset_factions', { ruleset_id: otherRuleset, faction_id: faction });
  const assets = [];
  for (const type of ['card-treachery', 'token-disc', 'board', 'bundle']) {
    assets.push(
      await ctx.db.insert('assets', {
        owner_id: user,
        group_id: null,
        slug: type,
        type,
        data: { name: type },
        is_deleted: false,
        created_at: at,
        updated_at: at,
      })
    );
  }

  return { faction, assets };
}
