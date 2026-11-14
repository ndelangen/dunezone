/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { afterEach, beforeEach, describe, expect, test, vi } from 'vite-plus/test';

import { assetPublishingFaction } from '../src/shared/factions/fixtures/assetPublishingFaction';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { applicationTest } from './application.test.fixture';

const now = '2026-11-13T00:00:00.000Z';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

async function seedAccount(t: ReturnType<typeof applicationTest>, slug: string) {
  const { userId, subject } = await t.run(async (ctx) => {
    const id = await ctx.db.insert('users', { account_state: 'active' });
    await ctx.db.insert('profiles', {
      user_id: id,
      username: slug,
      avatar_url: null,
      account_state: 'active',
      slug,
      created_at: now,
      updated_at: now,
    });
    const sessionId = await ctx.db.insert('authSessions', { userId: id, expirationTime: Date.now() + 86_400_000 });
    await ctx.db.insert('authAccounts', { userId: id, provider: 'discord', providerAccountId: slug });
    return { userId: id, subject: `${id}|${sessionId}` };
  });
  return { userId, as: t.withIdentity({ subject }) };
}

/** A faction whose owner is about to leave, open so two other people have added variants of their own. */
async function handoffFixture() {
  const t = applicationTest();
  const leaving = await seedAccount(t, 'leaving');
  const early = await seedAccount(t, 'early');
  const later = await seedAccount(t, 'later');
  const root = await leaving.as.mutation(api.factions.create, { data: assetPublishingFaction, group_id: null });
  const familyId = (await t.run(async (ctx) => (await ctx.db.get(root._id))!.family_id))!;
  const family = () => t.run(async (ctx) => (await ctx.db.get(familyId))!);
  const deleteAccount = async (replacementUserId: Id<'users'> | null = null) => {
    const operation = await leaving.as.mutation(api.accountDeletion.confirm, { replacementUserId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    return operation;
  };
  const addVariantAs = (as: typeof leaving.as, name: string) =>
    as.mutation(api.factionVariants.create, { faction_id: root._id, name, group_id: null });
  /** Puts the leaving account and `userId` in one Group, since self-service deletion names only such a replacement. */
  const shareGroup = async (userId: Id<'users'>) => {
    await t.run(async (ctx) => {
      const groupId = await ctx.db.insert('groups', {
        name: 'Shared',
        slug: 'shared',
        created_at: now,
        created_by: userId,
        is_deleted: false,
      });
      for (const member of [leaving.userId, userId]) {
        await ctx.db.insert('group_members', {
          group_id: groupId,
          user_id: member,
          status: 'active',
          requested_at: now,
          approved_at: now,
          approved_by: userId,
        });
      }
    });
    return userId;
  };
  return { t, leaving, early, later, root, familyId, family, deleteAccount, addVariantAs, shareGroup };
}

describe('a faction whose owner leaves (#2928)', () => {
  test('passes to the owner of the first variant in variant order whose account is still active', async () => {
    const { leaving, early, later, familyId, family, deleteAccount, addVariantAs } = await handoffFixture();
    await leaving.as.mutation(api.factionFamilies.setOpen, { family_id: familyId, is_open: true });
    const earlyVariant = await addVariantAs(early.as, 'Early');
    const laterVariant = await addVariantAs(later.as, 'Later');
    await leaving.as.mutation(api.factionFamilies.setVariantOrder, {
      family_id: familyId,
      variant_ids: [laterVariant.id, earlyVariant.id],
    });

    await deleteAccount();

    expect(await family()).toMatchObject({
      owner_id: later.userId,
      is_deleted: false,
      default_variant_id: laterVariant.id,
    });
  });

  test('passes to the replacement owner when no other variant owner is left', async () => {
    const { early, family, deleteAccount, shareGroup } = await handoffFixture();
    await deleteAccount(await shareGroup(early.userId));
    expect(await family()).toMatchObject({ owner_id: early.userId, is_deleted: false });
  });

  test('is deleted with the account when nobody is left to take it, and comes back with a restore', async () => {
    const { t, family, deleteAccount } = await handoffFixture();
    const { operationId } = await deleteAccount();
    expect((await family()).is_deleted).toBe(true);

    const adminId = await t.run(async (ctx) => await ctx.db.insert('users', { isAdmin: true }));
    await t.withIdentity({ subject: adminId }).mutation(api.accountDeletion.restore, { operationId });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await family()).is_deleted).toBe(false);
  });
});
