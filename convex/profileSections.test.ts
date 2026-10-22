/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import type { convexTest } from 'convex-test';
import { describe, expect, test } from 'vite-plus/test';

import { assetPublishingFaction } from '../src/shared/factions/fixtures/assetPublishingFaction';
import { PROFILE_ACTIVITY_PAGE_SIZE } from '../src/shared/profiles/catalogueSearch';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { applicationTest } from './application.test.fixture';
import { syncSeededFactionCards } from './factions.test.fixture';
import { applicationTriggers } from './lib/applicationTriggers';
import { PROFILE_FACTION_PREVIEW_SIZE, PROFILE_FAQ_PREVIEW_SIZE } from './lib/profileSections';
import type { MutationCtx } from './types';

const at = (day: number, hour = 0) =>
  `2026-07-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00.000Z`;

const ABOUT = 'A test ruleset with an About long enough to satisfy the fifty character floor.';

type Seed = {
  centralId: Id<'users'>;
  askerId: Id<'users'>;
  advancedRulesetId: Id<'rulesets'>;
  deletedRulesetId: Id<'rulesets'>;
  /** Central's live factions, oldest first. */
  factionIds: Id<'factions'>[];
  /** Central's questions, oldest first; the last was asked in the deleted ruleset. */
  questionIds: Id<'faq_items'>[];
  /** Central's answers, oldest first, each to one of the asker's questions. */
  answerIds: Id<'faq_answers'>[];
  /** The asker's questions, one per answer of Central's, in the same order. */
  askedIds: Id<'faq_items'>[];
};

async function insertProfile(ctx: MutationCtx, name: string, slug: string) {
  const userId = await ctx.db.insert('users', { name });
  await ctx.db.insert('profiles', {
    user_id: userId,
    username: name,
    avatar_url: null,
    account_state: 'active',
    slug,
    created_at: at(1),
    updated_at: at(1),
  });
  return userId;
}

async function insertRuleset(ctx: MutationCtx, ownerId: Id<'users'>, slug: string, deleted = false) {
  return await ctx.db.insert('rulesets', {
    name: slug[0]!.toUpperCase() + slug.slice(1),
    about: ABOUT,
    slug,
    created_at: at(1),
    updated_at: at(1),
    owner_id: ownerId,
    group_id: null,
    is_deleted: deleted,
    image_cover: null,
  });
}

async function insertFaction(ctx: MutationCtx, ownerId: Id<'users'>, name: string, day: number, deleted = false) {
  return await ctx.db.insert('factions', {
    owner_id: ownerId,
    data: { ...assetPublishingFaction, name },
    slug: name.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-'),
    created_at: at(day),
    updated_at: at(day),
    is_deleted: deleted,
    group_id: null,
  });
}

async function insertQuestion(
  ctx: MutationCtx,
  rulesetId: Id<'rulesets'>,
  askedBy: Id<'users'>,
  slug: string,
  day: number,
  hour = 0
) {
  return await ctx.db.insert('faq_items', {
    ruleset_id: rulesetId,
    slug,
    question: `Question ${slug}?`,
    asked_by: askedBy,
    created_at: at(day, hour),
    updated_at: at(day, hour),
    accepted_answer_id: null,
  });
}

/**
 * A member with more of everything than the profile shows: five live factions and a deleted one, six questions and one in a deleted ruleset, seven answers of which two were picked.
 * Written through the application's triggers, as every deployed writer does, so the catalogue lists are maintained exactly as in production.
 */
