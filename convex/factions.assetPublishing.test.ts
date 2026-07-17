/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import migrationsTest from '@convex-dev/migrations/test';
import { convexTest } from 'convex-test';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { proofFaction } from '../src/app/capture/proofFaction';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { FACTION_SHEET_PUBLICATION_COUNTER_KEY } from './lib/factionSheetPublicationGuard';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const NOW = Date.parse('2026-07-16T12:00:00.000Z');
const BATCH = 'batch-token-0000000000000001';
const CLAIM = 'claim-token-0000000000000001';

afterEach(() => vi.useRealTimers());

async function authenticatedTest() {
  const t = convexTest(schema, modules);
  const userId = await t.run(
    async (ctx) => await ctx.db.insert('users', { name: 'Faction publisher test user' })
  );
  return {
    t,
    userId,
    asUser: t.withIdentity({ subject: userId }),
  };
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

describe('faction save target reconciliation', () => {
  test('a save before config seeding creates disabled config and durable pending work', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { t, asUser } = await authenticatedTest();

    const faction = await createFaction(asUser);
    const state = await t.run(async (ctx) => ({
      config: await ctx.db
        .query('asset_type_configs')
        .withIndex('by_asset_type', (q) => q.eq('asset_type', 'faction_sheet'))
        .unique(),
      target: await ctx.db
        .query('asset_targets')
        .withIndex('by_faction_id_and_asset_type', (q) =>
          q.eq('faction_id', faction._id).eq('asset_type', 'faction_sheet')
        )
        .unique(),
      publisherState: await ctx.db.query('asset_publisher_state').take(1),
    }));

    expect(state.config).toMatchObject({
      asset_type: 'faction_sheet',
      status: 'disabled',
      active_renderer_version: 'faction-sheet-v1',
    });
    expect(state.target).toMatchObject({
      faction_id: faction._id,
      asset_type: 'faction_sheet',
      desired_generation: 1,
      desired_renderer_version: 'faction-sheet-v1',
      status: 'pending',
      next_eligible_at: NOW,
      attempt_count: 0,
    });
    expect(state.publisherState).toEqual([]);
    await expect(
      t.query(internal.assetPublisher.hasEligibleWork, { cutoff: NOW })
    ).resolves.toEqual({ eligibility: 'empty' });
    await expect(
      t.query(api.assetPublisher.getPublicMetadata, {
        factionId: faction._id,
        assetType: 'faction_sheet',
      })
    ).resolves.toEqual({
      factionId: faction._id,
      assetType: 'faction_sheet',
      status: 'pending',
      publication: null,
    });
  });

  test('the first-publication cap never rejects or couples a faction save to Cloudflare', async () => {
    const { t, asUser } = await authenticatedTest();
    await t.run(
      async (ctx) =>
        await ctx.db.insert('counters', {
          key: FACTION_SHEET_PUBLICATION_COUNTER_KEY,
          value: 875,
        })
    );

    const faction = await createFaction(asUser, 'Saved At Structural Cap');
    await expect(targetFor(t, faction._id)).resolves.toMatchObject({
      status: 'pending',
      first_publication_admitted: false,
    });
  });

  test('rapid saves advance one target monotonically and use the latest configured renderer', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { t, asUser } = await authenticatedTest();
    await t.run(async (ctx) => {
      await ctx.db.insert('asset_type_configs', {
        asset_type: 'faction_sheet',
        status: 'disabled',
        active_renderer_version: 'faction-sheet-v2',
        updated_at: NOW,
      });
    });
    const faction = await createFaction(asUser);

    await asUser.mutation(api.factions.update, {
      id: faction._id,
      data: { ...proofFaction, name: 'Atreides Revised' },
    });
    await asUser.mutation(api.factions.update, {
      id: faction._id,
      data: { ...proofFaction, name: 'Atreides Final' },
    });

    const targets = await t.run(
      async (ctx) =>
        await ctx.db
          .query('asset_targets')
          .withIndex('by_faction_id_and_asset_type', (q) =>
            q.eq('faction_id', faction._id).eq('asset_type', 'faction_sheet')
          )
          .take(2)
    );
    expect(targets).toHaveLength(1);
    expect(targets[0]).toMatchObject({
      desired_generation: 3,
      desired_renderer_version: 'faction-sheet-v2',
      status: 'pending',
    });
  });

  test('saves keep v1 until guarded v2 activation and adopt v2 only afterward', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { t, asUser } = await authenticatedTest();
    await t.mutation(internal.assetPublisherOperator.initializeDisabled, {});
    await t.run(async (ctx) => {
      for (const migrationId of [
        'faction_sheet_targets_verify_v1',
        'faction_sheet_publication_admissions_v1',
      ]) {
        await ctx.db.insert('migration_runs', {
          migration_id: migrationId,
          state: 'success',
          is_done: true,
          processed: 25,
          latest_start: NOW - 1_000,
          latest_end: NOW,
          updated_at: new Date(NOW).toISOString(),
        });
      }
    });

    const faction = await createFaction(asUser, 'Before v2 activation');
    await expect(targetFor(t, faction._id)).resolves.toMatchObject({
      desired_generation: 1,
      desired_renderer_version: 'faction-sheet-v1',
    });

    await t.mutation(internal.assetPublisherOperator.activate, {
      rendererVersion: 'faction-sheet-v2',
      targetPrerequisite: 'faction_sheet_targets_verify_v1',
      storagePrerequisite: 'faction_sheet_publication_admissions_v1',
    });
    await asUser.mutation(api.factions.update, {
      id: faction._id,
      data: { ...proofFaction, name: 'After v2 activation' },
    });

    await expect(targetFor(t, faction._id)).resolves.toMatchObject({
      desired_generation: 2,
      desired_renderer_version: 'faction-sheet-v2',
    });
  });

  test('a save during a claim preserves the exact claim snapshot and makes that claim stale', async () => {
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
      await ctx.db.insert('asset_publisher_state', {
        key: 'singleton',
        status: 'active',
        cooldown_until: 0,
        daily_browser_utc_date: '2026-07-16',
        daily_browser_ms: 0,
        next_lane: 'foreground',
      });
      await ctx.db.insert('counters', {
        key: FACTION_SHEET_PUBLICATION_COUNTER_KEY,
        value: 0,
      });
    });
    const faction = await createFaction(asUser);
    await t.mutation(internal.assetPublisher.acquireBatch, { batchToken: BATCH });
    const claim = await t.mutation(internal.assetPublisher.claimOne, {
      batchToken: BATCH,
      claimToken: CLAIM,
    });
    if (claim.status !== 'claimed') throw new Error(`Expected claim, got ${claim.status}`);
    const before = await t.run(async (ctx) => ({
      target: await ctx.db.get('asset_targets', claim.targetId),
      snapshot: await ctx.db
        .query('asset_claim_snapshots')
        .withIndex('by_target_id', (q) => q.eq('target_id', claim.targetId))
        .unique(),
    }));

    await asUser.mutation(api.factions.update, {
      id: faction._id,
      data: { ...proofFaction, name: 'Atreides After Claim' },
    });

    const after = await t.run(async (ctx) => ({
      target: await ctx.db.get('asset_targets', claim.targetId),
      snapshot: await ctx.db
        .query('asset_claim_snapshots')
        .withIndex('by_target_id', (q) => q.eq('target_id', claim.targetId))
        .unique(),
      faction: await ctx.db.get('factions', faction._id),
    }));
    expect(after.target).toMatchObject({
      status: 'leased',
      desired_generation: 2,
      claimed_generation: 1,
      batch_token: BATCH,
      claim_token: CLAIM,
    });
    expect(after.target?.next_eligible_at).toBe(before.target?.next_eligible_at);
    expect(after.snapshot).toEqual(before.snapshot);
    expect((after.snapshot?.payload as { faction: { name: string } }).faction.name).toBe(
      proofFaction.name
    );
    expect((after.faction?.data as { name: string }).name).toBe('Atreides After Claim');
    await expect(
      t.mutation(internal.assetPublisher.revalidateClaim, {
        targetId: claim.targetId,
        batchToken: claim.batchToken,
        claimToken: claim.claimToken,
        generation: claim.generation,
        rendererVersion: claim.rendererVersion,
      })
    ).resolves.toEqual({ status: 'stale' });
  });

  test('setGroup does not dirty the faction-sheet target', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { t, userId, asUser } = await authenticatedTest();
    const faction = await createFaction(asUser);
    const groupId = await t.run(async (ctx) => {
      const id = await ctx.db.insert('groups', {
        name: 'Publisher group',
        slug: 'publisher-group',
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
    const before = await targetFor(t, faction._id);

    await asUser.mutation(api.factions.setGroup, { id: faction._id, group_id: groupId });

    expect(await targetFor(t, faction._id)).toEqual(before);
  });

  test('soft deletion preserves the target and its publication', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { t, asUser } = await authenticatedTest();
    const faction = await createFaction(asUser);
    const target = await targetFor(t, faction._id);
    if (!target) throw new Error('Missing target');
    await t.run(async (ctx) => {
      await ctx.db.patch(target._id, {
        status: 'current',
        published_generation: 1,
        published_renderer_version: 'faction-sheet-v1',
        published_cache_token: 'published-token',
        published_r2_etag: 'published-etag',
        published_bytes: 1234,
        published_at: NOW,
      });
    });
    const before = await targetFor(t, faction._id);

    await asUser.mutation(api.factions.softDelete, { id: faction._id });

    expect(await targetFor(t, faction._id)).toEqual(before);
  });

  test('duplicate target drift aborts both the faction update and target reconciliation', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const { t, asUser } = await authenticatedTest();
    const faction = await createFaction(asUser);
    await t.run(async (ctx) => {
      await ctx.db.insert('asset_targets', {
        faction_id: faction._id,
        asset_type: 'faction_sheet',
        desired_generation: 99,
        desired_renderer_version: 'drifted-renderer',
        status: 'pending',
        next_eligible_at: NOW,
        attempt_count: 0,
      });
    });

    await expect(
      asUser.mutation(api.factions.update, {
        id: faction._id,
        data: { ...proofFaction, name: 'Must Roll Back' },
      })
    ).rejects.toThrow('duplicate faction-sheet targets');
    const after = await t.run(async (ctx) => ({
      faction: await ctx.db.get('factions', faction._id),
      targets: await ctx.db
        .query('asset_targets')
        .withIndex('by_faction_id_and_asset_type', (q) =>
          q.eq('faction_id', faction._id).eq('asset_type', 'faction_sheet')
        )
        .take(3),
    }));
    expect((after.faction?.data as { name: string }).name).toBe(proofFaction.name);
    expect(after.targets.map((target) => target.desired_generation).sort()).toEqual([1, 99]);
  });

  test('authoritative validation failure creates no faction, config, or target', async () => {
    const { t, asUser } = await authenticatedTest();

    await expect(
      asUser.mutation(api.factions.create, {
        data: { ...proofFaction, name: 42 },
        group_id: null,
      })
    ).rejects.toThrow('Invalid faction data at name');
    await expect(
      t.run(async (ctx) => ({
        factions: await ctx.db.query('factions').take(1),
        configs: await ctx.db.query('asset_type_configs').take(1),
        targets: await ctx.db.query('asset_targets').take(1),
      }))
    ).resolves.toEqual({ factions: [], configs: [], targets: [] });
  });
});

