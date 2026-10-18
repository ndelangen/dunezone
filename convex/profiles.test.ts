/// <reference types="vite/client" />

import { expect, test } from 'vite-plus/test';

import { api } from './_generated/api';
import { applicationTest } from './application.test.fixture';
import { applicationTriggers } from './lib/applicationTriggers';

test('profile list includes activity counts', async () => {
  const t = applicationTest();
  const ids = await t.run(async (rawCtx) => {
    const ctx = applicationTriggers.wrapDB(rawCtx);
    const userId = await ctx.db.insert('users', {});
    const profileId = await ctx.db.insert('profiles', {
      user_id: userId,
      username: 'Central',
      avatar_url: null,
      account_state: 'active',
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
      about: 'A test ruleset with an About long enough to satisfy the fifty character floor.',
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

    /* Activity counts per person: a quiet member counts zero, and a deleted account's activity lands on nobody listed. */
    const quietUserId = await ctx.db.insert('users', {});
    const quietProfileId = await ctx.db.insert('profiles', {
      user_id: quietUserId,
      username: 'Quiet',
      avatar_url: null,
      account_state: 'active',
      slug: 'quiet',
      created_at: '2026-07-19T00:00:00.000Z',
      updated_at: '2026-07-19T00:00:00.000Z',
    });
    const goneUserId = await ctx.db.insert('users', {});
    await ctx.db.insert('profiles', {
      user_id: goneUserId,
      username: 'Gone',
      avatar_url: null,
      account_state: 'deleted',
      slug: 'gone',
      created_at: '2026-07-19T00:00:00.000Z',
      updated_at: '2026-07-19T00:00:00.000Z',
    });
    await ctx.db.insert('faq_answers', {
      faq_item_id: questionId,
      answer: 'Pain.',
      answered_by: goneUserId,
      created_at: '2026-07-19T00:00:00.000Z',
    });

    return { profileId, quietProfileId };
  });

  const profiles = await t.query(api.profiles.list, {});

  expect(profiles).toHaveLength(2);
  expect(profiles.find((profile) => profile._id === ids.profileId)).toMatchObject({
    activity: {
      groupCount: 1,
      factionCount: 1,
      questionCount: 1,
      answerCount: 1,
    },
  });
  expect(profiles.find((profile) => profile._id === ids.quietProfileId)).toMatchObject({
    activity: { groupCount: 0, factionCount: 0, questionCount: 0, answerCount: 0 },
  });
});

test('profile detail returns the newest bounded FAQ activity', async () => {
  const t = applicationTest();
  await t.run(async (ctx) => {
    const userId = await ctx.db.insert('users', {});
    await ctx.db.insert('profiles', {
      user_id: userId,
      username: 'Recent FAQ author',
      avatar_url: null,
      account_state: 'active',
      slug: 'recent-faq-author',
      created_at: '2026-08-05T00:00:00.000Z',
      updated_at: '2026-08-05T00:00:00.000Z',
    });
    const rulesetId = await ctx.db.insert('rulesets', {
      name: 'FAQ activity',
      about: 'A test ruleset with an About long enough to satisfy the fifty character floor.',
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

  const profile = await t.query(api.profiles.pageBySlug, { slug: 'recent-faq-author' });

  expect(profile.faqAsked).toHaveLength(200);
  expect(profile.faqAsked[0].slug).toBe('200');
  expect(profile.faqAsked[199].slug).toBe('1');
  expect(profile.faqAnswers).toHaveLength(200);
  expect(profile.faqAnswers[0].answer).toBe('Answer 200');
  expect(profile.faqAnswers[199].answer).toBe('Answer 1');
});

test('the profile list and lookup by id skip deleted profiles, however many there are', async () => {
  const t = applicationTest();
  const { liveId, deletedId } = await t.run(async (rawCtx) => {
    const ctx = applicationTriggers.wrapDB(rawCtx);
    const profile = async (index: number, accountState: 'active' | 'deleted') =>
      await ctx.db.insert('profiles', {
        user_id: await ctx.db.insert('users', {}),
        username: `Profile ${index}`,
        avatar_url: null,
        account_state: accountState,
        slug: `profile-${index}`,
        created_at: '2026-07-19T00:00:00.000Z',
        updated_at: '2026-07-19T00:00:00.000Z',
      });
    let deletedId = null;
    for (let index = 0; index < 500; index += 1) {
      deletedId = await profile(index, 'deleted');
    }
    return { liveId: await profile(500, 'active'), deletedId: deletedId! };
  });

  expect((await t.query(api.profiles.list, {})).map((entry) => entry._id)).toEqual([liveId]);
  await expect(t.query(api.profiles.getById, { id: deletedId })).rejects.toThrow('not found');
  await expect(t.query(api.profiles.getById, { id: liveId })).resolves.toMatchObject({ _id: liveId });
});
