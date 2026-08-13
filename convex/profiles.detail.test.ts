/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';

import { assetPublishingFaction } from '../src/shared/factions/fixtures/assetPublishingFaction';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

type SeedResult = {
  userId: Id<'users'>;
  profileId: Id<'profiles'>;
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

async function seedProfileDetail(t: ReturnType<typeof convexTest>): Promise<SeedResult> {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert('users', { name: 'Central' });
    const askerId = await ctx.db.insert('users', { name: 'Asker' });
    const profilelessAskerId = await ctx.db.insert('users', { name: 'No profile' });

    const profileId = await ctx.db.insert('profiles', {
      user_id: userId,
      username: 'Central',
      avatar_url: null,
      slug: 'central',
      created_at: at(1),
      updated_at: at(1),
    });
    const askerProfileId = await ctx.db.insert('profiles', {
      user_id: askerId,
      username: 'Asker',
      avatar_url: null,
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
      profileId,
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
}

describe('profile detail projection (api.profiles.getBySlug)', () => {
  test('resolves the profile by public slug', async () => {
    const t = convexTest(schema, modules);
    const seed = await seedProfileDetail(t);

    const page = await t.query(api.profiles.getBySlug, { slug: 'central' });

    expect(page.profile._id).toBe(seed.profileId);
    expect(page.profile.slug).toBe('central');
  });

  test('throws for an unknown slug', async () => {
    const t = convexTest(schema, modules);
    await seedProfileDetail(t);

    await expect(t.query(api.profiles.getBySlug, { slug: 'missing' })).rejects.toThrow(/not found/);
  });

  test('only active memberships contribute to the public group list', async () => {
    const t = convexTest(schema, modules);
    const seed = await seedProfileDetail(t);

    const page = await t.query(api.profiles.getBySlug, { slug: 'central' });

    expect(page.groupSummaries).toEqual([
      { id: seed.activeGroupId, name: 'Sietch Tabr', slug: 'sietch-tabr' },
      { id: seed.laterGroupId, name: 'Arrakeen Guild', slug: 'arrakeen-guild' },
    ]);
  });

  test('group summaries keep membership order, not name order', async () => {
    const t = convexTest(schema, modules);
    const seed = await seedProfileDetail(t);

    const page = await t.query(api.profiles.getBySlug, { slug: 'central' });

    expect(page.groupSummaries.map((group) => group.id)).toEqual([
      seed.activeGroupId,
      seed.laterGroupId,
    ]);
  });

  test('an active membership whose group no longer resolves is dropped from the summaries', async () => {
    const t = convexTest(schema, modules);
    await seedProfileDetail(t);

    const page = await t.query(api.profiles.getBySlug, { slug: 'central' });

    expect(page.groupSummaries.map((group) => group.name)).not.toContain('Ghost Sietch');
    expect(page.groupSummaries).toHaveLength(2);
  });

  test('excludes soft-deleted factions and parses faction data', async () => {
    const t = convexTest(schema, modules);
    const seed = await seedProfileDetail(t);

    const page = await t.query(api.profiles.getBySlug, { slug: 'central' });

    expect(page.factions.map((faction) => faction._id)).toEqual([seed.activeFactionId]);
    expect(page.factions[0]?.data.name).toBe('Atreides');
  });

  test('faction ruleset enrichment keeps only active rulesets in deterministic name order', async () => {
    const t = convexTest(schema, modules);
    const seed = await seedProfileDetail(t);

    const page = await t.query(api.profiles.getBySlug, { slug: 'central' });

    expect(page.factions[0]?.rulesets.map((ruleset) => ruleset.name)).toEqual([
      'Advanced',
      'Basic',
    ]);
    expect(page.factions[0]?.rulesets.map((ruleset) => ruleset.id)).toEqual([
      seed.advancedRulesetId,
      seed.basicRulesetId,
    ]);
  });

  test('throws on malformed faction data at the query boundary', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const userId = await ctx.db.insert('users', { name: 'Malformed owner' });
      await ctx.db.insert('profiles', {
        user_id: userId,
        username: 'Malformed',
        avatar_url: null,
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

    await expect(t.query(api.profiles.getBySlug, { slug: 'malformed' })).rejects.toThrow();
  });

  test('questions asked are newest-first and carry their ruleset link data', async () => {
    const t = convexTest(schema, modules);
    const seed = await seedProfileDetail(t);

    const page = await t.query(api.profiles.getBySlug, { slug: 'central' });

    expect(page.faqAsked.map((item) => item._id)).toEqual([
      seed.lateQuestionId,
      seed.earlyQuestionId,
    ]);
    expect(page.faqAsked[0]?.ruleset).toEqual({
      id: seed.advancedRulesetId,
      name: 'Advanced',
      slug: 'advanced',
    });
  });

  test('answers given are newest-first with parent question, asker, and ruleset link data', async () => {
    const t = convexTest(schema, modules);
    const seed = await seedProfileDetail(t);

    const page = await t.query(api.profiles.getBySlug, { slug: 'central' });

    expect(page.faqAnswers.map((answer) => answer._id)).toEqual([
      seed.otherAnswerId,
      seed.acceptedAnswerId,
    ]);
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

  test('a missing asker profile yields a null summary without corrupting other activity', async () => {
    const t = convexTest(schema, modules);
    const seed = await seedProfileDetail(t);

    const page = await t.query(api.profiles.getBySlug, { slug: 'central' });

    const orphan = page.faqAnswers.find((answer) => answer._id === seed.otherAnswerId);
    expect(orphan?.asker_profile).toBeNull();
    expect(orphan?.faq_item.accepted_answer_id).toBeNull();
    expect(page.faqAnswers).toHaveLength(2);
  });
});
