/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { describe, expect, test } from 'vite-plus/test';

import { assetPublishingFaction } from '../src/shared/factions/fixtures/assetPublishingFaction';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { applicationTest } from './application.test.fixture';
import { applicationTriggers } from './lib/applicationTriggers';
import { GROUP_STANDINGS_STEP, LEADERBOARD_SIZE, rankByCount } from './lib/standings';

const now = '2026-11-08T00:00:00.000Z';

type World = ReturnType<typeof applicationTest>;

/** A person with a public profile, unless `state` says otherwise. */
async function person(t: World, name: string, state: 'active' | 'deleted' = 'active') {
  return await t.run(async (rawCtx) => {
    const ctx = applicationTriggers.wrapDB(rawCtx);
    const userId = await ctx.db.insert('users', {});
    await ctx.db.insert('profiles', {
      user_id: userId,
      username: name,
      avatar_url: null,
      account_state: state,
      slug: name.toLowerCase(),
      created_at: now,
      updated_at: now,
    });
    return userId;
  });
}

/** Factions written through the triggers, as every real save is. */
async function factions(t: World, ownerId: Id<'users'>, count: number, groupId: Id<'groups'> | null = null) {
  return await t.run(async (rawCtx) => {
    const ctx = applicationTriggers.wrapDB(rawCtx);
    const ids: Id<'factions'>[] = [];
    for (let index = 0; index < count; index += 1) {
      const slug = `${ownerId}-${groupId ?? 'own'}-${index}`;
      ids.push(
        await ctx.db.insert('factions', {
          owner_id: ownerId,
          data: { ...assetPublishingFaction, name: slug },
          slug,
          created_at: now,
          updated_at: now,
          is_deleted: false,
          group_id: groupId,
        })
      );
    }
    return ids;
  });
}

async function question(t: World, askedBy: Id<'users'>, answeredBy?: Id<'users'>) {
  await t.run(async (rawCtx) => {
    const ctx = applicationTriggers.wrapDB(rawCtx);
    const rulesetId = await ctx.db.insert('rulesets', {
      name: `Rules ${askedBy}`,
      slug: `rules-${askedBy}-${Math.random().toString(36).slice(2)}`,
      about: 'A ruleset long enough to hold rules questions for the standings test.',
      created_at: now,
      updated_at: now,
      owner_id: askedBy,
      group_id: null,
      is_deleted: false,
      image_cover: null,
    });
    const questionId = await ctx.db.insert('faq_items', {
      ruleset_id: rulesetId,
      slug: '1',
      question: 'Does the storm move first?',
      asked_by: askedBy,
      created_at: now,
      updated_at: now,
      accepted_answer_id: null,
    });
    if (answeredBy) {
      await ctx.db.insert('faq_answers', {
        faq_item_id: questionId,
        answer: 'Yes, at the start of the storm phase.',
        answered_by: answeredBy,
        created_at: now,
      });
    }
  });
}

async function group(t: World, name: string, ownerId: Id<'users'>, members: Id<'users'>[]) {
  return await t.run(async (rawCtx) => {
    const ctx = applicationTriggers.wrapDB(rawCtx);
    const groupId = await ctx.db.insert('groups', {
      name,
      slug: name.toLowerCase(),
      created_at: now,
      created_by: ownerId,
      is_deleted: false,
    });
    for (const userId of members) {
      await ctx.db.insert('group_members', {
        group_id: groupId,
        user_id: userId,
        status: 'active',
        requested_at: now,
        approved_at: now,
        approved_by: ownerId,
      });
    }
    return groupId;
  });
}

