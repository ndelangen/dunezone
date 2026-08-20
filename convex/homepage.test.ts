/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import aggregateTest from '@convex-dev/aggregate/test';
import migrationsTest from '@convex-dev/migrations/test';
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';

import { assetPublishingFaction } from '../src/shared/factions/fixtures/assetPublishingFaction';
import { api, internal } from './_generated/api';
import { applicationTriggers } from './lib/applicationTriggers';
import { ensureProfileForUser } from './lib/profileBootstrap';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

describe('homepage page data', () => {
  test('serves exact Statistics totals without migration readiness', async () => {
    const t = convexTest(schema, modules);
    aggregateTest.register(t, 'statistics');
    aggregateTest.register(t, 'profileActivity');
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
      description: 'A test ruleset with a description long enough to satisfy the fifty character floor.',
      group_id: null,
      image_cover: null,
    });
    const question = await asUser.mutation(api.faq.createQuestion, {
      rulesetId: ruleset._id,
      question: 'How does the homepage stay accurate?',
      tags: ['rules'],
    });
    const answer = await asUser.mutation(api.faq.createAnswer, {
      faq_item_id: question.questionId,
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
    aggregateTest.register(t, 'profileActivity');
    aggregateTest.register(t, 'profileDiscovery');
    migrationsTest.register(t);
    await t.run(async (ctx) => {
      const users = await Promise.all(
        Array.from({ length: 6 }, (_, index) => ctx.db.insert('users', { name: `Homepage member ${index}` }))
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
          account_state: 'active',
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
