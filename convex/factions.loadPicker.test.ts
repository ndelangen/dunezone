/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { expect, test } from 'vite-plus/test';

import { assetPublishingFaction } from '../src/shared/factions/fixtures/assetPublishingFaction';
import { api } from './_generated/api';
import { factionTest } from './factions.test.fixture';
import { applicationTriggers } from './lib/applicationTriggers';

const STAMP = '2026-09-28T00:00:00.000Z';

test('the load picker neither names a deleted Group nor counts its memberships', async () => {
  const t = factionTest();
  const viewerId = await t.run(async (rawCtx) => {
    const ctx = applicationTriggers.wrapDB(rawCtx);
    const userId = await ctx.db.insert('users', { name: 'Member' });
    await ctx.db.insert('profiles', {
      user_id: userId,
      username: 'Member',
      avatar_url: null,
      account_state: 'active',
      slug: 'member',
      created_at: STAMP,
      updated_at: STAMP,
    });
    for (const [slug, isDeleted] of [
      ['live-group', false],
      ['deleted-group', true],
    ] as const) {
      const groupId = await ctx.db.insert('groups', {
        name: slug,
        slug,
        created_at: STAMP,
        created_by: userId,
        is_deleted: isDeleted,
      });
      await ctx.db.insert('group_members', {
        group_id: groupId,
        user_id: userId,
        status: 'active',
        requested_at: STAMP,
        approved_at: STAMP,
        approved_by: userId,
      });
      await ctx.db.insert('factions', {
        owner_id: userId,
        data: { ...assetPublishingFaction, name: slug },
        slug,
        created_at: STAMP,
        updated_at: STAMP,
        is_deleted: false,
        group_id: groupId,
      });
    }
    return userId;
  });
  const picker = await t.withIdentity({ subject: viewerId }).query(api.factions.listForLoadPicker, {});
  const live = picker.rows.find((row) => row.slug === 'live-group')!;
  expect(live).toMatchObject({ groupLabel: 'live-group' });
  expect(picker.rows.find((row) => row.slug === 'deleted-group')).toMatchObject({
    groupId: null,
    groupLabel: 'No group',
  });
  expect(picker.memberGroupIds).toEqual([live.groupId]);
});

test('the load picker does not name the owner of a deleted account', async () => {
  const t = factionTest();
  const viewerId = await t.run(async (rawCtx) => {
    const ctx = applicationTriggers.wrapDB(rawCtx);
    const profile = (userId: Awaited<ReturnType<typeof ctx.db.insert<'users'>>>, username: string, deleted: boolean) =>
      ctx.db.insert('profiles', {
        user_id: userId,
        username,
        avatar_url: null,
        account_state: deleted ? 'deleted' : 'active',
        slug: username.toLowerCase(),
        created_at: STAMP,
        updated_at: STAMP,
      });
    const viewer = await ctx.db.insert('users', { name: 'Viewer' });
    await profile(viewer, 'Viewer', false);
    for (const [username, deleted] of [
      ['Present', false],
      ['Departed', true],
    ] as const) {
      const owner = await ctx.db.insert('users', { name: username });
      await profile(owner, username, deleted);
      await ctx.db.insert('factions', {
        owner_id: owner,
        data: { ...assetPublishingFaction, name: username },
        slug: username.toLowerCase(),
        created_at: STAMP,
        updated_at: STAMP,
        is_deleted: false,
        group_id: null,
      });
    }
    return viewer;
  });
  const picker = await t.withIdentity({ subject: viewerId }).query(api.factions.listForLoadPicker, {});
  expect(picker.rows.find((row) => row.slug === 'present')).toMatchObject({ ownerUsername: 'Present' });
  expect(picker.rows.find((row) => row.slug === 'departed')).toMatchObject({ ownerUsername: null });
});
