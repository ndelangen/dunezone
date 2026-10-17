/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { describe, expect, test } from 'vite-plus/test';

import { applicationTest } from './application.test.fixture';
import { loadFaqItemsForRuleset } from './lib/faqRulesetList';

const at = (day: number) => `2026-07-${String(day).padStart(2, '0')}T00:00:00.000Z`;

describe('FAQ list on the ruleset page', () => {
  test('a ruleset with more questions than the list shows keeps its newest ones', async () => {
    const t = applicationTest();
    const listed = await t.run(async (ctx) => {
      const askerId = await ctx.db.insert('users', { name: 'Asker' });
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
      for (let index = 0; index <= 200; index += 1) {
        await ctx.db.insert('faq_items', {
          ruleset_id: rulesetId,
          slug: String(index),
          question: `Question ${index}?`,
          asked_by: askerId,
          created_at: new Date(Date.UTC(2026, 6, 2, 0, 0, index)).toISOString(),
          updated_at: at(2),
          accepted_answer_id: null,
        });
      }
      return (await loadFaqItemsForRuleset(ctx, rulesetId)).map((item) => item.slug);
    });

    expect(listed).toHaveLength(200);
    expect(listed[0]).toBe('200');
    expect(listed).not.toContain('0');
  });
});
