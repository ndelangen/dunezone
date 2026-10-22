/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import type { convexTest } from 'convex-test';
import { describe, expect, test } from 'vite-plus/test';

import { assetPublishingFaction } from '../src/shared/factions/fixtures/assetPublishingFaction';
import { PROFILE_FAQ_PAGE_SIZE } from '../src/shared/profiles/faqActivity';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { applicationTest } from './application.test.fixture';
import { syncSeededFactionCards } from './factions.test.fixture';
import { applicationTriggers } from './lib/applicationTriggers';
import { PROFILE_FACTION_PREVIEW_SIZE } from './lib/profileDetail';

type SeedResult = {
  userId: Id<'users'>;
  activeGroupId: Id<'groups'>;
  laterGroupId: Id<'groups'>;
  advancedRulesetId: Id<'rulesets'>;
  basicRulesetId: Id<'rulesets'>;
  activeFactionId: Id<'factions'>;
  earlyQuestionId: Id<'faq_items'>;
  lateQuestionId: Id<'faq_items'>;
  acceptedAnswerId: Id<'faq_answers'>;
  otherAnswerId: Id<'faq_answers'>;
  askerProfileId: Id<'profiles'>;
};

const at = (day: number) => `2026-07-${String(day).padStart(2, '0')}T00:00:00.000Z`;

/**
 * Seeds through the application's triggers, as every deployed writer does, so the catalogue lists the factions the way the page reads them.
 * `extraFactions` more live factions beside the one, newest last, so a page can show its first few and count the rest.
 */
