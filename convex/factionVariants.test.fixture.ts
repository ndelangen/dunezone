import { vi } from 'vite-plus/test';

import { assetPublishingFaction } from '../src/shared/factions/fixtures/assetPublishingFaction';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { applicationTest } from './application.test.fixture';

export type FactionData = typeof assetPublishingFaction;

export async function variantsFixture() {
  const t = applicationTest();
  const ownerId = await t.run(async (ctx) => await ctx.db.insert('users', { name: 'Faction author' }));
  const owner = t.withIdentity({ subject: ownerId });
  await owner.mutation(api.profiles.bootstrapCurrent, {});
  const strangerId = await t.run(async (ctx) => await ctx.db.insert('users', { name: 'Stranger' }));
  const stranger = t.withIdentity({ subject: strangerId });
  await stranger.mutation(api.profiles.bootstrapCurrent, {});

  const root = await owner.mutation(api.factions.create, { data: assetPublishingFaction, group_id: null });
  const addVariant = (name: string, parentId?: Id<'factions'>) =>
    owner.mutation(api.factionVariants.create, {
      faction_id: root._id,
      name,
      group_id: null,
      ...(parentId ? { parent_id: parentId } : {}),
    });
  const row = (id: Id<'factions'>) => t.run(async (ctx) => (await ctx.db.get(id))!);
  const data = async (id: Id<'factions'>) => (await row(id)).data as FactionData;
  const save = (id: Id<'factions'>, next: FactionData, inherited?: string[]) =>
    owner.mutation(api.factions.update, { id, data: next, ...(inherited ? { inherited } : {}) });
  const settle = () => t.finishAllScheduledFunctions(vi.runAllTimers);
  const familyId = (await row(root._id)).family_id!;
  const family = (id: Id<'faction_families'> = familyId) => t.run(async (ctx) => (await ctx.db.get(id))!);
  /** Someone who belongs to the Faction's own Group, which co-maintains it (#2910). */
  const factionGroupMember = async () => {
    const memberId = await t.run(async (ctx) => await ctx.db.insert('users', { name: 'Faction co-owner' }));
    const member = t.withIdentity({ subject: memberId });
    await member.mutation(api.profiles.bootstrapCurrent, {});
    await t.run(async (ctx) => {
      const groupId = await ctx.db.insert('groups', {
        name: 'Faction keepers',
        slug: 'faction-keepers',
        created_at: '2026-11-13T00:00:00.000Z',
        created_by: ownerId,
        is_deleted: false,
      });
      for (const userId of [ownerId, memberId]) {
        await ctx.db.insert('group_members', {
          group_id: groupId,
          user_id: userId,
          status: 'active',
          requested_at: '2026-11-13T00:00:00.000Z',
          approved_at: '2026-11-13T00:00:00.000Z',
          approved_by: ownerId,
        });
      }
      await ctx.db.patch(familyId, { group_id: groupId });
    });
    return member;
  };
  return { t, owner, stranger, root, addVariant, row, data, save, settle, familyId, family, factionGroupMember };
}

export const withStartText = (data: FactionData, startText: string): FactionData => ({
  ...data,
  rules: { ...data.rules, startText },
});
