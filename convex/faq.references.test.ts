/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { describe, expect, test, vi } from 'vite-plus/test';

import { api } from './_generated/api';
import { applicationTest } from './application.test.fixture';

const at = '2026-10-21T00:00:00.000Z';

async function fixture() {
  const t = applicationTest();
  const ids = await t.run(async (ctx) => {
    const asker = await ctx.db.insert('users', { name: 'Asker' });
    const owner = await ctx.db.insert('users', { name: 'Ruleset owner' });
    const editor = await ctx.db.insert('users', { name: 'Ruleset editor' });
    const outsider = await ctx.db.insert('users', { name: 'Asset owner' });
    const group = await ctx.db.insert('groups', {
      name: 'Rules council',
      slug: 'council',
      created_by: owner,
      created_at: at,
      is_deleted: false,
    });
    const membership = await ctx.db.insert('group_members', {
      group_id: group,
      user_id: editor,
      status: 'active',
      requested_at: at,
      approved_at: at,
      approved_by: owner,
    });
    const ruleset = await ctx.db.insert('rulesets', {
      name: 'Classic',
      slug: 'classic',
      about: 'A ruleset description long enough to meet its authoring requirement.',
      owner_id: owner,
      group_id: group,
      is_deleted: false,
      image_cover: null,
      created_at: at,
      updated_at: at,
    });
    const question = await ctx.db.insert('faq_items', {
      ruleset_id: ruleset,
      slug: '1',
      question: 'How does this card interact with this faction?',
      tags: ['rules'],
      asked_by: asker,
      created_at: at,
      updated_at: at,
      accepted_answer_id: null,
    });
    const faction = await ctx.db.insert('factions', {
      owner_id: outsider,
      group_id: null,
      slug: 'atreides',
      data: { name: 'Atreides' },
      is_deleted: false,
      created_at: at,
      updated_at: at,
    });
    const asset = await ctx.db.insert('assets', {
      owner_id: outsider,
      group_id: null,
      slug: 'lasgun',
      type: 'card-treachery',
      data: { name: 'Lasgun' },
      is_deleted: false,
      created_at: at,
      updated_at: at,
    });
    return { asker, owner, editor, outsider, group, membership, ruleset, question, faction, asset };
  });
  const target = { kind: 'asset' as const, id: ids.asset };
  return { t, ids, target, args: { questionId: ids.question, target } };
}

describe('FAQ references', () => {
  test.each(['asker', 'owner', 'editor'] as const)('%s can add and remove another owner’s content', async (role) => {
    const { t, ids, args } = await fixture();
    const viewer = t.withIdentity({ subject: ids[role] });
    const first = await viewer.mutation(api.faqReferences.add, args);
    expect(await viewer.mutation(api.faqReferences.add, args)).toBe(first);
    expect(await t.run((ctx) => ctx.db.get('faq_references', first))).not.toBeNull();
    await viewer.mutation(api.faqReferences.remove, args);
    await viewer.mutation(api.faqReferences.remove, args);
    expect(await t.run((ctx) => ctx.db.get('faq_references', first))).toBeNull();
    if (role !== 'asker') {
      await expect(
        viewer.mutation(api.faq.editQuestion, {
          questionId: ids.question,
          input: { question: 'A different question', tags: ['rules'] },
        })
      ).rejects.toThrow('Not authorized');
    }
  });

  test('target ownership does not grant reference rights, and anonymous callers cannot write', async () => {
    const { t, ids, args } = await fixture();
    for (const viewer of [t, t.withIdentity({ subject: ids.outsider })]) {
      await expect(viewer.mutation(api.faqReferences.add, args)).rejects.toThrow();
      await expect(viewer.mutation(api.faqReferences.remove, args)).rejects.toThrow();
    }
  });

  test.each(['pending', 'removed'] as const)('%s membership grants no write access', async (status) => {
    const { t, ids, args } = await fixture();
    await t.run((ctx) => ctx.db.patch('group_members', ids.membership, { status }));
    await expect(t.withIdentity({ subject: ids.editor }).mutation(api.faqReferences.add, args)).rejects.toThrow(
      'Not authorized'
    );
  });

  test('a deleted group revokes its editor, while the asker retains reference access', async () => {
    const { t, ids, args } = await fixture();
    await t.run((ctx) => ctx.db.patch('groups', ids.group, { is_deleted: true }));
    await expect(t.withIdentity({ subject: ids.editor }).mutation(api.faqReferences.add, args)).rejects.toThrow(
      'Not authorized'
    );
    await t.withIdentity({ subject: ids.asker }).mutation(api.faqReferences.add, args);
  });

  test('deleted targets retain their links for recovery and cannot be added', async () => {
    const { t, ids, args } = await fixture();
    const asker = t.withIdentity({ subject: ids.asker });
    const factionTarget = { kind: 'faction' as const, id: ids.faction };
    const references = [
      await asker.mutation(api.faqReferences.add, args),
      await asker.mutation(api.faqReferences.add, { questionId: ids.question, target: factionTarget }),
    ];
    await t.run(async (ctx) => {
      await ctx.db.patch('assets', ids.asset, { is_deleted: true });
      await ctx.db.patch('factions', ids.faction, { is_deleted: true });
    });
    for (const id of references) {
      expect(await t.run((ctx) => ctx.db.get('faq_references', id))).not.toBeNull();
    }
    await expect(asker.mutation(api.faqReferences.add, args)).rejects.toThrow('not found');
    await expect(
      asker.mutation(api.faqReferences.add, { questionId: ids.question, target: factionTarget })
    ).rejects.toThrow('not found');
    await t.run(async (ctx) => {
      await ctx.db.patch('assets', ids.asset, { is_deleted: false });
      await ctx.db.patch('factions', ids.faction, { is_deleted: false });
    });
    expect(await asker.mutation(api.faqReferences.add, args)).toBe(references[0]);
    expect(await asker.mutation(api.faqReferences.add, { questionId: ids.question, target: factionTarget })).toBe(
      references[1]
    );
  });

  test('permanently deleting a question drains reference batches through the existing child-deletion flow', async () => {
    vi.useFakeTimers();
    try {
      const { t, ids } = await fixture();
      await t.run(async (ctx) => {
        for (let index = 0; index < 205; index += 1) {
          const asset = await ctx.db.insert('assets', {
            owner_id: ids.outsider,
            group_id: null,
            slug: `card-${index}`,
            type: 'card-treachery',
            data: {},
            is_deleted: false,
            created_at: at,
            updated_at: at,
          });
          await ctx.db.insert('faq_references', {
            faq_item_id: ids.question,
            question_created_at: at,
            kind: 'asset',
            target_id: asset,
          });
        }
      });
      await t.withIdentity({ subject: ids.asker }).mutation(api.faq.deleteQuestion, { questionId: ids.question });
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      expect(await t.run((ctx) => ctx.db.get('faq_items', ids.question))).toBeNull();
      expect(await t.run((ctx) => ctx.db.query('faq_references').first())).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