async function seedProfileDetail(t: ReturnType<typeof convexTest>, extraFactions = 0): Promise<SeedResult> {
  const seeded = await t.run(async (rawCtx) => {
    const ctx = applicationTriggers.wrapDB(rawCtx);
    const userId = await ctx.db.insert('users', { name: 'Central' });
    const askerId = await ctx.db.insert('users', { name: 'Asker' });
    const profilelessAskerId = await ctx.db.insert('users', { name: 'No profile' });

    await ctx.db.insert('profiles', {
      user_id: userId,
      username: 'Central',
      avatar_url: null,
      account_state: 'active',
      slug: 'central',
      created_at: at(1),
      updated_at: at(1),
    });
    const askerProfileId = await ctx.db.insert('profiles', {
      user_id: askerId,
      username: 'Asker',
      avatar_url: null,
      account_state: 'active',
      slug: 'asker',
      created_at: at(1),
      updated_at: at(1),
    });

    const activeGroupId = await ctx.db.insert('groups', {
      name: 'Sietch Tabr',
      slug: 'sietch-tabr',
      created_at: at(1),
      created_by: userId,
      is_deleted: false,
    });
    const pendingGroupId = await ctx.db.insert('groups', {
      name: 'Pending Sietch',
      slug: 'pending-sietch',
      created_at: at(1),
      created_by: userId,
      is_deleted: false,
    });
    const removedGroupId = await ctx.db.insert('groups', {
      name: 'Removed Sietch',
      slug: 'removed-sietch',
      created_at: at(1),
      created_by: userId,
      is_deleted: false,
    });
    await ctx.db.insert('group_members', {
      group_id: activeGroupId,
      user_id: userId,
      status: 'active',
      requested_at: at(2),
      approved_at: at(2),
      approved_by: userId,
    });
    await ctx.db.insert('group_members', {
      group_id: pendingGroupId,
      user_id: userId,
      status: 'pending',
      requested_at: at(2),
      approved_at: null,
      approved_by: null,
    });
    await ctx.db.insert('group_members', {
      group_id: removedGroupId,
      user_id: userId,
      status: 'removed',
      requested_at: at(2),
      approved_at: at(2),
      approved_by: userId,
    });
    // Joined later than Sietch Tabr but sorts earlier by name: proves membership order wins.
    const laterGroupId = await ctx.db.insert('groups', {
      name: 'Arrakeen Guild',
      slug: 'arrakeen-guild',
      created_at: at(1),
      created_by: userId,
      is_deleted: false,
    });
    await ctx.db.insert('group_members', {
      group_id: laterGroupId,
      user_id: userId,
      status: 'active',
      requested_at: at(3),
      approved_at: at(3),
      approved_by: userId,
    });
    const ghostGroupId = await ctx.db.insert('groups', {
      name: 'Ghost Sietch',
      slug: 'ghost-sietch',
      created_at: at(1),
      created_by: userId,
      is_deleted: false,
    });
    await ctx.db.insert('group_members', {
      group_id: ghostGroupId,
      user_id: userId,
      status: 'active',
      requested_at: at(4),
      approved_at: at(4),
      approved_by: userId,
    });
    await ctx.db.delete(ghostGroupId);

    const advancedRulesetId = await ctx.db.insert('rulesets', {
      name: 'Advanced',
      about: 'A test ruleset with an About long enough to satisfy the fifty character floor.',
      slug: 'advanced',
      created_at: at(1),
      updated_at: at(1),
      owner_id: userId,
      group_id: null,
      is_deleted: false,
      image_cover: null,
    });
    const basicRulesetId = await ctx.db.insert('rulesets', {
      name: 'Basic',
      about: 'A test ruleset with an About long enough to satisfy the fifty character floor.',
      slug: 'basic',
      created_at: at(1),
      updated_at: at(1),
      owner_id: userId,
      group_id: null,
      is_deleted: false,
      image_cover: null,
    });
    const deletedRulesetId = await ctx.db.insert('rulesets', {
      name: 'Deleted',
      about: 'A test ruleset with an About long enough to satisfy the fifty character floor.',
      slug: 'deleted',
      created_at: at(1),
      updated_at: at(1),
      owner_id: userId,
      group_id: null,
      is_deleted: true,
      image_cover: null,
    });

    const activeFactionId = await ctx.db.insert('factions', {
      owner_id: userId,
      data: { ...assetPublishingFaction, name: 'Atreides' },
      slug: 'atreides',
      created_at: at(3),
      updated_at: at(3),
      is_deleted: false,
      group_id: null,
    });
    await ctx.db.insert('factions', {
      owner_id: userId,
      data: { ...assetPublishingFaction, name: 'Deleted faction' },
      slug: 'deleted-faction',
      created_at: at(3),
      updated_at: at(3),
      is_deleted: true,
      group_id: null,
    });
    await ctx.db.insert('ruleset_factions', {
      ruleset_id: basicRulesetId,
      faction_id: activeFactionId,
    });
    await ctx.db.insert('ruleset_factions', {
      ruleset_id: advancedRulesetId,
      faction_id: activeFactionId,
    });
    await ctx.db.insert('ruleset_factions', {
      ruleset_id: deletedRulesetId,
      faction_id: activeFactionId,
    });
    for (let index = 1; index <= extraFactions; index += 1) {
      await ctx.db.insert('factions', {
        owner_id: userId,
        data: { ...assetPublishingFaction, name: `Sietch ${index}` },
        slug: `sietch-${index}`,
        created_at: at(10 + index),
        updated_at: at(10 + index),
        is_deleted: false,
        group_id: null,
      });
    }

    const earlyQuestionId = await ctx.db.insert('faq_items', {
      ruleset_id: advancedRulesetId,
      slug: '1',
      question: 'What is the gom jabbar?',
      asked_by: userId,
      created_at: at(4),
      updated_at: at(4),
      accepted_answer_id: null,
    });
    const lateQuestionId = await ctx.db.insert('faq_items', {
      ruleset_id: advancedRulesetId,
      slug: '2',
      question: 'What is a thumper?',
      asked_by: userId,
      created_at: at(5),
      updated_at: at(5),
      accepted_answer_id: null,
    });

    const answeredQuestionId = await ctx.db.insert('faq_items', {
      ruleset_id: advancedRulesetId,
      slug: '3',
      question: 'How does spice work?',
      asked_by: askerId,
      created_at: at(6),
      updated_at: at(6),
      accepted_answer_id: null,
    });
    const orphanAskerQuestionId = await ctx.db.insert('faq_items', {
      ruleset_id: advancedRulesetId,
      slug: '4',
      question: 'Who rides the worm?',
      asked_by: profilelessAskerId,
      created_at: at(7),
      updated_at: at(7),
      accepted_answer_id: null,
    });

    const acceptedAnswerId = await ctx.db.insert('faq_answers', {
      faq_item_id: answeredQuestionId,
      answer: 'Melange extends life.',
      answered_by: userId,
      created_at: at(8),
    });
    await ctx.db.patch(answeredQuestionId, { accepted_answer_id: acceptedAnswerId });
    const otherAnswerId = await ctx.db.insert('faq_answers', {
      faq_item_id: orphanAskerQuestionId,
      answer: 'The Fremen do.',
      answered_by: userId,
      created_at: at(9),
    });

    return {
      userId,
      activeGroupId,
      laterGroupId,
      advancedRulesetId,
      basicRulesetId,
      activeFactionId,
      earlyQuestionId,
      lateQuestionId,
      acceptedAnswerId,
      otherAnswerId,
      askerProfileId,
    };
  });
  await t.run(syncSeededFactionCards);
  return seeded;
}