async function seedProfile(t: ReturnType<typeof convexTest>): Promise<Seed> {
  const seed = await t.run(async (rawCtx) => {
    const ctx = applicationTriggers.wrapDB(rawCtx);
    const centralId = await insertProfile(ctx, 'Central', 'central');
    const askerId = await insertProfile(ctx, 'Asker', 'asker');
    const otherId = await insertProfile(ctx, 'Other', 'other');
    const advancedRulesetId = await insertRuleset(ctx, centralId, 'advanced');
    const deletedRulesetId = await insertRuleset(ctx, centralId, 'deleted', true);

    const factionIds: Id<'factions'>[] = [];
    for (let index = 1; index <= 5; index++) {
      factionIds.push(await insertFaction(ctx, centralId, `Faction ${index}`, index));
    }
    await insertFaction(ctx, centralId, 'Gone faction', 6, true);
    await insertFaction(ctx, otherId, 'Other faction', 7);
    await ctx.db.insert('ruleset_factions', { ruleset_id: advancedRulesetId, faction_id: factionIds[0]! });

    const questionIds: Id<'faq_items'>[] = [];
    for (let index = 1; index <= 5; index++) {
      questionIds.push(await insertQuestion(ctx, advancedRulesetId, centralId, `central-${index}`, 10, index));
    }
    questionIds.push(await insertQuestion(ctx, deletedRulesetId, centralId, 'central-gone', 10, 6));

    const askedIds: Id<'faq_items'>[] = [];
    const answerIds: Id<'faq_answers'>[] = [];
    for (let index = 1; index <= 7; index++) {
      const askedId = await insertQuestion(ctx, advancedRulesetId, askerId, `asked-${index}`, 11, index);
      askedIds.push(askedId);
      const answerId = await ctx.db.insert('faq_answers', {
        faq_item_id: askedId,
        answer: `Answer ${index}.`,
        answered_by: centralId,
        created_at: at(12, index),
      });
      answerIds.push(answerId);
      if (index <= 2) {
        await ctx.db.patch('faq_items', askedId, { accepted_answer_id: answerId });
      }
    }
    return { centralId, askerId, advancedRulesetId, deletedRulesetId, factionIds, questionIds, answerIds, askedIds };
  });
  await t.run(syncSeededFactionCards);
  return seed;
}

describe('the profile page (api.profileSections.page)', () => {
  test('answers null for a slug no public profile holds', async () => {
    const t = applicationTest();
    await seedProfile(t);
    expect(await t.query(api.profileSections.page, { slug: 'nobody' })).toBeNull();
  });

  test('shows the newest few of each list and counts the whole list', async () => {
    const t = applicationTest();
    const seed = await seedProfile(t);

    const page = (await t.query(api.profileSections.page, { slug: 'central' }))!;

    expect(page.factionCount).toBe(5);
    expect(page.factionPreview.map((faction) => faction._id)).toEqual(
      seed.factionIds.toReversed().slice(0, PROFILE_FACTION_PREVIEW_SIZE)
    );
    expect(page.factionPreview[0]?.data.name).toBe('Faction 5');

    expect(page.answerCount).toBe(7);
    expect(page.pickedAnswerCount).toBe(2);
    expect(page.answerPreview.map((answer) => answer._id)).toEqual(
      seed.answerIds.toReversed().slice(0, PROFILE_FAQ_PREVIEW_SIZE)
    );
    expect(page.answerPreview[0]?.asker_profile?.slug).toBe('asker');

    /* The newest question is in the deleted ruleset: counted, as the list is the aggregate's, but dropped at projection, so the slice comes up one short. */
    expect(page.questionCount).toBe(6);
    expect(page.questionPreview.map((question) => question._id)).toEqual(
      seed.questionIds.toReversed().slice(1, PROFILE_FAQ_PREVIEW_SIZE)
    );
  });

  test('the picked count follows the question that picks, through the triggers', async () => {
    const t = applicationTest();
    const seed = await seedProfile(t);

    await t.run(async (rawCtx) => {
      const ctx = applicationTriggers.wrapDB(rawCtx);
      await ctx.db.patch('faq_items', seed.askedIds[0]!, { accepted_answer_id: null });
      await ctx.db.patch('faq_items', seed.askedIds[6]!, { accepted_answer_id: seed.answerIds[6]! });
      await ctx.db.patch('faq_items', seed.askedIds[5]!, { accepted_answer_id: seed.answerIds[5]! });
    });
    expect((await t.query(api.profileSections.page, { slug: 'central' }))!.pickedAnswerCount).toBe(3);

    await t.run(async (rawCtx) => {
      await applicationTriggers.wrapDB(rawCtx).db.delete('faq_answers', seed.answerIds[6]!);
    });
    const page = (await t.query(api.profileSections.page, { slug: 'central' }))!;
    expect(page.answerCount).toBe(6);
    expect(page.pickedAnswerCount).toBe(2);

    const drift = await t.query(internal.catalogueMaintenance.catalogueDrift, { kind: 'answer' });
    expect(drift).toMatchObject({ missing: [], stale: [], duplicated: [], unordered: [], orphaned: [] });
  });

  test("a deleted question takes its answers out of the answerer's lists", async () => {
    const t = applicationTest();
    const seed = await seedProfile(t);

    await t.run(async (rawCtx) => {
      const ctx = applicationTriggers.wrapDB(rawCtx);
      await ctx.db.delete('faq_answers', seed.answerIds[0]!);
      await ctx.db.delete('faq_items', seed.askedIds[0]!);
    });

    const page = (await t.query(api.profileSections.page, { slug: 'central' }))!;
    expect(page.answerCount).toBe(6);
    expect(page.pickedAnswerCount).toBe(1);
  });
});

