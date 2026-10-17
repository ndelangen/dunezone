/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { describe, expect, test } from 'vite-plus/test';

import { applicationTest } from './application.test.fixture';
import { loadFaqItemsForRuleset } from './lib/faqRulesetList';

const at = (day: number) => `2026-07-${String(day).padStart(2, '0')}T00:00:00.000Z`;

describe('FAQ list on the ruleset page', () => {
  test('a ruleset with more questions than the list shows keeps its newest ones', async () => {
    const t = applicationTest();
    const { listed, profileId, answerId } = await t.run(async (ctx) => {
      const askerId = await ctx.db.insert('users', { name: 'Asker' });
      const profileId = await ctx.db.insert('profiles', {
        user_id: askerId,
        username: 'Asker',
        avatar_url: 'https://example.com/asker.png',
        account_state: 'active',
        slug: 'asker',
        created_at: at(1),
        updated_at: at(1),
      });
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
      let newestId = null;
      for (let index = 0; index <= 200; index += 1) {
        newestId = await ctx.db.insert('faq_items', {
          ruleset_id: rulesetId,
          slug: String(index),
          question: `Question ${index}?`,
          asked_by: askerId,
          created_at: new Date(Date.UTC(2026, 6, 2, 0, 0, index)).toISOString(),
          updated_at: at(2),
          accepted_answer_id: null,
        });
      }
      const answerId = await ctx.db.insert('faq_answers', {
        faq_item_id: newestId!,
        answer: 'The newest question has an answer.',
        answered_by: askerId,
        created_at: at(3),
      });
      return { listed: await loadFaqItemsForRuleset(ctx, rulesetId), profileId, answerId };
    });

    const slugs = listed.map((item) => item.slug);
    expect(slugs).toHaveLength(200);
    expect(slugs[0]).toBe('200');
    expect(slugs).not.toContain('0');
    /* Each listed question carries its own answers and its asker's profile chip. */
    expect(listed[0]?.faq_answers.map((answer) => answer._id)).toEqual([answerId]);
    expect(listed[1]?.faq_answers).toEqual([]);
    expect(listed[0]?.asker_profile).toEqual({
      id: profileId,
      slug: 'asker',
      username: 'Asker',
      avatar_url: 'https://example.com/asker.png',
    });
  });
});
