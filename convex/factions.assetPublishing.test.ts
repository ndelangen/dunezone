/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import migrationsTest from '@convex-dev/migrations/test';
import { convexTest } from 'convex-test';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { proofFaction } from '../src/app/capture/proofFaction';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { ITEM_CLAIM_MIGRATION_IDS } from './lib/assetPublisherConstants';
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
  name = proofFaction.name
) {
  return await asUser.mutation(api.factions.create, {
    data: { ...proofFaction, name },
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
  test('create seeds one disabled config and a new-shape pending target', async () => {
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
      publisherState: await ctx.db.query('asset_publisher_state').take(1),
    }));
    expect(state.config).toHaveLength(1);
    expect(state.config[0]).toMatchObject({ status: 'disabled' });
    expect(state.target).toMatchObject({
      desired_generation: 1,
      status: 'pending',
      consecutive_render_failures: 0,
    });
    expect(state.target?.attempt_count).toBeUndefined();
    expect(state.target?.next_eligible_at).toBeUndefined();
    expect(state.target?.first_publication_admitted).toBeUndefined();
    expect(state.publisherState).toEqual([]);
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
      data: { ...proofFaction, name: 'Edited faction' },
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
      data: { ...proofFaction, name: 'Edited while leased' },
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

describe('item-claim widen migrations', () => {
  test('converts legacy targets and deletes snapshots, singleton, and admission counter idempotently', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const t = convexTest(schema, modules);
    migrationsTest.register(t);
    await t.run(async (ctx) => {
      const userId = await ctx.db.insert('users', { name: 'Migration owner' });
      await ctx.db.insert('asset_type_configs', {
        asset_type: 'faction_sheet',
        status: 'paused',
        active_renderer_version: 'faction-sheet-v1',
        updated_at: NOW,
      });
      const factionId = await ctx.db.insert('factions', {
        owner_id: userId,
        data: proofFaction,
        slug: 'legacy-faction',
        created_at: new Date(NOW).toISOString(),
        updated_at: new Date(NOW).toISOString(),
        is_deleted: false,
        group_id: null,
      });
      const targetId = await ctx.db.insert('asset_targets', {
        faction_id: factionId,
        asset_type: 'faction_sheet',
        desired_generation: 1,
        desired_renderer_version: 'faction-sheet-v1',
        first_publication_admitted: true,
        status: 'cooldown',
        next_eligible_at: NOW + 60_000,
        attempt_count: 7,
        batch_token: 'legacy-batch-token-0001',
        claim_payload_hash: 'a'.repeat(64),
      });
      await ctx.db.insert('asset_claim_snapshots', {
        target_id: targetId,
        faction_id: factionId,
        asset_type: 'faction_sheet',
        batch_token: 'legacy-batch-token-0001',
        claim_token: 'legacy-claim-token-0001',
        generation: 1,
        renderer_version: 'faction-sheet-v1',
        lease_expires_at: NOW - 1,
        payload_hash: 'a'.repeat(64),
        payload: { legacy: true },
      });
      await ctx.db.insert('asset_publisher_state', {
        key: 'singleton',
        status: 'paused',
        cooldown_until: NOW,
        daily_browser_utc_date: '2026-07-17',
        daily_browser_ms: 123,
        next_lane: 'foreground',
      });
      await ctx.db.insert('counters', {
        key: 'asset_publisher:faction_sheet:first_publications',
        value: 1,
      });
    });

    const ids = [...ITEM_CLAIM_MIGRATION_IDS];
    await t.mutation(api.migrations.runRequired, { ids });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    await expect(
      t.query(api.migrations.assertReadyForNarrow, { required: ids })
    ).resolves.toMatchObject({ ok: true, required: ids });
    const migrated = await t.run(async (ctx) => ({
      targets: await ctx.db.query('asset_targets').take(2),
      snapshots: await ctx.db.query('asset_claim_snapshots').take(1),
      state: await ctx.db.query('asset_publisher_state').take(1),
      counter: await ctx.db
        .query('counters')
        .withIndex('by_key', (q) => q.eq('key', 'asset_publisher:faction_sheet:first_publications'))
        .unique(),
    }));
    expect(migrated.targets[0]).toMatchObject({
      status: 'pending',
      consecutive_render_failures: 0,
    });
    expect(migrated.targets[0]?.attempt_count).toBeUndefined();
    expect(migrated.targets[0]?.next_eligible_at).toBeUndefined();
    expect(migrated.targets[0]?.first_publication_admitted).toBeUndefined();
    expect(migrated.snapshots).toEqual([]);
    expect(migrated.state).toEqual([]);
    expect(migrated.counter).toBeNull();

    await t.mutation(api.migrations.runRequired, { ids });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    await expect(
      t.run(async (ctx) => await ctx.db.query('asset_targets').take(2))
    ).resolves.toHaveLength(1);
  });

  test('fails closed while an unexpired claim exists', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const t = convexTest(schema, modules);
    migrationsTest.register(t);
    await t.run(async (ctx) => {
      const userId = await ctx.db.insert('users', { name: 'Live claim owner' });
      await ctx.db.insert('asset_type_configs', {
        asset_type: 'faction_sheet',
        status: 'paused',
        active_renderer_version: 'faction-sheet-v1',
        updated_at: NOW,
      });
      const factionId = await ctx.db.insert('factions', {
        owner_id: userId,
        data: proofFaction,
        slug: 'live-claim',
        created_at: new Date(NOW).toISOString(),
        updated_at: new Date(NOW).toISOString(),
        is_deleted: false,
        group_id: null,
      });
      await ctx.db.insert('asset_targets', {
        faction_id: factionId,
        asset_type: 'faction_sheet',
        desired_generation: 1,
        desired_renderer_version: 'faction-sheet-v1',
        status: 'leased',
        next_eligible_at: NOW + 60_000,
        attempt_count: 1,
        claim_token: 'live-claim-token-00000001',
        claimed_generation: 1,
        claimed_renderer_version: 'faction-sheet-v1',
        lease_expires_at: NOW + 60_000,
      });
    });
    await t.mutation(api.migrations.runRequired, { ids: ['asset_targets_item_claims_v1'] });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    await expect(
      t.query(api.migrations.verifyMigration, { id: 'asset_targets_item_claims_v1' })
    ).resolves.toMatchObject({
      complete: false,
      state: 'failed',
      error: expect.stringContaining('requires no live claims'),
    });
  });
});
