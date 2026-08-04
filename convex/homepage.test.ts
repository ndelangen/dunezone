/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import aggregateTest from '@convex-dev/aggregate/test';
import migrationsTest from '@convex-dev/migrations/test';
import { convexTest } from 'convex-test';
import { describe, expect, test, vi } from 'vitest';

import { assetPublishingFaction } from '../src/game/fixtures/assetPublishingFaction';
import { api, internal } from './_generated/api';
import { applicationTriggers } from './lib/applicationTriggers';
import { ensureProfileForUser } from './lib/profileBootstrap';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

describe('homepage page data', () => {
  test('removes retired homepage counters from existing rulesets', async () => {
    const t = convexTest(schema, modules);
    aggregateTest.register(t, 'statistics');
    migrationsTest.register(t);
    const rulesetId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert('users', { name: 'Legacy homepage owner' });
      return await ctx.db.insert('rulesets', {
        name: 'Legacy homepage ruleset',
        slug: 'legacy-homepage-ruleset',
        created_at: '2026-08-04T10:00:00.000Z',
        updated_at: '2026-08-04T10:00:00.000Z',
        owner_id: userId,
        group_id: null,
        is_deleted: false,
        image_cover: null,
        homepage_question_count: 3,
        homepage_answer_count: 5,
      });
    });

    await t.mutation(internal.migrations.rulesets_remove_homepage_counts_v1, {});

    const ruleset = await t.run((ctx) => ctx.db.get(rulesetId));
    expect(ruleset).not.toHaveProperty('homepage_question_count');
    expect(ruleset).not.toHaveProperty('homepage_answer_count');
  });

  test('deletes large FAQ answer sets in bounded aggregate-safe batches', async () => {
    const t = convexTest({ schema, modules, transactionLimits: true });
    aggregateTest.register(t, 'statistics');
    aggregateTest.register(t, 'profileDiscovery');
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
      }));
      expect(afterFirstBatch.question).not.toBeNull();
      expect(afterFirstBatch.answers).toHaveLength(401);

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
    }));
    expect(afterCleanup.question).toBeNull();
    expect(afterCleanup.answers).toEqual([]);
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
    aggregateTest.register(t, 'statistics');
    aggregateTest.register(t, 'profileDiscovery');
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
    }));
    expect(afterCleanup.question).toBeNull();
    expect(afterCleanup.answers).toEqual([]);
  });

  test('serves exact Statistics totals without migration readiness', async () => {
    const t = convexTest(schema, modules);
    aggregateTest.register(t, 'statistics');
    aggregateTest.register(t, 'profileDiscovery');
    const userId = await t.run((ctx) => ctx.db.insert('users', { name: 'Homepage maker' }));
    await t.run((rawCtx) =>
      ensureProfileForUser(applicationTriggers.wrapDB(rawCtx), userId, {
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

    const [homepage, statistics, migrationRuns] = await Promise.all([
      t.query(api.homepage.get, {}),
      t.query(api.statistics.getGlobalTotals, {}),
      t.run((ctx) => ctx.db.query('migration_runs').take(1)),
    ]);
    expect(migrationRuns).toEqual([]);
    expect(homepage.community.counts).toEqual({
      factions: 1,
      rulesets: 1,
      members: 1,
      questions: 1,
      answers: 1,
    });
    expect(homepage.community.counts).toEqual({
      factions: statistics.factions,
      rulesets: statistics.rulesets,
      members: statistics.users,
      questions: statistics.questions,
      answers: statistics.answers,
    });
    expect(homepage.community.newestMembers).toHaveLength(1);

    await asUser.mutation(api.factions.softDelete, { id: faction._id });
    await asUser.mutation(api.rulesets.softDelete, { id: ruleset._id });
    await expect(asUser.mutation(api.faq.deleteAnswer, { id: answer._id })).resolves.toMatchObject({
      id: answer._id,
    });

    expect((await t.query(api.homepage.get, {})).community.counts).toEqual({
      factions: 0,
      rulesets: 0,
      members: 1,
      questions: 1,
      answers: 0,
    });
  });

  test('reuses discoverable profiles in the homepage with exact eligibility and ordering', async () => {
    const t = convexTest(schema, modules);
    aggregateTest.register(t, 'statistics');
    aggregateTest.register(t, 'profileDiscovery');
    migrationsTest.register(t);
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
      }
    });

    await t.mutation(internal.migrations.profile_discovery_profiles_v1, {});

    const discovered = await t.query(api.profiles.newestDiscoverable, { limit: 4 });
    const members = (await t.query(api.homepage.get, {})).community.newestMembers;
    expect(members).toEqual(discovered);
    expect(members.map((member) => member.slug)).toEqual(['third', 'second', 'first']);
    expect(members.map((member) => member.createdAt)).toEqual([
      '2026-07-03T00:00:00.000Z',
      '2026-07-02T00:00:00.000Z',
      '2026-07-01T00:00:00.000Z',
    ]);
  });
});
