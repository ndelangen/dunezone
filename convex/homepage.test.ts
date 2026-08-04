/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import aggregateTest from '@convex-dev/aggregate/test';
import { convexTest } from 'convex-test';
import { describe, expect, test, vi } from 'vitest';

import { assetPublishingFaction } from '../src/game/fixtures/assetPublishingFaction';
import { api } from './_generated/api';
import { adjustHomepageRulesetFaqTotals, syncHomepageNewestMember } from './lib/homepageCommunity';
import { ensureProfileForUser } from './lib/profileBootstrap';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const MIGRATION_IDS = ['homepage_factions_v1', 'homepage_rulesets_v1', 'homepage_members_v1'];

describe('homepage page data', () => {
  test('deletes large FAQ answer sets in bounded aggregate-safe batches', async () => {
    const t = convexTest({ schema, modules, transactionLimits: true });
    aggregateTest.register(t, 'homepageCommunity');
    const userId = await t.run((ctx) => ctx.db.insert('users', { name: 'FAQ owner' }));
    const asUser = t.withIdentity({ subject: userId });
    const ruleset = await asUser.mutation(api.rulesets.create, {
      name: 'LargeFAQRuleset',
      group_id: null,
      image_cover: null,
    });
    const question = await asUser.mutation(api.faq.createItem, {
      ruleset_id: ruleset._id,
      question: 'How are large discussions deleted safely?',
      tags: ['rules'],
    });
    await t.run(async (ctx) => {
      for (let index = 0; index < 501; index += 1) {
        await ctx.db.insert('faq_answers', {
          faq_item_id: question._id,
          answer: `Answer ${index}`,
          answered_by: userId,
          created_at: new Date(index).toISOString(),
        });
      }
      await adjustHomepageRulesetFaqTotals(ctx, ruleset._id, { answers: 501 });
    });

    vi.useFakeTimers();
    try {
      await asUser.mutation(api.faq.deleteItem, { id: question._id });

      const afterFirstBatch = await t.run(async (ctx) => ({
        question: await ctx.db.get(question._id),
        answers: await ctx.db
          .query('faq_answers')
          .withIndex('by_faq_item_created', (q) => q.eq('faq_item_id', question._id))
          .take(600),
        ruleset: await ctx.db.get(ruleset._id),
      }));
      expect(afterFirstBatch.question).not.toBeNull();
      expect(afterFirstBatch.answers).toHaveLength(401);
      expect(afterFirstBatch.ruleset).toMatchObject({
        homepage_question_count: 1,
        homepage_answer_count: 401,
      });

      await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    } finally {
      vi.useRealTimers();
    }

    const afterCleanup = await t.run(async (ctx) => ({
      question: await ctx.db.get(question._id),
      answers: await ctx.db
        .query('faq_answers')
        .withIndex('by_faq_item_created', (q) => q.eq('faq_item_id', question._id))
        .take(1),
      ruleset: await ctx.db.get(ruleset._id),
    }));
    expect(afterCleanup.question).toBeNull();
    expect(afterCleanup.answers).toEqual([]);
    expect(afterCleanup.ruleset).toMatchObject({
      homepage_question_count: 0,
      homepage_answer_count: 0,
    });
  });

  test('reserves transaction headroom while deleting large answer documents', async () => {
    const t = convexTest({
      schema,
      modules,
      transactionLimits: {
        bytesRead: 3 * 1024 * 1024,
        bytesWritten: 3 * 1024 * 1024,
      },
    });
    aggregateTest.register(t, 'homepageCommunity');
    const userId = await t.run((ctx) => ctx.db.insert('users', { name: 'Large answer owner' }));
    const asUser = t.withIdentity({ subject: userId });
    const ruleset = await asUser.mutation(api.rulesets.create, {
      name: 'LargeAnswerRuleset',
      group_id: null,
      image_cover: null,
    });
    const question = await asUser.mutation(api.faq.createItem, {
      ruleset_id: ruleset._id,
      question: 'Can large answers be deleted without exhausting a transaction?',
      tags: ['rules'],
    });
    const largeAnswer = 'a'.repeat(400 * 1024);
    for (let index = 0; index < 6; index += 1) {
      await t.run((ctx) =>
        ctx.db.insert('faq_answers', {
          faq_item_id: question._id,
          answer: largeAnswer,
          answered_by: userId,
          created_at: new Date(index).toISOString(),
        })
      );
    }
    await t.run((ctx) => adjustHomepageRulesetFaqTotals(ctx, ruleset._id, { answers: 6 }));

    vi.useFakeTimers();
    try {
      await asUser.mutation(api.faq.deleteItem, { id: question._id });
      const remainingAfterFirstBatch = await t.run((ctx) =>
        ctx.db
          .query('faq_answers')
          .withIndex('by_faq_item_created', (q) => q.eq('faq_item_id', question._id))
          .take(10)
      );
      expect(remainingAfterFirstBatch.length).toBeGreaterThan(0);
      expect(remainingAfterFirstBatch.length).toBeLessThan(6);

      await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    } finally {
      vi.useRealTimers();
    }

    const afterCleanup = await t.run(async (ctx) => ({
      question: await ctx.db.get(question._id),
      answers: await ctx.db
        .query('faq_answers')
        .withIndex('by_faq_item_created', (q) => q.eq('faq_item_id', question._id))
        .take(1),
      ruleset: await ctx.db.get(ruleset._id),
    }));
    expect(afterCleanup.question).toBeNull();
    expect(afterCleanup.answers).toEqual([]);
    expect(afterCleanup.ruleset).toMatchObject({
      homepage_question_count: 0,
      homepage_answer_count: 0,
    });
  });

  test('publishes exact live totals only after aggregate backfills are ready', async () => {
    const t = convexTest(schema, modules);
    aggregateTest.register(t, 'homepageCommunity');
    const userId = await t.run((ctx) => ctx.db.insert('users', { name: 'Homepage maker' }));
    await t.run((ctx) =>
      ensureProfileForUser(ctx, userId, {
        displayName: 'Homepage maker',
        imageUrl: 'https://example.com/avatar.png',
      })
    );
    const asUser = t.withIdentity({ subject: userId });
    const faction = await asUser.mutation(api.factions.create, {
      data: { ...assetPublishingFaction, name: 'Homepage faction' },
      group_id: null,
    });
    const ruleset = await asUser.mutation(api.rulesets.create, {
      name: 'HomepageRuleset',
      group_id: null,
      image_cover: null,
    });
    const question = await asUser.mutation(api.faq.createItem, {
      ruleset_id: ruleset._id,
      question: 'How does the homepage stay accurate?',
      tags: ['rules'],
    });
    const answer = await asUser.mutation(api.faq.createAnswer, {
      faq_item_id: question._id,
      answer: 'Every source mutation updates the same aggregate transaction.',
    });

    expect((await t.query(api.homepage.page, {})).community.counts).toBeNull();

    await t.run(async (ctx) => {
      for (const migrationId of MIGRATION_IDS) {
        await ctx.db.insert('migration_runs', {
          migration_id: migrationId,
          state: 'success',
          is_done: true,
          processed: 1,
          latest_start: Date.now(),
          latest_end: Date.now(),
          updated_at: new Date().toISOString(),
        });
      }
    });

    const ready = await t.query(api.homepage.page, {});
    expect(ready.community.counts).toEqual({
      factions: 1,
      rulesets: 1,
      members: 1,
      questions: 1,
      answers: 1,
    });
    expect(ready.community.newestMembers).toHaveLength(1);

    await asUser.mutation(api.factions.softDelete, { id: faction._id });
    await asUser.mutation(api.rulesets.softDelete, { id: ruleset._id });
    await expect(asUser.mutation(api.faq.deleteAnswer, { id: answer._id })).resolves.toMatchObject({
      id: answer._id,
    });

    expect((await t.query(api.homepage.page, {})).community.counts).toEqual({
      factions: 0,
      rulesets: 0,
      members: 1,
      questions: 0,
      answers: 0,
    });
  });

  test('returns only eligible newest members in public timestamp order', async () => {
    const t = convexTest(schema, modules);
    aggregateTest.register(t, 'homepageCommunity');
    await t.run(async (ctx) => {
      const users = await Promise.all(
        Array.from({ length: 6 }, (_, index) =>
          ctx.db.insert('users', { name: `Homepage member ${index}` })
        )
      );
      const rows = [
        ['first', '2026-07-01T00:00:00.000Z', 'https://example.com/first.png'],
        ['second', '2026-07-02T00:00:00.000Z', 'https://example.com/second.png'],
        ['user', '2026-07-06T00:00:00.000Z', 'https://example.com/placeholder.png'],
        ['invalid-date', 'not-a-date', 'https://example.com/invalid.png'],
        ['no-avatar', '2026-07-05T00:00:00.000Z', null],
        ['third', '2026-07-03T00:00:00.000Z', 'https://example.com/third.png'],
      ] as const;
      for (const [index, [slug, createdAt, avatarUrl]] of rows.entries()) {
        const id = await ctx.db.insert('profiles', {
          user_id: users[index],
          username: `Member ${index}`,
          avatar_url: avatarUrl,
          slug,
          created_at: createdAt,
          updated_at: createdAt,
        });
        const profile = await ctx.db.get(id);
        if (!profile) {
          throw new Error('Failed to create homepage test profile');
        }
        await syncHomepageNewestMember(ctx, profile);
      }
    });

    const members = (await t.query(api.homepage.page, {})).community.newestMembers;
    expect(members.map((member) => member.slug)).toEqual(['third', 'second', 'first']);
    expect(members.map((member) => member.createdAt)).toEqual([
      '2026-07-03T00:00:00.000Z',
      '2026-07-02T00:00:00.000Z',
      '2026-07-01T00:00:00.000Z',
    ]);
  });
});
