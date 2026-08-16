/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import aggregateTest from '@convex-dev/aggregate/test';
import migrationsTest from '@convex-dev/migrations/test';
import { convexTest } from 'convex-test';
import { expect, test, vi } from 'vitest';

import { api, internal } from './_generated/api';
import { applicationTriggers } from './lib/applicationTriggers';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

test('maintains global and per-ruleset totals through wrapped writes', async () => {
  const t = convexTest(schema, modules);
  aggregateTest.register(t, 'statistics');
  aggregateTest.register(t, 'profileActivity');
  aggregateTest.register(t, 'profileDiscovery');

  const ids = await t.run(async (rawCtx) => {
    const ctx = applicationTriggers.wrapDB(rawCtx);
    const userId = await ctx.db.insert('users', { name: 'Statistics owner' });
    await ctx.db.insert('profiles', {
      user_id: userId,
      username: 'Statistics owner',
      avatar_url: null,
      slug: 'statistics-owner',
      created_at: '2026-08-04T10:00:00.000Z',
      updated_at: '2026-08-04T10:00:00.000Z',
    });
    const activeFactionId = await ctx.db.insert('factions', {
      owner_id: userId,
      data: {},
      slug: 'active-faction',
      created_at: '2026-08-04T10:00:00.000Z',
      updated_at: '2026-08-04T10:00:00.000Z',
      is_deleted: false,
      group_id: null,
    });
    await ctx.db.insert('factions', {
      owner_id: userId,
      data: {},
      slug: 'deleted-faction',
      created_at: '2026-08-04T10:00:00.000Z',
      updated_at: '2026-08-04T10:00:00.000Z',
      is_deleted: true,
      group_id: null,
    });
    const activeRulesetId = await ctx.db.insert('rulesets', {
      name: 'Active ruleset',
      slug: 'active-ruleset',
      created_at: '2026-08-04T10:00:00.000Z',
      updated_at: '2026-08-04T10:00:00.000Z',
      owner_id: userId,
      group_id: null,
      is_deleted: false,
      image_cover: null,
    });
    const deletedRulesetId = await ctx.db.insert('rulesets', {
      name: 'Deleted ruleset',
      slug: 'deleted-ruleset',
      created_at: '2026-08-04T10:00:00.000Z',
      updated_at: '2026-08-04T10:00:00.000Z',
      owner_id: userId,
      group_id: null,
      is_deleted: true,
      image_cover: null,
    });
    const activeQuestionId = await ctx.db.insert('faq_items', {
      ruleset_id: activeRulesetId,
      slug: '1',
      question: 'How are active questions counted?',
      tags: ['rules'],
      asked_by: userId,
      created_at: '2026-08-04T10:00:00.000Z',
      updated_at: '2026-08-04T10:00:00.000Z',
      accepted_answer_id: null,
    });
    const deletedRulesetQuestionId = await ctx.db.insert('faq_items', {
      ruleset_id: deletedRulesetId,
      slug: '1',
      question: 'Does parent deletion hide this question from totals?',
      tags: ['rules'],
      asked_by: userId,
      created_at: '2026-08-04T10:00:00.000Z',
      updated_at: '2026-08-04T10:00:00.000Z',
      accepted_answer_id: null,
    });
    const activeAnswerId = await ctx.db.insert('faq_answers', {
      faq_item_id: activeQuestionId,
      answer: 'It is counted by its own existence.',
      answered_by: userId,
      created_at: '2026-08-04T10:00:00.000Z',
    });
    await ctx.db.insert('faq_answers', {
      faq_item_id: deletedRulesetQuestionId,
      answer: 'The deleted parent does not change the total.',
      answered_by: userId,
      created_at: '2026-08-04T10:00:00.000Z',
    });

    return { activeFactionId, activeRulesetId, deletedRulesetId, activeQuestionId, activeAnswerId };
  });

  await expect(t.query(api.statistics.getGlobalTotals, {})).resolves.toEqual({
    users: 1,
    factions: 1,
    rulesets: 1,
    questions: 2,
    answers: 2,
  });
  await expect(t.query(api.statistics.getRulesetTotals, { rulesetId: ids.activeRulesetId })).resolves.toEqual({
    questions: 1,
    answers: 1,
  });
  await expect(t.query(api.statistics.getRulesetTotals, { rulesetId: ids.deletedRulesetId })).resolves.toEqual({
    questions: 1,
    answers: 1,
  });

  await t.run(async (rawCtx) => {
    const ctx = applicationTriggers.wrapDB(rawCtx);
    await ctx.db.patch(ids.activeFactionId, { is_deleted: true });
    await ctx.db.patch(ids.activeRulesetId, { is_deleted: true });
    await ctx.db.delete(ids.activeAnswerId);
    await ctx.db.delete(ids.activeQuestionId);
  });

  await expect(t.query(api.statistics.getGlobalTotals, {})).resolves.toEqual({
    users: 1,
    factions: 0,
    rulesets: 0,
    questions: 1,
    answers: 1,
  });
  await expect(t.query(api.statistics.getRulesetTotals, { rulesetId: ids.activeRulesetId })).resolves.toEqual({
    questions: 0,
    answers: 0,
  });
});

