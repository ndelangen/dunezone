/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { convexTest } from 'convex-test';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { assetPublishingFaction } from '../src/game/fixtures/assetPublishingFaction';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const NOW = Date.parse('2026-07-17T12:00:00.000Z');

afterEach(() => vi.useRealTimers());

async function authenticatedTest() {
  const t = convexTest(schema, modules);
  const userId = await t.run(
    async (ctx) => await ctx.db.insert('users', { name: 'Faction publisher test user' })
  );
  return { t, userId, asUser: t.withIdentity({ subject: userId }) };
}

async function createFaction(
  asUser: Awaited<ReturnType<typeof authenticatedTest>>['asUser'],
  name = assetPublishingFaction.name
) {
  return await asUser.mutation(api.factions.create, {
    data: { ...assetPublishingFaction, name },
    group_id: null,
  });
}

async function targetFor(
  t: Awaited<ReturnType<typeof authenticatedTest>>['t'],
  factionId: Id<'factions'>
) {
  return await t.run(
    async (ctx) =>
      await ctx.db
        .query('asset_targets')
        .withIndex('by_faction_id_and_asset_type', (q) =>
          q.eq('faction_id', factionId).eq('asset_type', 'faction_sheet')
        )
        .unique()
  );
}

describe('faction render-generation invariants', () => {
  test('create seeds one disabled config and a pending target', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { t, asUser } = await authenticatedTest();
    const faction = await createFaction(asUser);
    const state = await t.run(async (ctx) => ({
      config: await ctx.db.query('asset_type_configs').take(2),
      target: await ctx.db.get(
        'asset_targets',
        (
          await ctx.db
            .query('asset_targets')
            .withIndex('by_faction_id_and_asset_type', (q) =>
              q.eq('faction_id', faction._id).eq('asset_type', 'faction_sheet')
            )
            .unique()
        )?._id as Id<'asset_targets'>
      ),
    }));
    expect(state.config).toHaveLength(1);
    expect(state.config[0]).toMatchObject({ status: 'disabled' });
    expect(state.target).toMatchObject({
      desired_generation: 1,
      status: 'pending',
      consecutive_render_failures: 0,
    });
  });

  test('every faction data save advances generation, unblocks, and resets only target failures', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { t, asUser } = await authenticatedTest();
    const faction = await createFaction(asUser);
    const initial = await targetFor(t, faction._id);
    if (!initial) throw new Error('Missing target');
    await t.run(async (ctx) => {
      await ctx.db.patch(initial._id, {
        status: 'blocked',
        consecutive_render_failures: 10,
        last_error: 'invalid output',
      });
    });

    await asUser.mutation(api.factions.update, {
      id: faction._id,
      data: { ...assetPublishingFaction, name: 'Edited faction' },
    });
    await expect(targetFor(t, faction._id)).resolves.toMatchObject({
      desired_generation: 2,
      status: 'pending',
      consecutive_render_failures: 0,
    });
    expect((await targetFor(t, faction._id))?.last_error).toBeUndefined();
  });

  test('a save during a lease keeps old ownership but makes render and revalidation stale', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { t, asUser } = await authenticatedTest();
    await t.run(async (ctx) => {
      await ctx.db.insert('asset_type_configs', {
        asset_type: 'faction_sheet',
        status: 'active',
        active_renderer_version: 'faction-sheet-v1',
        updated_at: NOW,
      });
    });
    const faction = await createFaction(asUser);
    const assigned = await t.mutation(internal.assetPublisher.takeWork, {
      claimTokens: ['claim-token-0000000000000001'],
    });
    if (assigned.status !== 'assigned') throw new Error('Expected item claim');
    const [item] = assigned.items;

    await asUser.mutation(api.factions.update, {
      id: faction._id,
      data: { ...assetPublishingFaction, name: 'Edited while leased' },
    });
    const target = await targetFor(t, faction._id);
    expect(target).toMatchObject({
      status: 'leased',
      desired_generation: 2,
      claimed_generation: 1,
      claim_token: item.claimToken,
      consecutive_render_failures: 0,
    });
    await expect(
      t.query(internal.assetPublisher.readItemForRender, { claimToken: item.claimToken })
    ).resolves.toBeNull();
    await expect(
      t.query(internal.assetPublisher.revalidateItem, {
        targetId: item.targetId,
        claimToken: item.claimToken,
        generation: item.generation,
        rendererVersion: item.rendererVersion,
      })
    ).resolves.toEqual({ status: 'stale' });
  });

  test('non-rendering group changes do not advance the target generation', async () => {
    const { t, userId, asUser } = await authenticatedTest();
    const faction = await createFaction(asUser);
    const before = await targetFor(t, faction._id);
    const groupId = await t.run(async (ctx) => {
      const id = await ctx.db.insert('groups', {
        name: 'Faction editors',
        slug: 'faction-editors',
        created_at: new Date(NOW).toISOString(),
        created_by: userId,
      });
      await ctx.db.insert('group_members', {
        group_id: id,
        user_id: userId,
        status: 'active',
        requested_at: new Date(NOW).toISOString(),
        approved_at: new Date(NOW).toISOString(),
        approved_by: userId,
      });
      return id;
    });
    await asUser.mutation(api.factions.setGroup, { id: faction._id, group_id: groupId });
    expect(await targetFor(t, faction._id)).toEqual(before);
  });
});
