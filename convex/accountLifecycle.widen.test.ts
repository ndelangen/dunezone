/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import aggregateTest from '@convex-dev/aggregate/test';
import migrationsTest from '@convex-dev/migrations/test';
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';

import { assetPublishingFaction } from '../src/shared/factions/fixtures/assetPublishingFaction';
import { api, internal } from './_generated/api';
import { applicationTriggers } from './lib/applicationTriggers';
import { DIRECT_OWNERSHIP_KINDS } from './lib/directOwnership';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const now = '2026-08-20T00:00:00.000Z';

function setup() {
  const t = convexTest(schema, modules);
  migrationsTest.register(t);
  aggregateTest.register(t, 'statistics');
  aggregateTest.register(t, 'profileDiscovery');
  aggregateTest.register(t, 'profileActivity');
  return t;
}

describe('account lifecycle widen rollout', () => {
  test('backfills legacy profile and user state, then verifies the pair', async () => {
    const t = setup();
    const ids = await t.run(async (ctx) => {
      const userId = await ctx.db.insert('users', {});
      const profileId = await ctx.db.insert('profiles', {
        user_id: userId,
        username: 'LegacyUser',
        avatar_url: 'https://example.com/avatar.png',
        slug: 'legacy-user',
        created_at: now,
        updated_at: now,
      });
      return { userId, profileId };
    });

    await t.mutation(internal.migrations.account_lifecycle_profiles_v1, {});
    await t.mutation(internal.migrations.account_lifecycle_verify_v1, {});

    await t.run(async (ctx) => {
      await expect(ctx.db.get('users', ids.userId)).resolves.toMatchObject({
        account_state: 'active',
      });
      await expect(ctx.db.get('profiles', ids.profileId)).resolves.toMatchObject({ account_state: 'active' });
    });
  });

  test('verification fails closed when an auth user has no profile', async () => {
    const t = setup();
    await t.run(async (ctx) => {
      await ctx.db.insert('users', { account_state: 'active' });
    });

    await expect(t.mutation(internal.migrations.account_lifecycle_verify_v1, {})).resolves.toMatchObject({
      Status: expect.stringMatching(/expected exactly one/),
    });
  });

  test('pending sessions are denied and pending profiles leave public discovery', async () => {
    const t = setup();
    const ids = await t.run(async (rawCtx) => {
      const ctx = applicationTriggers.wrapDB(rawCtx);
      const userId = await ctx.db.insert('users', {
        account_state: 'deletion_pending',
      });
      const profileId = await ctx.db.insert('profiles', {
        user_id: userId,
        username: 'PendingUser',
        avatar_url: 'https://example.com/avatar.png',
        account_state: 'deletion_pending',
        slug: 'pending-user',
        created_at: now,
        updated_at: now,
      });
      return { userId, profileId };
    });

    const pending = t.withIdentity({ subject: ids.userId });
    await expect(pending.query(api.profiles.currentUserId, {})).resolves.toBeNull();
    await expect(pending.mutation(api.profiles.bootstrapCurrent, {})).rejects.toThrow(/Not authenticated/);
    await expect(t.query(api.profiles.getBySlug, { slug: 'pending-user' })).rejects.toThrow(/not found/);
    await expect(t.query(api.profiles.newestDiscoverable, {})).resolves.toEqual([]);
  });

  test('new profiles are active and ownership kinds stay explicit', async () => {
    const t = setup();
    const userId = await t.run(async (ctx) => await ctx.db.insert('users', {}));
    const active = t.withIdentity({ subject: userId });

    await active.mutation(api.profiles.bootstrapCurrent, {});

    await t.run(async (ctx) => {
      const profile = await ctx.db
        .query('profiles')
        .withIndex('by_user_id', (q) => q.eq('user_id', userId))
        .unique();
      expect(profile?.account_state).toBe('active');
    });
    expect(DIRECT_OWNERSHIP_KINDS.map((entry) => entry.kind)).toEqual(['group', 'faction', 'ruleset']);
  });

  test('inactive viewers are anonymous and inactive profiles stay out of public identity projections', async () => {
    const t = setup();
    const ids = await t.run(async (ctx) => {
      const ownerId = await ctx.db.insert('users', { account_state: 'active' });
      await ctx.db.insert('profiles', {
        user_id: ownerId,
        username: 'ActiveOwner',
        avatar_url: 'https://example.com/owner.png',
        account_state: 'active',
        slug: 'active-owner',
        created_at: now,
        updated_at: now,
      });
      const pendingId = await ctx.db.insert('users', { account_state: 'deletion_pending' });
      await ctx.db.insert('profiles', {
        user_id: pendingId,
        username: 'PendingMember',
        avatar_url: 'https://example.com/member.png',
        account_state: 'deletion_pending',
        slug: 'pending-member',
        created_at: now,
        updated_at: now,
      });
      const groupId = await ctx.db.insert('groups', {
        name: 'Lifecycle Group',
        slug: 'lifecycle-group',
        created_at: now,
        created_by: ownerId,
        is_deleted: false,
      });
      await ctx.db.insert('group_members', {
        group_id: groupId,
        user_id: ownerId,
        status: 'active',
        requested_at: now,
        approved_at: now,
        approved_by: ownerId,
      });
      await ctx.db.insert('group_members', {
        group_id: groupId,
        user_id: pendingId,
        status: 'active',
        requested_at: now,
        approved_at: now,
        approved_by: ownerId,
      });
      await ctx.db.insert('factions', {
        owner_id: pendingId,
        data: assetPublishingFaction,
        slug: 'pending-owned-faction',
        created_at: now,
        updated_at: now,
        is_deleted: false,
        group_id: null,
      });
      return { pendingId };
    });

    const group = await t.withIdentity({ subject: ids.pendingId }).query(api.groups.detailBySlug, {
      slug: 'lifecycle-group',
    });
    expect(group.viewerAccess.viewer).toEqual({ kind: 'anonymous' });
    expect(group.roster.map((entry) => entry.user.slug)).toEqual(['active-owner']);

    const faction = await t.query(api.factions.getBySlug, { slug: 'pending-owned-faction' });
    expect(faction.owner).toBeNull();
  });
});
