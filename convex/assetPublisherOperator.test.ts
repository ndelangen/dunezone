/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { convexTest } from 'convex-test';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const NOW = Date.parse('2026-07-16T12:00:00.000Z');
const activationArgs = {
  rendererVersion: 'faction-sheet-v1' as const,
  targetPrerequisite: 'faction_sheet_targets_verify_v1' as const,
  storagePrerequisite: 'faction_sheet_publication_admissions_v1' as const,
};
const v2ActivationArgs = {
  ...activationArgs,
  rendererVersion: 'faction-sheet-v2' as const,
};
const v3ActivationArgs = {
  ...activationArgs,
  rendererVersion: 'faction-sheet-v3' as const,
};
const RECONCILIATION_RESERVATION_TOKEN = 'prior-canary-reservation';
const reconciliationArgs = {
  expectedUtcDate: '2026-07-16',
  expectedDailyBrowserMs: 484_275,
  expectedBrowserReservationBatchToken: RECONCILIATION_RESERVATION_TOKEN,
  expectedBrowserReservationUtcDate: '2026-07-16',
  expectedBrowserReservedMs: 480_000,
  replacementDailyBrowserMs: 120_000,
};
const currentReservationReconciliationArgs = {
  ...reconciliationArgs,
  expectedDailyBrowserMs: 272_498,
  expectedBrowserReservedMs: 240_000,
};

afterEach(() => vi.useRealTimers());