describe('leaderboards', () => {
  test('rank people by factions, with ties sharing a place and nobody at zero', async () => {
    const t = applicationTest();
    const central = await person(t, 'Central');
    const ridwan = await person(t, 'Ridwan');
    const amon = await person(t, 'Amon');
    await person(t, 'Quiet');
    await factions(t, central, 4);
    await factions(t, ridwan, 2);
    await factions(t, amon, 2);

    const boards = await t.query(api.profiles.directoryHighlights, {});
    expect(boards.factionDesigners.map(({ name, rank, count }) => [rank, name, count])).toEqual([
      [1, 'Central', 4],
      [2, 'Amon', 2],
      [2, 'Ridwan', 2],
    ]);
    expect(boards.faqContributors).toEqual([]);
  });

  test('count questions asked and answers given together, and leave hidden profiles off', async () => {
    const t = applicationTest();
    const asker = await person(t, 'Asker');
    const helper = await person(t, 'Helper');
    const gone = await person(t, 'Gone', 'deleted');
    await question(t, asker, helper);
    await question(t, helper, asker);
    await question(t, asker);
    await question(t, gone, gone);

    const boards = await t.query(api.profiles.directoryHighlights, {});
    expect(boards.faqContributors.map(({ name, count }) => [name, count])).toEqual([
      ['Asker', 3],
      ['Helper', 2],
    ]);
  });

  test('stop at five people', async () => {
    const t = applicationTest();
    for (let index = 0; index < LEADERBOARD_SIZE + 2; index += 1) {
      await factions(t, await person(t, `Maker${index}`), index + 1);
    }
    const boards = await t.query(api.profiles.directoryHighlights, {});
    expect(boards.factionDesigners).toHaveLength(LEADERBOARD_SIZE);
    expect(boards.factionDesigners[0]?.name).toBe(`Maker${LEADERBOARD_SIZE + 1}`);
  });

  test('order a tie across the fifth place A-Z over everyone in it', async () => {
    const t = applicationTest();
    for (const name of ['Zed', 'Yan', 'Xia', 'Wes', 'Val', 'Uma', 'Abe']) {
      await factions(t, await person(t, name), 1);
    }
    const boards = await t.query(api.profiles.directoryHighlights, {});
    expect(boards.factionDesigners.map(({ name, rank }) => [rank, name])).toEqual([
      [1, 'Abe'],
      [1, 'Uma'],
      [1, 'Val'],
      [1, 'Wes'],
      [1, 'Xia'],
    ]);
  });

  test('drop a person whose profile is deleted', async () => {
    const t = applicationTest();
    const maker = await person(t, 'Maker');
    await factions(t, maker, 2);
    await t.run(async (rawCtx) => {
      const ctx = applicationTriggers.wrapDB(rawCtx);
      const profile = await ctx.db
        .query('profiles')
        .withIndex('by_user_id', (q) => q.eq('user_id', maker))
        .unique();
      await ctx.db.patch(profile!._id, { account_state: 'deleted' });
    });
    expect(await t.run(async (ctx) => await ctx.db.query('profile_standings').collect())).toEqual([]);
  });

  test('drop a person whose last faction is deleted', async () => {
    const t = applicationTest();
    const maker = await person(t, 'Maker');
    const [factionId] = await factions(t, maker, 1);
    await t.run(async (rawCtx) => {
      await applicationTriggers.wrapDB(rawCtx).db.patch(factionId!, { is_deleted: true });
    });
    const boards = await t.query(api.profiles.directoryHighlights, {});
    expect(boards.factionDesigners).toEqual([]);
  });
});

test('rankByCount gives tied counts one place and the next count the place after them', () => {
  const ranked = rankByCount(
    [
      { name: 'b', count: 3 },
      { name: 'a', count: 3 },
      { name: 'c', count: 1 },
    ],
    5
  );
  expect(ranked.map(({ name, rank }) => [rank, name])).toEqual([
    [1, 'a'],
    [1, 'b'],
    [3, 'c'],
  ]);
});