describe('faction-sheet target migrations', () => {
  test('publication-admission initialization refuses non-disabled publisher state', async () => {
    const t = convexTest(schema, modules);
    migrationsTest.register(t);
    await t.run(async (ctx) => {
      await ctx.db.insert('asset_type_configs', {
        asset_type: 'faction_sheet',
        status: 'disabled',
        active_renderer_version: 'faction-sheet-v1',
        updated_at: NOW,
      });
      await ctx.db.insert('asset_publisher_state', {
        key: 'singleton',
        status: 'active',
        cooldown_until: 0,
        daily_browser_utc_date: '2026-07-16',
        daily_browser_ms: 0,
        next_lane: 'foreground',
      });
    });

    await expect(
      t.mutation(api.migrations.runRequired, {
        ids: ['faction_sheet_publication_admissions_v1'],
      })
    ).rejects.toThrow('requires disabled publisher state');
    await expect(t.run(async (ctx) => await ctx.db.query('counters').take(1))).resolves.toEqual([]);
  });

  test('initializes the structural counter disabled-first and backfills admissions idempotently', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const t = convexTest(schema, modules);
    migrationsTest.register(t);
    await t.run(async (ctx) => {
      const userId = await ctx.db.insert('users', { name: 'Storage migration owner' });
      await ctx.db.insert('asset_type_configs', {
        asset_type: 'faction_sheet',
        status: 'disabled',
        active_renderer_version: 'faction-sheet-v1',
        updated_at: NOW,
      });
      for (const [index, state] of ['published', 'admitted', 'fresh'].entries()) {
        const factionId = await ctx.db.insert('factions', {
          owner_id: userId,
          data: { ...proofFaction, name: `Storage ${state}` },
          slug: `storage-${state}`,
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
          ...(index === 0
            ? {
                published_generation: 1,
                published_renderer_version: 'faction-sheet-v1',
                published_cache_token: 'existing-token',
                published_r2_etag: 'existing-etag',
                published_bytes: 1_234,
                published_at: NOW,
              }
            : {}),
          ...(index === 1 ? { first_publication_admitted: true } : {}),
          status: index === 0 ? 'current' : 'pending',
          next_eligible_at: NOW,
          attempt_count: 0,
        });
      }
    });

    const ids = ['faction_sheet_publication_admissions_v1'];
    await t.mutation(api.migrations.runRequired, { ids });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    await expect(
      t.query(api.migrations.assertReadyForNarrow, { required: ids })
    ).resolves.toMatchObject({ ok: true, required: ids });
    await expect(
      t.run(async (ctx) => ({
        state: await ctx.db.query('asset_publisher_state').take(2),
        counter: await ctx.db
          .query('counters')
          .withIndex('by_key', (q) => q.eq('key', FACTION_SHEET_PUBLICATION_COUNTER_KEY))
          .unique(),
        targets: await ctx.db.query('asset_targets').take(4),
      }))
    ).resolves.toMatchObject({
      state: [{ status: 'disabled' }],
      counter: { value: 2 },
      targets: expect.arrayContaining([
        expect.objectContaining({ published_generation: 1, first_publication_admitted: true }),
        expect.objectContaining({ first_publication_admitted: true }),
        expect.objectContaining({ first_publication_admitted: false }),
      ]),
    });

    await t.mutation(api.migrations.runRequired, { ids });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    await expect(
      t.run(
        async (ctx) =>
          await ctx.db
            .query('counters')
            .withIndex('by_key', (q) => q.eq('key', FACTION_SHEET_PUBLICATION_COUNTER_KEY))
            .unique()
      )
    ).resolves.toMatchObject({ value: 2 });
  });

  test('backfill is active-only, bounded, idempotent, and followed by zero-defect verification', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const t = convexTest(schema, modules);
    migrationsTest.register(t);
    const factions = await t.run(async (ctx) => {
      const userId = await ctx.db.insert('users', { name: 'Migration owner' });
      const insertFaction = async (name: string, isDeleted: boolean) =>
        await ctx.db.insert('factions', {
          owner_id: userId,
          data: { ...proofFaction, name },
          slug: name.toLowerCase().replaceAll(' ', '-'),
          created_at: new Date(NOW).toISOString(),
          updated_at: new Date(NOW).toISOString(),
          is_deleted: isDeleted,
          group_id: null,
        });
      return {
        activeOne: await insertFaction('Active One', false),
        activeTwo: await insertFaction('Active Two', false),
        deleted: await insertFaction('Deleted One', true),
      };
    });

    const ids = ['faction_sheet_targets_backfill_v1', 'faction_sheet_targets_verify_v1'];
    await t.mutation(api.migrations.runRequired, { ids });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const first = await t.run(async (ctx) => ({
      configs: await ctx.db.query('asset_type_configs').take(2),
      activeOne: await ctx.db
        .query('asset_targets')
        .withIndex('by_faction_id_and_asset_type', (q) =>
          q.eq('faction_id', factions.activeOne).eq('asset_type', 'faction_sheet')
        )
        .take(2),
      activeTwo: await ctx.db
        .query('asset_targets')
        .withIndex('by_faction_id_and_asset_type', (q) =>
          q.eq('faction_id', factions.activeTwo).eq('asset_type', 'faction_sheet')
        )
        .take(2),
      deleted: await ctx.db
        .query('asset_targets')
        .withIndex('by_faction_id_and_asset_type', (q) =>
          q.eq('faction_id', factions.deleted).eq('asset_type', 'faction_sheet')
        )
        .take(2),
    }));
    expect(first.configs).toHaveLength(1);
    expect(first.configs[0]).toMatchObject({ status: 'disabled' });
    expect(first.activeOne).toHaveLength(1);
    expect(first.activeTwo).toHaveLength(1);
    expect(first.deleted).toHaveLength(0);
    await expect(
      t.query(api.migrations.verifyMigration, { id: 'faction_sheet_targets_verify_v1' })
    ).resolves.toMatchObject({
      complete: true,
      pending: 0,
      missing: 0,
      duplicates: 0,
    });
    await expect(
      t.query(api.migrations.assertReadyForNarrow, { required: ids })
    ).resolves.toMatchObject({ ok: true, required: ids });

    await t.mutation(api.migrations.runRequired, { ids });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const finalTargets = await t.run(async (ctx) => await ctx.db.query('asset_targets').take(4));
    expect(finalTargets).toHaveLength(2);
    expect(finalTargets.every((target) => target.desired_generation === 1)).toBe(true);
  });

  test('the verification migration fails closed on duplicate targets', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const t = convexTest(schema, modules);
    migrationsTest.register(t);
    await t.run(async (ctx) => {
      const userId = await ctx.db.insert('users', { name: 'Verification owner' });
      const factionId = await ctx.db.insert('factions', {
        owner_id: userId,
        data: proofFaction,
        slug: 'verification-faction',
        created_at: new Date(NOW).toISOString(),
        updated_at: new Date(NOW).toISOString(),
        is_deleted: false,
        group_id: null,
      });
      await ctx.db.insert('asset_type_configs', {
        asset_type: 'faction_sheet',
        status: 'disabled',
        active_renderer_version: 'faction-sheet-v1',
        updated_at: NOW,
      });
      for (const generation of [1, 2]) {
        await ctx.db.insert('asset_targets', {
          faction_id: factionId,
          asset_type: 'faction_sheet',
          desired_generation: generation,
          desired_renderer_version: 'faction-sheet-v1',
          status: 'pending',
          next_eligible_at: NOW,
          attempt_count: 0,
        });
      }
    });

    await t.mutation(api.migrations.runRequired, {
      ids: ['faction_sheet_targets_verify_v1'],
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    await expect(
      t.query(api.migrations.verifyMigration, { id: 'faction_sheet_targets_verify_v1' })
    ).resolves.toMatchObject({
      complete: false,
      state: 'failed',
      missing: null,
      duplicates: null,
      error: expect.stringContaining('duplicate targets'),
    });
  });
});