async function recordSuccessfulPrerequisite(t: ReturnType<typeof convexTest>) {
  await t.run(async (ctx) => {
    for (const migrationId of [
      activationArgs.targetPrerequisite,
      activationArgs.storagePrerequisite,
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
}

async function seedBrowserUsageReconciliation(
  t: ReturnType<typeof convexTest>,
  args = reconciliationArgs
) {
  return await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert('users', { name: 'Browser reconciliation owner' });
    const factionId = await ctx.db.insert('factions', {
      owner_id: ownerId,
      data: {},
      slug: 'browser-reconciliation-canary',
      created_at: new Date(NOW).toISOString(),
      updated_at: new Date(NOW).toISOString(),
      is_deleted: false,
      group_id: null,
    });
    const configId = await ctx.db.insert('asset_type_configs', {
      asset_type: 'faction_sheet',
      status: 'paused',
      active_renderer_version: 'faction-sheet-v1',
      updated_at: NOW - 10_000,
    });
    const stateId = await ctx.db.insert('asset_publisher_state', {
      key: 'singleton',
      status: 'paused',
      cooldown_until: NOW - 20_000,
      daily_browser_utc_date: args.expectedUtcDate,
      daily_browser_ms: args.expectedDailyBrowserMs,
      browser_reservation_batch_token: RECONCILIATION_RESERVATION_TOKEN,
      browser_reservation_utc_date: args.expectedBrowserReservationUtcDate,
      browser_reserved_ms: args.expectedBrowserReservedMs,
      last_browser_settlement_batch_token: 'historical-settlement-token',
      last_browser_settlement_ms: 4_275,
      last_browser_release_batch_token: 'historical-release-token',
      last_browser_release_mode: 'after_settlement',
      next_lane: 'rollout',
    });
    const targetId = await ctx.db.insert('asset_targets', {
      faction_id: factionId,
      asset_type: 'faction_sheet',
      desired_generation: 2,
      desired_renderer_version: 'faction-sheet-v1',
      published_generation: 1,
      published_renderer_version: 'faction-sheet-v1',
      published_cache_token: 'v1.existing-canary-token.existing-canary-signature',
      published_r2_etag: 'existing-etag',
      published_bytes: 100_180,
      published_at: NOW - 30_000,
      first_publication_admitted: true,
      status: 'pending',
      next_eligible_at: 0,
      attempt_count: 3,
      last_error: 'retained retry diagnostic',
      last_completed_batch_token: 'completed-batch-token',
      last_completed_claim_token: 'completed-claim-token',
    });
    const counterId = await ctx.db.insert('counters', {
      key: 'asset_publisher:faction_sheet:first_publications',
      value: 1,
    });
    return { configId, counterId, factionId, stateId, targetId };
  });
}

describe('asset publisher operator controls', () => {
  test('initializes missing config and singleton disabled exactly once', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const t = convexTest(schema, modules);

    await expect(
      t.mutation(internal.assetPublisherOperator.initializeDisabled, {})
    ).resolves.toEqual({
      assetType: 'faction_sheet',
      rendererVersion: 'faction-sheet-v1',
      configStatus: 'disabled',
      publisherStatus: 'disabled',
      changed: true,
    });
    await expect(
      t.mutation(internal.assetPublisherOperator.initializeDisabled, {})
    ).resolves.toMatchObject({
      changed: false,
      configStatus: 'disabled',
      publisherStatus: 'disabled',
    });
    await expect(
      t.run(async (ctx) => ({
        configs: await ctx.db.query('asset_type_configs').take(2),
        states: await ctx.db.query('asset_publisher_state').take(2),
      }))
    ).resolves.toMatchObject({
      configs: [{ status: 'disabled', active_renderer_version: 'faction-sheet-v1' }],
      states: [{ key: 'singleton', status: 'disabled' }],
    });
    await expect(
      t.run(
        async (ctx) =>
          await ctx.db
            .query('counters')
            .withIndex('by_key', (q) =>
              q.eq('key', 'asset_publisher:faction_sheet:first_publications')
            )
            .unique()
      )
    ).resolves.toMatchObject({ value: 0 });
  });

  test('activation fails atomically when its exact prerequisite is missing', async () => {
    const t = convexTest(schema, modules);

    await expect(
      t.mutation(internal.assetPublisherOperator.activate, activationArgs)
    ).rejects.toThrow('prerequisite is not exactly complete');
    await expect(
      t.run(async (ctx) => ({
        configs: await ctx.db.query('asset_type_configs').take(1),
        states: await ctx.db.query('asset_publisher_state').take(1),
      }))
    ).resolves.toEqual({ configs: [], states: [] });
  });

  test('activation requires the exact storage admission migration independently', async () => {
    const t = convexTest(schema, modules);
    await t.run(
      async (ctx) =>
        await ctx.db.insert('migration_runs', {
          migration_id: activationArgs.targetPrerequisite,
          state: 'success',
          is_done: true,
          processed: 25,
          latest_start: NOW - 1_000,
          latest_end: NOW,
          updated_at: new Date(NOW).toISOString(),
        })
    );

    await expect(
      t.mutation(internal.assetPublisherOperator.activate, activationArgs)
    ).rejects.toThrow('faction_sheet_publication_admissions_v1');
    await expect(
      t.run(async (ctx) => ({
        configs: await ctx.db.query('asset_type_configs').take(1),
        states: await ctx.db.query('asset_publisher_state').take(1),
        counters: await ctx.db.query('counters').take(1),
      }))
    ).resolves.toEqual({ configs: [], states: [], counters: [] });
  });

  test('activation selects v3 and retains explicit v2/v1 rollback controls', async () => {
    const t = convexTest(schema, modules);
    await recordSuccessfulPrerequisite(t);
    await t.mutation(internal.assetPublisherOperator.initializeDisabled, {});

    await expect(
      t.mutation(internal.assetPublisherOperator.activate, v3ActivationArgs)
    ).resolves.toMatchObject({
      changed: true,
      rendererVersion: 'faction-sheet-v3',
      configStatus: 'active',
      publisherStatus: 'active',
    });
    await expect(
      t.mutation(internal.assetPublisherOperator.activate, v3ActivationArgs)
    ).resolves.toMatchObject({ changed: false, rendererVersion: 'faction-sheet-v3' });
    await expect(
      t.mutation(internal.assetPublisherOperator.activate, v2ActivationArgs)
    ).resolves.toMatchObject({ changed: true, rendererVersion: 'faction-sheet-v2' });
    await expect(
      t.mutation(internal.assetPublisherOperator.activate, activationArgs)
    ).resolves.toMatchObject({ changed: true, rendererVersion: 'faction-sheet-v1' });
    await expect(
      t.run(async (ctx) => ({
        configs: await ctx.db.query('asset_type_configs').take(2),
        states: await ctx.db.query('asset_publisher_state').take(1),
      }))
    ).resolves.toMatchObject({
      configs: [{ status: 'active', active_renderer_version: 'faction-sheet-v1' }],
      states: [{ status: 'active' }],
    });
  });

  test('guarded activation is idempotent after the exact renderer and prerequisite match', async () => {
    const t = convexTest(schema, modules);
    await recordSuccessfulPrerequisite(t);
    await t.mutation(internal.assetPublisherOperator.initializeDisabled, {});

    await expect(
      t.mutation(internal.assetPublisherOperator.activate, activationArgs)
    ).resolves.toMatchObject({ changed: true, configStatus: 'active', publisherStatus: 'active' });
    await expect(
      t.mutation(internal.assetPublisherOperator.activate, activationArgs)
    ).resolves.toMatchObject({ changed: false, configStatus: 'active', publisherStatus: 'active' });
  });

  test('pause and disable preserve targets and successful publication metadata', async () => {
    const t = convexTest(schema, modules);
    const targetId = await t.run(async (ctx) => {
      const ownerId = await ctx.db.insert('users', { name: 'Operator rollback owner' });
      const factionId = await ctx.db.insert('factions', {
        owner_id: ownerId,
        data: {},
        slug: 'operator-rollback',
        created_at: new Date(NOW).toISOString(),
        updated_at: new Date(NOW).toISOString(),
        is_deleted: false,
        group_id: null,
      });
      return await ctx.db.insert('asset_targets', {
        faction_id: factionId,
        asset_type: 'faction_sheet',
        desired_generation: 1,
        desired_renderer_version: 'faction-sheet-v1',
        published_generation: 1,
        published_renderer_version: 'faction-sheet-v1',
        published_cache_token: 'retained-cache-token',
        published_r2_etag: 'retained-etag',
        published_bytes: 1234,
        published_at: NOW,
        status: 'current',
        next_eligible_at: NOW,
        attempt_count: 0,
      });
    });
    await t.mutation(internal.assetPublisherOperator.initializeDisabled, {});
    const before = await t.run(async (ctx) => await ctx.db.get('asset_targets', targetId));

    await expect(t.mutation(internal.assetPublisherOperator.pause, {})).resolves.toMatchObject({
      configStatus: 'paused',
      publisherStatus: 'paused',
    });
    expect(await t.run(async (ctx) => await ctx.db.get('asset_targets', targetId))).toEqual(before);
    await expect(t.mutation(internal.assetPublisherOperator.disable, {})).resolves.toMatchObject({
      configStatus: 'disabled',
      publisherStatus: 'disabled',
    });
    expect(await t.run(async (ctx) => await ctx.db.get('asset_targets', targetId))).toEqual(before);
  });

  test('requeues exactly one current canary first while preserving its publication', async () => {
    const t = convexTest(schema, modules);
    const seeded = await t.run(async (ctx) => {
      const ownerId = await ctx.db.insert('users', { name: 'Canary owner' });
      const olderFactionId = await ctx.db.insert('factions', {
        owner_id: ownerId,
        data: {},
        slug: 'older-pending-faction',
        created_at: new Date(NOW).toISOString(),
        updated_at: new Date(NOW).toISOString(),
        is_deleted: false,
        group_id: null,
      });
      const factionId = await ctx.db.insert('factions', {
        owner_id: ownerId,
        data: {},
        slug: 'current-canary',
        created_at: new Date(NOW).toISOString(),
        updated_at: new Date(NOW).toISOString(),
        is_deleted: false,
        group_id: null,
      });
      await ctx.db.insert('asset_type_configs', {
        asset_type: 'faction_sheet',
        status: 'paused',
        active_renderer_version: 'faction-sheet-v2',
        updated_at: NOW,
      });
      await ctx.db.insert('asset_publisher_state', {
        key: 'singleton',
        status: 'paused',
        cooldown_until: 0,
        daily_browser_utc_date: '2026-07-16',
        daily_browser_ms: 480_000,
        browser_reservation_batch_token: 'prior-canary-reservation',
        browser_reservation_utc_date: '2026-07-16',
        browser_reserved_ms: 480_000,
        next_lane: 'foreground',
      });
      const olderTargetId = await ctx.db.insert('asset_targets', {
        faction_id: olderFactionId,
        asset_type: 'faction_sheet',
        desired_generation: 1,
        desired_renderer_version: 'faction-sheet-v1',
        first_publication_admitted: false,
        status: 'pending',
        next_eligible_at: NOW - 60_000,
        attempt_count: 0,
      });
      const targetId = await ctx.db.insert('asset_targets', {
        faction_id: factionId,
        asset_type: 'faction_sheet',
        desired_generation: 1,
        desired_renderer_version: 'faction-sheet-v1',
        published_generation: 1,
        published_renderer_version: 'faction-sheet-v1',
        published_cache_token: 'v1.existing-canary-token.existing-canary-signature',
        published_r2_etag: 'existing-etag',
        published_bytes: 100_180,
        published_at: NOW - 1_000,
        first_publication_admitted: true,
        status: 'current',
        next_eligible_at: NOW - 1_000,
        attempt_count: 1,
        last_error: 'old diagnostic',
        last_completed_batch_token: 'completed-batch-token',
        last_completed_claim_token: 'completed-claim-token',
      });
      return { factionId, olderTargetId, targetId };
    });
    const before = await t.run(async (ctx) => await ctx.db.get('asset_targets', seeded.targetId));

    await expect(
      t.mutation(internal.assetPublisherOperator.requeueCurrentFactionSheetCanary, {
        factionId: seeded.factionId,
      })
    ).resolves.toMatchObject({
      status: 'requeued',
      targetId: seeded.targetId,
      previousGeneration: 1,
      desiredGeneration: 2,
      rendererVersion: 'faction-sheet-v2',
      nextEligibleAt: 0,
    });

    const after = await t.run(async (ctx) => await ctx.db.get('asset_targets', seeded.targetId));
    expect(after).toMatchObject({
      desired_generation: 2,
      desired_renderer_version: 'faction-sheet-v2',
      status: 'pending',
      next_eligible_at: 0,
      attempt_count: 1,
      published_generation: 1,
      published_renderer_version: 'faction-sheet-v1',
      published_cache_token: before?.published_cache_token,
      published_r2_etag: before?.published_r2_etag,
      published_bytes: before?.published_bytes,
      published_at: before?.published_at,
      first_publication_admitted: true,
      last_completed_batch_token: before?.last_completed_batch_token,
      last_completed_claim_token: before?.last_completed_claim_token,
    });
    expect(after?.last_error).toBeUndefined();
    await expect(
      t.run(async (ctx) =>
        ctx.db
          .query('asset_targets')
          .withIndex('by_asset_type_and_status_and_next_eligible_at', (q) =>
            q.eq('asset_type', 'faction_sheet').eq('status', 'pending')
          )
          .take(2)
      )
    ).resolves.toMatchObject([{ _id: seeded.targetId }, { _id: seeded.olderTargetId }]);
    await expect(
      t.mutation(internal.assetPublisherOperator.requeueCurrentFactionSheetCanary, {
        factionId: seeded.factionId,
      })
    ).rejects.toThrow('requires one current target');
  });

  test('canary requeue fails closed on control, ownership, and publication drift', async () => {
    const cases: Array<{
      name: string;
      configStatus?: 'active';
      stateStatus?: 'active';
      targetStatus?: 'pending';
      admitted?: false;
      desiredGeneration?: 2;
      batchToken?: string;
    }> = [
      { name: 'active controls', configStatus: 'active', stateStatus: 'active' },
      { name: 'non-current target', targetStatus: 'pending' },
      { name: 'unadmitted publication', admitted: false },
      { name: 'generation drift', desiredGeneration: 2 },
      { name: 'owned batch', batchToken: 'owned-batch-token' },
    ];

    for (const testCase of cases) {
      const t = convexTest(schema, modules);
      const factionId = await t.run(async (ctx) => {
        const ownerId = await ctx.db.insert('users', { name: testCase.name });
        const id = await ctx.db.insert('factions', {
          owner_id: ownerId,
          data: {},
          slug: testCase.name.replaceAll(' ', '-'),
          created_at: new Date(NOW).toISOString(),
          updated_at: new Date(NOW).toISOString(),
          is_deleted: false,
          group_id: null,
        });
        await ctx.db.insert('asset_type_configs', {
          asset_type: 'faction_sheet',
          status: testCase.configStatus ?? 'paused',
          active_renderer_version: 'faction-sheet-v1',
          updated_at: NOW,
        });
        await ctx.db.insert('asset_publisher_state', {
          key: 'singleton',
          status: testCase.stateStatus ?? 'paused',
          batch_token: testCase.batchToken,
          batch_lease_expires_at: testCase.batchToken ? NOW + 60_000 : undefined,
          cooldown_until: 0,
          daily_browser_utc_date: '2026-07-16',
          daily_browser_ms: 0,
          next_lane: 'foreground',
        });
        await ctx.db.insert('asset_targets', {
          faction_id: id,
          asset_type: 'faction_sheet',
          desired_generation: testCase.desiredGeneration ?? 1,
          desired_renderer_version: 'faction-sheet-v1',
          published_generation: 1,
          published_renderer_version: 'faction-sheet-v1',
          published_cache_token: 'retained-token',
          published_r2_etag: 'retained-etag',
          published_bytes: 100,
          published_at: NOW,
          first_publication_admitted: testCase.admitted ?? true,
          status: testCase.targetStatus ?? 'current',
          next_eligible_at: NOW,
          attempt_count: 1,
        });
        return id;
      });

      await expect(
        t.mutation(internal.assetPublisherOperator.requeueCurrentFactionSheetCanary, { factionId })
      ).rejects.toThrow();
      await expect(
        t.run(async (ctx) =>
          ctx.db
            .query('asset_targets')
            .withIndex('by_faction_id_and_asset_type', (q) =>
              q.eq('faction_id', factionId).eq('asset_type', 'faction_sheet')
            )
            .unique()
        )
      ).resolves.toMatchObject({ desired_generation: testCase.desiredGeneration ?? 1 });
    }
  });

  test('reconciles exact current Browser evidence without collateral state changes', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const t = convexTest(schema, modules);
    const seeded = await seedBrowserUsageReconciliation(t);
    const before = await t.run(async (ctx) => ({
      config: await ctx.db.get('asset_type_configs', seeded.configId),
      counter: await ctx.db.get('counters', seeded.counterId),
      state: await ctx.db.get('asset_publisher_state', seeded.stateId),
      target: await ctx.db.get('asset_targets', seeded.targetId),
    }));

    await expect(
      t.mutation(internal.assetPublisherOperator.reconcileCurrentBrowserUsage, reconciliationArgs)
    ).resolves.toEqual({
      status: 'reconciled',
      utcDate: '2026-07-16',
      previousDailyBrowserMs: 484_275,
      dailyBrowserMs: 120_000,
      clearedReservationBatchToken: RECONCILIATION_RESERVATION_TOKEN,
    });

    const after = await t.run(async (ctx) => ({
      config: await ctx.db.get('asset_type_configs', seeded.configId),
      counter: await ctx.db.get('counters', seeded.counterId),
      state: await ctx.db.get('asset_publisher_state', seeded.stateId),
      target: await ctx.db.get('asset_targets', seeded.targetId),
    }));
    expect(after.config).toEqual(before.config);
    expect(after.counter).toEqual(before.counter);
    expect(after.target).toEqual(before.target);
    expect(after.state).toMatchObject({
      daily_browser_utc_date: '2026-07-16',
      daily_browser_ms: 120_000,
      cooldown_until: before.state?.cooldown_until,
      last_browser_settlement_batch_token: before.state?.last_browser_settlement_batch_token,
      last_browser_settlement_ms: before.state?.last_browser_settlement_ms,
      last_browser_release_batch_token: before.state?.last_browser_release_batch_token,
      last_browser_release_mode: before.state?.last_browser_release_mode,
      next_lane: before.state?.next_lane,
    });
    expect(after.state?.browser_reservation_batch_token).toBeUndefined();
    expect(after.state?.browser_reservation_utc_date).toBeUndefined();
    expect(after.state?.browser_reserved_ms).toBeUndefined();

    await expect(
      t.mutation(internal.assetPublisherOperator.reconcileCurrentBrowserUsage, reconciliationArgs)
    ).rejects.toThrow('state does not match expected accounting');
  });

  test('reconciles the exact currently deployed 240-second reservation', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const t = convexTest(schema, modules);
    const seeded = await seedBrowserUsageReconciliation(t, currentReservationReconciliationArgs);

    await expect(
      t.mutation(
        internal.assetPublisherOperator.reconcileCurrentBrowserUsage,
        currentReservationReconciliationArgs
      )
    ).resolves.toEqual({
      status: 'reconciled',
      utcDate: '2026-07-16',
      previousDailyBrowserMs: 272_498,
      dailyBrowserMs: 120_000,
      clearedReservationBatchToken: RECONCILIATION_RESERVATION_TOKEN,
    });

    const state = await t.run(
      async (ctx) => await ctx.db.get('asset_publisher_state', seeded.stateId)
    );
    expect(state?.daily_browser_ms).toBe(120_000);
    expect(state?.browser_reservation_batch_token).toBeUndefined();
    expect(state?.browser_reservation_utc_date).toBeUndefined();
    expect(state?.browser_reserved_ms).toBeUndefined();
  });

  test('rejects an operator-supplied reservation outside the historical and current contracts', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const t = convexTest(schema, modules);
    await seedBrowserUsageReconciliation(t);

    await expect(
      t.mutation(internal.assetPublisherOperator.reconcileCurrentBrowserUsage, {
        ...reconciliationArgs,
        expectedBrowserReservedMs: 120_000,
      })
    ).rejects.toThrow('Invalid Browser usage reconciliation values');
  });

  test.each([
    ['stale accounted value', { expectedDailyBrowserMs: 484_274 }],
    [
      'stale UTC date',
      {
        expectedUtcDate: '2026-07-15',
        expectedBrowserReservationUtcDate: '2026-07-15',
      },
    ],
  ])('rejects %s without clearing the reservation', async (_name, override) => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const t = convexTest(schema, modules);
    const seeded = await seedBrowserUsageReconciliation(t);
    const before = await t.run(
      async (ctx) => await ctx.db.get('asset_publisher_state', seeded.stateId)
    );

    await expect(
      t.mutation(internal.assetPublisherOperator.reconcileCurrentBrowserUsage, {
        ...reconciliationArgs,
        ...override,
      })
    ).rejects.toThrow();
    await expect(
      t.run(async (ctx) => await ctx.db.get('asset_publisher_state', seeded.stateId))
    ).resolves.toEqual(before);
  });

  test.each([
    ['daily total', { daily_browser_ms: 484_274 }],
    ['reservation token', { browser_reservation_batch_token: 'different-reservation-token' }],
    ['reservation date', { browser_reservation_utc_date: '2026-07-15' }],
    ['reserved amount', { browser_reserved_ms: 479_999 }],
  ])('rejects drift in the stored %s', async (_name, statePatch) => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const t = convexTest(schema, modules);
    const seeded = await seedBrowserUsageReconciliation(t);
    await t.run(async (ctx) => await ctx.db.patch(seeded.stateId, statePatch));
    const before = await t.run(
      async (ctx) => await ctx.db.get('asset_publisher_state', seeded.stateId)
    );

    await expect(
      t.mutation(internal.assetPublisherOperator.reconcileCurrentBrowserUsage, reconciliationArgs)
    ).rejects.toThrow('state does not match expected accounting');
    await expect(
      t.run(async (ctx) => await ctx.db.get('asset_publisher_state', seeded.stateId))
    ).resolves.toEqual(before);
  });

  test.each([
    ['config', 'active', 'paused'],
    ['publisher singleton', 'paused', 'active'],
  ] as const)('requires paused %s control', async (_name, configStatus, stateStatus) => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const t = convexTest(schema, modules);
    const seeded = await seedBrowserUsageReconciliation(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(seeded.configId, { status: configStatus });
      await ctx.db.patch(seeded.stateId, { status: stateStatus });
    });

    await expect(
      t.mutation(internal.assetPublisherOperator.reconcileCurrentBrowserUsage, reconciliationArgs)
    ).rejects.toThrow('requires paused publisher controls');
  });

  test.each([
    'batch',
    'target claim',
    'snapshot',
  ] as const)('rejects active %s ownership without changing accounting', async (ownership) => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const t = convexTest(schema, modules);
    const seeded = await seedBrowserUsageReconciliation(t);
    await t.run(async (ctx) => {
      if (ownership === 'batch') {
        await ctx.db.patch(seeded.stateId, {
          batch_token: 'new-owned-batch-token',
          batch_lease_expires_at: NOW + 60_000,
        });
      } else if (ownership === 'target claim') {
        await ctx.db.patch(seeded.targetId, {
          status: 'leased',
          batch_token: 'new-owned-batch-token',
          claim_token: 'new-owned-claim-token',
          claimed_generation: 2,
          claimed_renderer_version: 'faction-sheet-v1',
          lease_expires_at: NOW + 60_000,
          claim_payload_hash: 'owned-payload-hash',
        });
      } else {
        await ctx.db.insert('asset_claim_snapshots', {
          target_id: seeded.targetId,
          faction_id: seeded.factionId,
          asset_type: 'faction_sheet',
          batch_token: 'new-owned-batch-token',
          claim_token: 'new-owned-claim-token',
          generation: 2,
          renderer_version: 'faction-sheet-v1',
          lease_expires_at: NOW + 60_000,
          payload_hash: 'owned-payload-hash',
          payload: {},
        });
      }
    });
    const before = await t.run(
      async (ctx) => await ctx.db.get('asset_publisher_state', seeded.stateId)
    );

    await expect(
      t.mutation(internal.assetPublisherOperator.reconcileCurrentBrowserUsage, reconciliationArgs)
    ).rejects.toThrow(
      ownership === 'batch'
        ? 'requires no owned publisher batch'
        : 'requires no owned claims or snapshots'
    );
    await expect(
      t.run(async (ctx) => await ctx.db.get('asset_publisher_state', seeded.stateId))
    ).resolves.toEqual(before);
  });

  test.each([
    ['equal value', 484_275],
    ['increased value', 500_000],
    ['negative value', -1],
    ['over allowance', 600_001],
    ['fractional value', 120_000.5],
  ])('rejects invalid replacement: %s', async (_name, replacementDailyBrowserMs) => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const t = convexTest(schema, modules);
    const seeded = await seedBrowserUsageReconciliation(t);
    const before = await t.run(
      async (ctx) => await ctx.db.get('asset_publisher_state', seeded.stateId)
    );

    await expect(
      t.mutation(internal.assetPublisherOperator.reconcileCurrentBrowserUsage, {
        ...reconciliationArgs,
        replacementDailyBrowserMs,
      })
    ).rejects.toThrow('Invalid Browser usage reconciliation values');
    await expect(
      t.run(async (ctx) => await ctx.db.get('asset_publisher_state', seeded.stateId))
    ).resolves.toEqual(before);
  });

  test.each([
    'singleton',
    'config',
  ] as const)('bounded exact-one checks reject duplicate %s drift', async (duplicateKind) => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      for (let index = 0; index < 2; index += 1) {
        if (duplicateKind === 'singleton') {
          await ctx.db.insert('asset_publisher_state', {
            key: 'singleton',
            status: 'disabled',
            cooldown_until: 0,
            daily_browser_utc_date: '2026-07-16',
            daily_browser_ms: 0,
            next_lane: 'foreground',
          });
        } else {
          await ctx.db.insert('asset_type_configs', {
            asset_type: 'faction_sheet',
            status: 'disabled',
            active_renderer_version: 'faction-sheet-v1',
            updated_at: NOW + index,
          });
        }
      }
    });

    await expect(
      t.mutation(internal.assetPublisherOperator.initializeDisabled, {})
    ).rejects.toThrow(
      duplicateKind === 'singleton'
        ? 'duplicate publisher singletons'
        : 'duplicate faction-sheet configs'
    );
  });
});