test('backfills Statistics resumably and rebuilds after later writes bypass triggers', async () => {
  const t = convexTest(schema, modules);
  aggregateTest.register(t, 'statistics');
  aggregateTest.register(t, 'profileActivity');
  aggregateTest.register(t, 'profileDiscovery');
  migrationsTest.register(t);

  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert('users', { name: 'Dashboard editor' });
    await ctx.db.insert('profiles', {
      user_id: userId,
      username: 'Dashboard editor',
      avatar_url: null,
      slug: 'dashboard-editor',
      created_at: '2026-08-04T10:00:00.000Z',
      updated_at: '2026-08-04T10:00:00.000Z',
    });
    const insertedRulesetId = await ctx.db.insert('rulesets', {
      name: 'Dashboard ruleset',
      slug: 'dashboard-ruleset',
      created_at: '2026-08-04T10:00:00.000Z',
      updated_at: '2026-08-04T10:00:00.000Z',
      owner_id: userId,
      group_id: null,
      is_deleted: false,
      image_cover: null,
    });
    const questionId = await ctx.db.insert('faq_items', {
      ruleset_id: insertedRulesetId,
      slug: '1',
      question: 'Can the aggregate be rebuilt?',
      tags: ['rules'],
      asked_by: userId,
      created_at: '2026-08-04T10:00:00.000Z',
      updated_at: '2026-08-04T10:00:00.000Z',
      accepted_answer_id: null,
    });
    const answerId = await ctx.db.insert('faq_answers', {
      faq_item_id: questionId,
      answer: 'Yes, from the canonical records.',
      answered_by: userId,
      created_at: '2026-08-04T10:00:00.000Z',
    });
    return { rulesetId: insertedRulesetId, questionId, answerId };
  });

  await expect(t.query(api.statistics.getGlobalTotals, {})).resolves.toEqual({
    users: 0,
    factions: 0,
    rulesets: 0,
    questions: 0,
    answers: 0,
  });

  await t.mutation(internal.migrations.statistics_profiles_v1, {});
  await t.mutation(internal.migrations.statistics_factions_v1, {});
  await t.mutation(internal.migrations.statistics_rulesets_v1, {});
  await t.mutation(internal.migrations.statistics_questions_v1, {});
  await t.mutation(internal.migrations.statistics_answers_v1, {});

  await expect(t.query(api.statistics.getGlobalTotals, {})).resolves.toEqual({
    users: 1,
    factions: 0,
    rulesets: 1,
    questions: 1,
    answers: 1,
  });
  await expect(t.query(api.statistics.getRulesetTotals, { rulesetId: ids.rulesetId })).resolves.toEqual({
    questions: 1,
    answers: 1,
  });

  await t.run(async (ctx) => {
    await ctx.db.delete(ids.answerId);
    await ctx.db.delete(ids.questionId);
  });

  vi.useFakeTimers();
  try {
    await t.mutation(internal.statistics.rebuild, {});
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
  } finally {
    vi.useRealTimers();
  }

  await expect(t.query(api.statistics.getGlobalTotals, {})).resolves.toEqual({
    users: 1,
    factions: 0,
    rulesets: 1,
    questions: 0,
    answers: 0,
  });
  await expect(t.query(api.statistics.getRulesetTotals, { rulesetId: ids.rulesetId })).resolves.toEqual({
    questions: 0,
    answers: 0,
  });
});