describe('the paged lists (api.profileSections.answers, api.profileSections.questions)', () => {
  test('answer null for a slug no public profile holds', async () => {
    const t = applicationTest();
    await seedProfile(t);
    expect(await t.query(api.profileSections.answers, { slug: 'nobody' })).toBeNull();
    expect(await t.query(api.profileSections.questions, { slug: 'nobody' })).toBeNull();
  });

  test('one page holds every answer while they fit, newest first, with the counts the pager draws', async () => {
    const t = applicationTest();
    const seed = await seedProfile(t);

    const page = (await t.query(api.profileSections.answers, { slug: 'central' }))!;

    expect(page.profile).toMatchObject({ slug: 'central', username: 'Central' });
    expect(page.items.map((answer) => answer._id)).toEqual(seed.answerIds.toReversed());
    expect(page).toMatchObject({
      total: 7,
      complete: true,
      page: 1,
      pageCount: 1,
      pageSize: PROFILE_ACTIVITY_PAGE_SIZE,
    });
    expect(page.items[6]?.faq_item.accepted_answer_id).toBe(seed.answerIds[0]);
  });

  test('questions page past the first, and a page past the end answers with no rows and where they end', async () => {
    const t = applicationTest();
    const seed = await seedProfile(t);
    await t.run(async (rawCtx) => {
      const ctx = applicationTriggers.wrapDB(rawCtx);
      for (let index = 1; index <= PROFILE_ACTIVITY_PAGE_SIZE; index++) {
        await insertQuestion(ctx, seed.advancedRulesetId, seed.centralId, `more-${index}`, 20, index % 24);
      }
    });

    const first = (await t.query(api.profileSections.questions, { slug: 'central' }))!;
    expect(first.items).toHaveLength(PROFILE_ACTIVITY_PAGE_SIZE);
    expect(first).toMatchObject({ total: 30, page: 1, pageCount: 2 });

    const second = (await t.query(api.profileSections.questions, { slug: 'central', page: 2 }))!;
    /* The six oldest questions, one of them in the deleted ruleset and dropped, so the page comes up a row short. */
    expect(second.items.map((question) => question._id)).toEqual(seed.questionIds.toReversed().slice(1));
    expect(second).toMatchObject({ total: 30, page: 2, pageCount: 2 });

    const past = (await t.query(api.profileSections.questions, { slug: 'central', page: 3 }))!;
    expect(past.items).toEqual([]);
    expect(past).toMatchObject({ total: 30, page: 3, pageCount: 2 });
  });
});

describe("the faction catalogue's member filter (api.factions.catalogue owner)", () => {
  test('narrows the catalogue to the member and names them; an unknown member narrows nothing', async () => {
    const t = applicationTest();
    const seed = await seedProfile(t);

    const narrowed = await t.query(api.factions.catalogue, { owner: 'central', sort: 'created' });
    expect('mode' in narrowed).toBe(false);
    expect(narrowed.owner).toEqual({ slug: 'central', name: 'Central' });
    expect(narrowed.cards.map((card) => card._id)).toEqual(seed.factionIds.toReversed());
    expect(narrowed).toMatchObject({ total: 5, catalogueTotal: 6 });

    const unknown = await t.query(api.factions.catalogue, { owner: 'nobody' });
    expect(unknown.owner).toBeNull();
    expect(unknown).toMatchObject({ total: 6 });
  });

  test("the member's list wins over a ruleset beside it, as a list is one partition", async () => {
    const t = applicationTest();
    await seedProfile(t);

    const page = await t.query(api.factions.catalogue, { owner: 'central', ruleset: 'advanced' });
    expect(page).toMatchObject({ total: 5, owner: { slug: 'central' } });

    const byRuleset = await t.query(api.factions.catalogue, { ruleset: 'advanced' });
    expect(byRuleset).toMatchObject({ total: 1, owner: null });
  });

  test("a search within the member's list matches only their factions", async () => {
    const t = applicationTest();
    await seedProfile(t);

    const searched = await t.query(api.factions.catalogue, { owner: 'other', q: 'faction', limit: 24 });
    expect('mode' in searched).toBe(true);
    expect(searched.cards.map((card) => card.data.name)).toEqual(['Other faction']);
    expect(searched.owner).toEqual({ slug: 'other', name: 'Other' });
  });
});