describe('asset publisher operator HTTP boundary', () => {
  test('authenticates one strict operation shape with a distinct secret and exposes no enqueue', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const keys = [
      'ASSET_PUBLISHER_ACTIVATION_SECRET',
      'ASSET_PUBLISHER_POLL_SECRET',
      'ASSET_PUBLISHER_EXECUTOR_SECRET',
      'ASSET_PUBLISHER_RENDER_CAPABILITY_SECRET',
      'ASSET_PUBLISHER_CACHE_TOKEN_SECRET',
    ] as const;
    const prior = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    process.env.ASSET_PUBLISHER_ACTIVATION_SECRET = 'activation-secret';
    process.env.ASSET_PUBLISHER_POLL_SECRET = 'poll-secret';
    process.env.ASSET_PUBLISHER_EXECUTOR_SECRET = 'executor-secret';
    process.env.ASSET_PUBLISHER_RENDER_CAPABILITY_SECRET = 'render-secret';
    process.env.ASSET_PUBLISHER_CACHE_TOKEN_SECRET = 'cache-secret';
    try {
      const t = convexTest(schema, modules);
      const post = async (body: unknown, secret = 'activation-secret') =>
        await t.fetch('/asset-publishing/operator', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${secret}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });

      expect(
        (await post({ schemaVersion: 1, operation: 'initialize' }, 'poll-secret')).status
      ).toBe(404);
      expect((await post({ schemaVersion: 1, operation: 'initialize', extra: true })).status).toBe(
        400
      );
      expect(
        (
          await post({
            schemaVersion: 1,
            operation: 'activate',
            rendererVersion: 'attacker-selected-renderer',
          })
        ).status
      ).toBe(400);
      const initialized = await post({ schemaVersion: 1, operation: 'initialize' });
      expect(initialized.status).toBe(200);
      await expect(initialized.json()).resolves.toMatchObject({
        ok: true,
        operation: 'initialize',
        configStatus: 'disabled',
        publisherStatus: 'disabled',
      });
      await expect(
        (await post({ schemaVersion: 1, operation: 'pause' })).json()
      ).resolves.toMatchObject({
        operation: 'pause',
        configStatus: 'paused',
        publisherStatus: 'paused',
      });
      await expect(
        (await post({ schemaVersion: 1, operation: 'disable' })).json()
      ).resolves.toMatchObject({
        operation: 'disable',
        configStatus: 'disabled',
        publisherStatus: 'disabled',
      });

      await recordSuccessfulPrerequisite(t);
      await expect(
        (
          await post({
            schemaVersion: 1,
            operation: 'activate',
            rendererVersion: 'faction-sheet-v3',
          })
        ).json()
      ).resolves.toMatchObject({
        operation: 'activate',
        rendererVersion: 'faction-sheet-v3',
        configStatus: 'active',
        publisherStatus: 'active',
      });

      process.env.ASSET_PUBLISHER_ACTIVATION_SECRET = 'poll-secret';
      expect((await post({ schemaVersion: 1, operation: 'pause' }, 'poll-secret')).status).toBe(
        404
      );
      expect(
        (
          await t.fetch('/asset-publishing/operator/enqueue', {
            method: 'POST',
            headers: { Authorization: 'Bearer poll-secret' },
          })
        ).status
      ).toBe(404);
      await expect(
        t.run(async (ctx) => ({
          config: await ctx.db.query('asset_type_configs').take(1),
          state: await ctx.db.query('asset_publisher_state').take(1),
        }))
      ).resolves.toMatchObject({ config: [{ status: 'active' }], state: [{ status: 'active' }] });
    } finally {
      for (const key of keys) {
        const value = prior[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});
