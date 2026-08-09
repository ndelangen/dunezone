/// <reference types="vite/client" />

import aggregateTest from '@convex-dev/aggregate/test';
import { convexTest } from 'convex-test';
import { expect, test } from 'vitest';

import { api } from './_generated/api';
import { applicationTriggers } from './lib/applicationTriggers';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

test('profile list includes activity counts', async () => {
  const t = convexTest(schema, modules);
  aggregateTest.register(t, 'statistics');
  aggregateTest.register(t, 'profileDiscovery');
  aggregateTest.register(t, 'profileActivity');
  const ids = await t.run(async (rawCtx) => {
    const ctx = applicationTriggers.wrapDB(rawCtx);
    const userId = await ctx.db.insert('users', {});
    const profileId = await ctx.db.insert('profiles', {
      user_id: userId,
      username: 'Central',
      avatar_url: null,
      slug: 'central',
      created_at: '2026-07-19T00:00:00.000Z',
      updated_at: '2026-07-19T00:00:00.000Z',
    });
    const groupId = await ctx.db.insert('groups', {
      name: 'Sietch Tabr',
      slug: 'sietch-tabr',
      created_at: '2026-07-19T00:00:00.000Z',
      created_by: userId,
      is_deleted: false,
    });
    await ctx.db.insert('group_members', {
      group_id: groupId,
      user_id: userId,
      status: 'active',
      requested_at: '2026-07-19T00:00:00.000Z',
      approved_at: '2026-07-19T00:00:00.000Z',
      approved_by: userId,
    });
    await ctx.db.insert('factions', {
      owner_id: userId,
      data: {},
      slug: 'atreides',
      created_at: '2026-07-19T00:00:00.000Z',
      updated_at: '2026-07-19T00:00:00.000Z',
      is_deleted: false,
      group_id: null,
    });
    await ctx.db.insert('factions', {
      owner_id: userId,
      data: {},
      slug: 'deleted-faction',
      created_at: '2026-07-19T00:00:00.000Z',
      updated_at: '2026-07-19T00:00:00.000Z',
      is_deleted: true,
      group_id: null,
    });
    const rulesetId = await ctx.db.insert('rulesets', {
      name: 'Rules',
      slug: 'rules',
      created_at: '2026-07-19T00:00:00.000Z',
      updated_at: '2026-07-19T00:00:00.000Z',
      owner_id: userId,
      group_id: null,
      is_deleted: false,
      image_cover: null,
    });
    const questionId = await ctx.db.insert('faq_items', {
      ruleset_id: rulesetId,
      slug: '1',
      question: 'What is the gom jabbar?',
      asked_by: userId,
      created_at: '2026-07-19T00:00:00.000Z',
      updated_at: '2026-07-19T00:00:00.000Z',
      accepted_answer_id: null,
    });
    await ctx.db.insert('faq_answers', {
      faq_item_id: questionId,
      answer: 'A test of humanity.',
      answered_by: userId,
      created_at: '2026-07-19T00:00:00.000Z',
    });

    return { profileId };
  });

  const profiles = await t.query(api.profiles.list, {});

  expect(profiles).toHaveLength(1);
  expect(profiles[0]).toMatchObject({
    _id: ids.profileId,
    activity: {
      groupCount: 1,
      factionCount: 1,
      questionCount: 1,
      answerCount: 1,
    },
  });
});

test('profile detail returns the newest bounded FAQ activity', async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const userId = await ctx.db.insert('users', {});
    await ctx.db.insert('profiles', {
      user_id: userId,
      username: 'Recent FAQ author',
      avatar_url: null,
      slug: 'recent-faq-author',
      created_at: '2026-08-05T00:00:00.000Z',
      updated_at: '2026-08-05T00:00:00.000Z',
    });
    const rulesetId = await ctx.db.insert('rulesets', {
      name: 'FAQ activity',
      slug: 'faq-activity',
      created_at: '2026-08-05T00:00:00.000Z',
      updated_at: '2026-08-05T00:00:00.000Z',
      owner_id: userId,
      group_id: null,
      is_deleted: false,
      image_cover: null,
    });

    for (let index = 0; index < 201; index += 1) {
      const createdAt = new Date(index).toISOString();
      const questionId = await ctx.db.insert('faq_items', {
        ruleset_id: rulesetId,
        slug: String(index),
        question: `Question ${index}`,
        asked_by: userId,
        created_at: createdAt,
        updated_at: createdAt,
        accepted_answer_id: null,
      });
      await ctx.db.insert('faq_answers', {
        faq_item_id: questionId,
        answer: `Answer ${index}`,
        answered_by: userId,
        created_at: createdAt,
      });
    }
  });

  const profile = await t.query(api.profiles.getBySlug, { slug: 'recent-faq-author' });

  expect(profile.faqAsked).toHaveLength(200);
  expect(profile.faqAsked[0].slug).toBe('200');
  expect(profile.faqAsked[199].slug).toBe('1');
  expect(profile.faqAnswers).toHaveLength(200);
  expect(profile.faqAnswers[0].answer).toBe('Answer 200');
  expect(profile.faqAnswers[199].answer).toBe('Answer 1');
});
