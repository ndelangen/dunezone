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
  return { t, owner, stranger, root, addVariant, row, data, save, settle };
}

export const withStartText = (data: FactionData, startText: string): FactionData => ({
  ...data,
  rules: { ...data.rules, startText },
});