describe('profile detail projection (api.profiles.pageBySlug)', () => {
  test('throws for an unknown slug', async () => {
    const t = applicationTest();
    await seedProfileDetail(t);

    await expect(t.query(api.profiles.pageBySlug, { slug: 'missing' })).rejects.toMatchObject({
      data: { code: 'NOT_FOUND' },
    });
  });

  test('only active memberships contribute to the public group list', async () => {
    const t = applicationTest();
    const seed = await seedProfileDetail(t);

    const page = await t.query(api.profiles.pageBySlug, { slug: 'central' });

    expect(page.groupSummaries).toEqual([
      { id: seed.activeGroupId, name: 'Sietch Tabr', slug: 'sietch-tabr' },
      { id: seed.laterGroupId, name: 'Arrakeen Guild', slug: 'arrakeen-guild' },
    ]);
  });

  test('excludes soft-deleted factions and parses faction data', async () => {
    const t = applicationTest();
    const seed = await seedProfileDetail(t);

    const page = await t.query(api.profiles.pageBySlug, { slug: 'central' });

    expect(page.factions.map((faction) => faction._id)).toEqual([seed.activeFactionId]);
    expect(page.factions[0]?.data.name).toBe('Atreides');
    expect(page.factionCount).toBe(1);
  });

  test('shows the newest few factions and counts them all, so the page costs the same however many a member has', async () => {
    const t = applicationTest();
    await seedProfileDetail(t, PROFILE_FACTION_PREVIEW_SIZE + 2);

    const page = await t.query(api.profiles.pageBySlug, { slug: 'central' });

    expect(page.factionCount).toBe(PROFILE_FACTION_PREVIEW_SIZE + 3);
    expect(page.factions.map((faction) => faction.data.name)).toEqual(
      Array.from(
        { length: PROFILE_FACTION_PREVIEW_SIZE },
        (_, index) => `Sietch ${PROFILE_FACTION_PREVIEW_SIZE + 2 - index}`
      )
    );
  });

  test('faction ruleset enrichment keeps only active rulesets in deterministic name order', async () => {
    const t = applicationTest();
    const seed = await seedProfileDetail(t);

    const page = await t.query(api.profiles.pageBySlug, { slug: 'central' });

    expect(page.factions[0]?.rulesets.map((ruleset) => ruleset.name)).toEqual(['Advanced', 'Basic']);
    expect(page.factions[0]?.rulesets.map((ruleset) => ruleset.id)).toEqual([
      seed.advancedRulesetId,
      seed.basicRulesetId,
    ]);
  });

  test('throws on malformed faction data at the query boundary', async () => {
    const t = applicationTest();
    await t.run(async (rawCtx) => {
      const ctx = applicationTriggers.wrapDB(rawCtx);
      const userId = await ctx.db.insert('users', { name: 'Malformed owner' });
      await ctx.db.insert('profiles', {
        user_id: userId,
        username: 'Malformed',
        avatar_url: null,
        account_state: 'active',
        slug: 'malformed',
        created_at: at(1),
        updated_at: at(1),
      });
      await ctx.db.insert('factions', {
        owner_id: userId,
        data: {},
        slug: 'broken',
        created_at: at(1),
        updated_at: at(1),
        is_deleted: false,
        group_id: null,
      });
    });

    await t.run(syncSeededFactionCards);
    await expect(t.query(api.profiles.pageBySlug, { slug: 'malformed' })).rejects.toThrow();
  });

  test('questions asked are newest-first and carry their ruleset link data', async () => {
    const t = applicationTest();
    const seed = await seedProfileDetail(t);

    const page = await t.query(api.profiles.pageBySlug, { slug: 'central' });

    expect(page.faqAsked.map((item) => item._id)).toEqual([seed.lateQuestionId, seed.earlyQuestionId]);
    expect(page.faqAsked[0]?.ruleset).toEqual({
      id: seed.advancedRulesetId,
      name: 'Advanced',
      slug: 'advanced',
      coverThumbUrl: null,
    });
  });

  test('answers given are newest-first with parent question, asker, and ruleset link data', async () => {
    const t = applicationTest();
    const seed = await seedProfileDetail(t);

    const page = await t.query(api.profiles.pageBySlug, { slug: 'central' });

    expect(page.faqAnswers.map((answer) => answer._id)).toEqual([seed.otherAnswerId, seed.acceptedAnswerId]);
    const accepted = page.faqAnswers.find((answer) => answer._id === seed.acceptedAnswerId);
    expect(accepted?.faq_item).toMatchObject({
      slug: '3',
      question: 'How does spice work?',
      accepted_answer_id: seed.acceptedAnswerId,
    });
    expect(accepted?.asker_profile).toMatchObject({
      id: seed.askerProfileId,
      slug: 'asker',
      username: 'Asker',
    });
    expect(accepted?.ruleset).toMatchObject({ slug: 'advanced', name: 'Advanced' });
  });

  test('both lists use the accepted reply and live references, even when another person answered', async () => {
    const t = applicationTest();
    const seed = await seedProfileDetail(t);
    const acceptedId = await t.run(async (ctx) => {
      const asker = await ctx.db.get(seed.askerProfileId);
      const ownAnswer = await ctx.db.get(seed.acceptedAnswerId);
      const id = await ctx.db.insert('faq_answers', {
        faq_item_id: ownAnswer!.faq_item_id,
        answer: '**Accepted** explanation from another contributor.',
        answered_by: asker!.user_id,
        created_at: at(10),
      });
      await ctx.db.patch(ownAnswer!.faq_item_id, { accepted_answer_id: id });
      await ctx.db.insert('faq_answers', {
        faq_item_id: ownAnswer!.faq_item_id,
        answer: 'A second contribution to the same question.',
        answered_by: seed.userId,
        created_at: at(11),
      });
      await ctx.db.insert('faq_references', {
        faq_item_id: ownAnswer!.faq_item_id,
        kind: 'faction',
        target_id: seed.activeFactionId,
        question_created_at: at(6),
      });
      await ctx.db.insert('faq_answers', {
        faq_item_id: seed.lateQuestionId,
        answer: 'An answer to the profile owner’s question.',
        answered_by: asker!.user_id,
        created_at: at(10),
      });
      return id;
    });
    const page = await t.query(api.profiles.pageBySlug, { slug: 'central' });
    expect(page.faqLists.asked.items.map((item) => item._id)).toEqual([seed.lateQuestionId, seed.earlyQuestionId]);
    expect(page.faqLists.asked.items[0]?.list_details.answerers).toEqual([expect.objectContaining({ slug: 'asker' })]);
    expect(page.faqLists.answered.items.map((item) => item.slug)).toEqual(['4', '3']);
    const answered = page.faqLists.answered.items[1]!;
    expect(answered.accepted_answer_id).toBe(acceptedId);
    expect(answered.list_details).toMatchObject({
      accepted_answer: { excerpt: 'Accepted explanation from another contributor.' },
      answerers: [{ slug: 'asker' }],
      references: [{ kind: 'faction', slug: 'atreides', name: 'Atreides' }],
    });
    expect(answered.faq_answers).toHaveLength(3);
    expect(answered.ruleset).toEqual({ id: seed.advancedRulesetId, slug: 'advanced', name: 'Advanced' });
    expect(page.faqAnswers).toHaveLength(3);
  });

  test('pages the shared lists independently and clamps invalid pages', async () => {
    const t = applicationTest();
    const seed = await seedProfileDetail(t);
    await t.run(async (ctx) => {
      for (let index = 0; index < PROFILE_FAQ_PAGE_SIZE; index++) {
        const id = await ctx.db.insert('faq_items', {
          ruleset_id: seed.advancedRulesetId,
          slug: `extra-${index}`,
          question: `Question ${index}?`,
          asked_by: seed.userId,
          created_at: at(12),
          updated_at: at(12),
          accepted_answer_id: null,
        });
        await ctx.db.insert('faq_answers', {
          faq_item_id: id,
          answer: 'Contribution.',
          answered_by: seed.userId,
          created_at: at(12),
        });
      }
    });
    const first = await t.query(api.profiles.pageBySlug, { slug: 'central' });
    expect(first.faqLists.asked.items).toHaveLength(PROFILE_FAQ_PAGE_SIZE);
    expect(first.faqLists.answered.items).toHaveLength(PROFILE_FAQ_PAGE_SIZE);
    const next = await t.query(api.profiles.pageBySlug, { slug: 'central', askedPage: 2 });
    expect(next.faqLists.asked).toMatchObject({ page: 2, pageCount: 2 });
    expect(next.faqLists.asked.items.map((item) => item._id)).toEqual([seed.lateQuestionId, seed.earlyQuestionId]);
    expect(next.faqLists.answered).toEqual(first.faqLists.answered);
    const last = await t.query(api.profiles.pageBySlug, { slug: 'central', askedPage: 999, answeredPage: -2 });
    expect(last.faqLists).toEqual(next.faqLists);
    expect(last.faqAsked).toHaveLength(PROFILE_FAQ_PAGE_SIZE + 2);
    expect(last.faqAnswers).toHaveLength(PROFILE_FAQ_PAGE_SIZE + 2);
  });

  test('questions and answers under a soft-deleted ruleset leave the profile with it', async () => {
    const t = applicationTest();
    const seed = await seedProfileDetail(t);
    await t.run(async (ctx) => await ctx.db.patch(seed.advancedRulesetId, { is_deleted: true }));

    const page = await t.query(api.profiles.pageBySlug, { slug: 'central' });

    expect(page.faqAsked).toEqual([]);
    expect(page.faqAnswers).toEqual([]);
    expect(page.faqLists.asked.items).toEqual([]);
    expect(page.faqLists.answered.items).toEqual([]);
  });

  test('a missing asker profile yields a null summary without corrupting other activity', async () => {
    const t = applicationTest();
    const seed = await seedProfileDetail(t);

    const page = await t.query(api.profiles.pageBySlug, { slug: 'central' });

    const orphan = page.faqAnswers.find((answer) => answer._id === seed.otherAnswerId);
    expect(orphan?.asker_profile).toBeNull();
    expect(orphan?.faq_item.accepted_answer_id).toBeNull();
    expect(page.faqAnswers).toHaveLength(2);
  });

  test('is the same answer for every viewer, the profile owner included', async () => {
    const t = applicationTest();
    const seed = await seedProfileDetail(t);
    const strangerId = await t.run(async (ctx) => await ctx.db.insert('users', { name: 'Stranger' }));

    const anonymous = await t.query(api.profiles.pageBySlug, { slug: 'central' });
    for (const userId of [seed.userId, strangerId]) {
      expect(await t.withIdentity({ subject: userId }).query(api.profiles.pageBySlug, { slug: 'central' })).toEqual(
        anonymous
      );
    }
    expect(anonymous).not.toHaveProperty('account');
  });
});