describe('the backfills behind the profile lists', () => {
  /** Rows written before the lists existed: through the raw database, so no trigger lists them. */
  async function seedUnlisted(t: ReturnType<typeof convexTest>) {
    const seed = await t.run(async (ctx) => {
      const centralId = await insertProfile(ctx, 'Central', 'central');
      const rulesetId = await insertRuleset(ctx, centralId, 'advanced');
      const factionId = await insertFaction(ctx, centralId, 'Old faction', 1);
      const questionId = await insertQuestion(ctx, rulesetId, centralId, 'old', 2);
      const answerId = await ctx.db.insert('faq_answers', {
        faq_item_id: questionId,
        answer: 'An old answer.',
        answered_by: centralId,
        created_at: at(3),
      });
      await ctx.db.patch('faq_items', questionId, { accepted_answer_id: answerId });
      return { factionId, questionId, answerId };
    });
    await t.run(syncSeededFactionCards);
    return seed;
  }

  const ids = [
    'catalogue_entries_factions_owner_v1',
    'catalogue_entries_factions_owner_verify_v1',
    'catalogue_entries_faq_asker_v1',
    'catalogue_entries_faq_asker_verify_v1',
    'catalogue_entries_answers_v1',
    'catalogue_entries_answers_verify_v1',
  ] as const;

  test('list what was written before them, verification refuses a gap first, and a replay changes nothing', async () => {
    const t = applicationTest();
    const seed = await seedUnlisted(t);
    const before = (await t.query(api.profileSections.page, { slug: 'central' }))!;
    expect(before).toMatchObject({ factionCount: 0, answerCount: 0, pickedAnswerCount: 0, questionCount: 0 });

    await t.mutation(internal.catalogueMigrations.catalogue_entries_answers_verify_v1, {});
    await t.finishAllScheduledFunctions(() => undefined);
    await expect(
      t.query(internal.migrations.assertReadyForNarrow, { required: ['catalogue_entries_answers_verify_v1'] })
    ).rejects.toThrow(/catalogue_entries_answers_verify_v1\(failed/);

    for (const id of ids) {
      await t.mutation(internal.catalogueMigrations[id], {});
      await t.finishAllScheduledFunctions(() => undefined);
    }
    await expect(t.query(internal.migrations.assertReadyForNarrow, { required: [...ids] })).resolves.toMatchObject({
      ok: true,
    });

    const after = (await t.query(api.profileSections.page, { slug: 'central' }))!;
    expect(after).toMatchObject({ factionCount: 1, answerCount: 1, pickedAnswerCount: 1, questionCount: 1 });
    expect(after.factionPreview.map((faction) => faction._id)).toEqual([seed.factionId]);
    expect(after.answerPreview.map((answer) => answer._id)).toEqual([seed.answerId]);
    expect(after.questionPreview.map((question) => question._id)).toEqual([seed.questionId]);

    /* Replay-safe: a second run finds every row listed and writes nothing new. */
    for (const id of ids) {
      await t.mutation(internal.catalogueMigrations[id], {});
      await t.finishAllScheduledFunctions(() => undefined);
    }
    expect(await t.query(api.profileSections.page, { slug: 'central' })).toEqual(after);
    for (const kind of ['faction', 'faq', 'answer'] as const) {
      const drift = await t.query(internal.catalogueMaintenance.catalogueDrift, { kind });
      expect(drift).toMatchObject({ missing: [], stale: [], duplicated: [], unordered: [], orphaned: [] });
    }
  });
});