describe('group standings', () => {
  test('order Groups by members, then by what they maintain, and grow with a larger limit', async () => {
    const t = applicationTest();
    const owner = await person(t, 'Owner');
    const others = [await person(t, 'Two'), await person(t, 'Three')];
    await group(t, 'Big', owner, [owner, ...others]);
    const busy = await group(t, 'Busy', owner, [owner]);
    await group(t, 'Quiet', owner, [owner]);
    await factions(t, owner, 3, busy);
    for (let index = 0; index < GROUP_STANDINGS_STEP; index += 1) {
      await group(t, `Extra${index}`, owner, []);
    }

    const first = (await t.query(api.profiles.directoryHighlights, {})).groups;
    expect(first.entries.map(({ name }) => name).slice(0, 3)).toEqual(['Big', 'Busy', 'Quiet']);
    expect(first.entries[0]).toMatchObject({ rank: 1, memberCount: 3, factionCount: 0 });
    expect(first.entries[0]?.members.map(({ name }) => name)).toEqual(['Owner', 'Two', 'Three']);
    expect(first.entries[1]).toMatchObject({ rank: 2, memberCount: 1, factionCount: 3 });
    expect(first.entries).toHaveLength(GROUP_STANDINGS_STEP);
    expect(first.hasMore).toBe(true);

    const grown = (await t.query(api.profiles.directoryHighlights, { groupLimit: GROUP_STANDINGS_STEP * 2 })).groups;
    expect(grown.entries).toHaveLength(GROUP_STANDINGS_STEP + 3);
    expect(grown.hasMore).toBe(false);
  });

  test('leave a deleted Group off the list', async () => {
    const t = applicationTest();
    const owner = await person(t, 'Owner');
    const groupId = await group(t, 'Gone', owner, [owner]);
    await t.run(async (rawCtx) => {
      await applicationTriggers.wrapDB(rawCtx).db.patch(groupId, { is_deleted: true });
    });
    expect((await t.query(api.profiles.directoryHighlights, {})).groups.entries).toEqual([]);
  });
});

/** One person's row on the directory's first browsed page. */
async function directoryEntry(t: World, name: string) {
  const page = await t.query(api.profiles.catalogue, {});
  if ('mode' in page) {
    throw new Error('Expected a browsed page.');
  }
  return page.entries.find((entry) => entry.name === name);
}

test('the directory shows the Groups a person is an active member of, and counts those past the discs', async () => {
  const t = applicationTest();
  const owner = await person(t, 'Owner');
  await group(t, 'Dreamers', owner, [owner]);
  const entry = await directoryEntry(t, 'Owner');
  expect(entry?.groups).toEqual([{ slug: 'dreamers', name: 'Dreamers' }]);
  expect(entry?.moreGroups).toBe(0);

  for (let index = 0; index < 7; index += 1) {
    await group(t, `Sietch${index}`, owner, [owner]);
  }
  const grown = await directoryEntry(t, 'Owner');
  expect(grown?.groups).toHaveLength(6);
  expect(grown?.moreGroups).toBe(2);
});

test('the standings backfill rebuilds rows written past the triggers', async () => {
  const t = applicationTest();
  const owner = await person(t, 'Owner');
  await factions(t, owner, 2);
  await group(t, 'Dreamers', owner, [owner]);
  await t.run(async (ctx) => {
    for (const row of await ctx.db.query('profile_standings').collect()) {
      await ctx.db.delete(row._id);
    }
    for (const row of await ctx.db.query('group_standings').collect()) {
      await ctx.db.delete(row._id);
    }
  });
  expect((await t.query(api.profiles.directoryHighlights, {})).factionDesigners).toEqual([]);

  await t.mutation(internal.migrations.standings_profiles_v1, {});
  await t.mutation(internal.migrations.standings_groups_v1, {});
  await t.finishAllScheduledFunctions(() => undefined);

  expect((await t.query(api.profiles.directoryHighlights, {})).factionDesigners.map(({ name }) => name)).toEqual([
    'Owner',
  ]);
  expect((await t.query(api.profiles.directoryHighlights, {})).groups.entries.map(({ name }) => name)).toEqual([
    'Dreamers',
  ]);
});
