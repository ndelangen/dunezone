/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import aggregateTest from '@convex-dev/aggregate/test';
import migrationsTest from '@convex-dev/migrations/test';
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { assetPublishingFaction } from '../src/shared/factions/fixtures/assetPublishingFaction';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { applicationTriggers } from './lib/applicationTriggers';
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

async function seedAccount(
  t: ReturnType<typeof setup>,
  slug: string,
  options?: { admin?: boolean; state?: 'active' | 'deletion_pending' | 'deleted' }
) {
  const state = options?.state ?? 'active';
  return await t.run(async (rawCtx) => {
    const ctx = applicationTriggers.wrapDB(rawCtx);
    const userId = await ctx.db.insert('users', { account_state: state, isAdmin: options?.admin });
    const profileId = await ctx.db.insert('profiles', {
      user_id: userId,
      username: slug,
      avatar_url: null,
      account_state: state,
      slug,
      created_at: now,
      updated_at: now,
    });
    return { userId, profileId };
  });
}

async function seedOwnedRows(t: ReturnType<typeof setup>, ownerId: Id<'users'>, prefix: string) {
  return await t.run(async (rawCtx) => {
    const ctx = applicationTriggers.wrapDB(rawCtx);
    const groupId = await ctx.db.insert('groups', {
      name: `${prefix} Group`,
      slug: `${prefix}-group`,
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
    const factionId = await ctx.db.insert('factions', {
      owner_id: ownerId,
      data: { ...assetPublishingFaction, name: `${prefix} Faction` },
      slug: `${prefix}-faction`,
      created_at: now,
      updated_at: now,
      is_deleted: false,
      group_id: groupId,
    });
    const deletedFactionId = await ctx.db.insert('factions', {
      owner_id: ownerId,
      data: { ...assetPublishingFaction, name: `${prefix} Old Faction` },
      slug: `${prefix}-old-faction`,
      created_at: now,
      updated_at: now,
      is_deleted: true,
      group_id: null,
    });
    const rulesetId = await ctx.db.insert('rulesets', {
      name: `${prefix} Ruleset`,
      slug: `${prefix}-ruleset`,
      description: 'A sufficiently long test description for account deletion ownership coverage.',
      created_at: now,
      updated_at: now,
      owner_id: ownerId,
      group_id: groupId,
      is_deleted: false,
      image_cover: null,
    });
    const linkId = await ctx.db.insert('ruleset_factions', { ruleset_id: rulesetId, faction_id: factionId });
    const questionId = await ctx.db.insert('faq_items', {
      ruleset_id: rulesetId,
      slug: '1',
      question: 'Historical question',
      asked_by: ownerId,
      created_at: now,
      updated_at: now,
      accepted_answer_id: null,
    });
    return { groupId, factionId, deletedFactionId, rulesetId, linkId, questionId };
  });
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('account deletion', () => {
  test('summarizes ownership and lazily pages only eligible replacement profiles', async () => {
    const t = setup();
    const source = await seedAccount(t, 'source');
    const replacement = await seedAccount(t, 'replacement');
    await seedAccount(t, 'pending', { state: 'deletion_pending' });
    await seedOwnedRows(t, source.userId, 'summary');
    const asSource = t.withIdentity({ subject: source.userId });

    await expect(asSource.query(api.accountDeletion.page, { profileSlug: 'source' })).resolves.toMatchObject({
      kind: 'active',
      summary: [
        { kind: 'group', hasActive: true, hasDeleted: false },
        { kind: 'faction', hasActive: true, hasDeleted: true },
        { kind: 'ruleset', hasActive: true, hasDeleted: false },
      ],
    });
    const picker = await asSource.query(api.accountDeletion.listReplacementProfiles, {
      paginationOpts: { cursor: null, numItems: 20 },
    });
    expect(picker.page.map((profile) => profile.userId)).toEqual([replacement.userId]);
    await expect(asSource.query(api.accountDeletion.page, { profileSlug: 'someone-else' })).resolves.toMatchObject({
      kind: 'denied',
      reason: 'wrong_profile',
    });
  });

  test('transfers active and deleted ownership, preserves participation, and is duplicate-safe', async () => {
    const t = setup();
    const source = await seedAccount(t, 'transfer-source');
    const replacement = await seedAccount(t, 'transfer-target');
    const rows = await seedOwnedRows(t, source.userId, 'transfer');
    const asSource = t.withIdentity({ subject: source.userId });

    const first = await asSource.mutation(api.accountDeletion.confirm, { replacementUserId: replacement.userId });
    await expect(
      asSource.mutation(api.accountDeletion.confirm, { replacementUserId: replacement.userId })
    ).resolves.toEqual(first);
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());

    await t.run(async (ctx) => {
      expect((await ctx.db.get('users', source.userId))?.account_state).toBe('deleted');
      expect((await ctx.db.get('groups', rows.groupId))?.created_by).toBe(replacement.userId);
      expect((await ctx.db.get('factions', rows.factionId))?.owner_id).toBe(replacement.userId);
      expect((await ctx.db.get('factions', rows.deletedFactionId))?.owner_id).toBe(replacement.userId);
      expect((await ctx.db.get('factions', rows.deletedFactionId))?.is_deleted).toBe(true);
      expect((await ctx.db.get('rulesets', rows.rulesetId))?.owner_id).toBe(replacement.userId);
      expect(await ctx.db.get('ruleset_factions', rows.linkId)).not.toBeNull();
      expect(await ctx.db.get('faq_items', rows.questionId)).not.toBeNull();
      const targetMembership = await ctx.db
        .query('group_members')
        .withIndex('by_group_user', (q) => q.eq('group_id', rows.groupId).eq('user_id', replacement.userId))
        .unique();
      expect(targetMembership?.status).toBe('active');
      const sourceMembership = await ctx.db
        .query('group_members')
        .withIndex('by_group_user', (q) => q.eq('group_id', rows.groupId).eq('user_id', source.userId))
        .unique();
      expect(sourceMembership?.status).toBe('active');
    });
  });

  test('captures ownership added after summary, spans batches, and restores only previously live rows', async () => {
    const t = setup();
    const source = await seedAccount(t, 'delete-source');
    const admin = await seedAccount(t, 'admin', { admin: true });
    const rows = await seedOwnedRows(t, source.userId, 'delete');
    const asSource = t.withIdentity({ subject: source.userId });
    await asSource.query(api.accountDeletion.page, { profileSlug: 'delete-source' });
    await t.run(async (ctx) => {
      for (let index = 0; index < 36; index += 1) {
        await ctx.db.insert('groups', {
          name: `Late Group ${index}`,
          slug: `late-group-${index}`,
          created_at: now,
          created_by: source.userId,
          is_deleted: false,
        });
      }
    });
    const { operationId } = await asSource.mutation(api.accountDeletion.confirm, { replacementUserId: null });
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());

    await t.run(async (ctx) => {
      const lateActive = await ctx.db
        .query('groups')
        .withIndex('by_created_by_deleted', (q) => q.eq('created_by', source.userId).eq('is_deleted', false))
        .take(1);
      expect(lateActive).toEqual([]);
      expect((await ctx.db.get('factions', rows.deletedFactionId))?.is_deleted).toBe(true);
    });

    await t.withIdentity({ subject: admin.userId }).mutation(api.accountDeletion.restore, { operationId });
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    await t.run(async (ctx) => {
      expect((await ctx.db.get('users', source.userId))?.account_state).toBe('active');
      expect((await ctx.db.get('groups', rows.groupId))?.is_deleted).toBe(false);
      expect((await ctx.db.get('factions', rows.factionId))?.is_deleted).toBe(false);
      expect((await ctx.db.get('rulesets', rows.rulesetId))?.is_deleted).toBe(false);
      expect((await ctx.db.get('factions', rows.deletedFactionId))?.is_deleted).toBe(true);
    });
  });

  test('fails closed for a stale replacement, resumes after repair, and blocks replacement deletion', async () => {
    const t = setup();
    const source = await seedAccount(t, 'repair-source');
    const replacement = await seedAccount(t, 'repair-target');
    const admin = await seedAccount(t, 'repair-admin', { admin: true });
    await seedOwnedRows(t, source.userId, 'repair');
    const asSource = t.withIdentity({ subject: source.userId });
    const { operationId } = await asSource.mutation(api.accountDeletion.confirm, {
      replacementUserId: replacement.userId,
    });
    await expect(
      t.withIdentity({ subject: replacement.userId }).mutation(api.accountDeletion.confirm, { replacementUserId: null })
    ).rejects.toThrow(/replacement owner/);
    await t.run(async (ctx) => {
      await ctx.db.patch(replacement.userId, { account_state: 'deletion_pending' });
      await ctx.db.patch(replacement.profileId, { account_state: 'deletion_pending' });
    });
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    await t.run(async (ctx) => {
      expect((await ctx.db.get('account_deletion_operations', operationId))?.state).toBe('failed');
      expect((await ctx.db.get('users', source.userId))?.account_state).toBe('deletion_pending');
      await ctx.db.patch(replacement.userId, { account_state: 'active' });
      await ctx.db.patch(replacement.profileId, { account_state: 'active' });
    });
    await t.withIdentity({ subject: admin.userId }).mutation(api.accountDeletion.resume, { operationId });
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    await t.run(async (ctx) => {
      expect((await ctx.db.get('account_deletion_operations', operationId))?.state).toBe('completed');
      expect((await ctx.db.get('users', source.userId))?.account_state).toBe('deleted');
    });
  });

  test('rejects self, pending, and deleted replacement profiles authoritatively', async () => {
    const t = setup();
    const source = await seedAccount(t, 'denial-source');
    const pending = await seedAccount(t, 'denial-pending', { state: 'deletion_pending' });
    const deleted = await seedAccount(t, 'denial-deleted', { state: 'deleted' });
    const asSource = t.withIdentity({ subject: source.userId });
    await expect(asSource.mutation(api.accountDeletion.confirm, { replacementUserId: source.userId })).rejects.toThrow(
      /another active profile/
    );
    await expect(asSource.mutation(api.accountDeletion.confirm, { replacementUserId: pending.userId })).rejects.toThrow(
      /no longer available/
    );
    await expect(asSource.mutation(api.accountDeletion.confirm, { replacementUserId: deleted.userId })).rejects.toThrow(
      /no longer available/
    );
  });
});
