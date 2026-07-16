/// <reference types="vite/client" />
// @vitest-environment edge-runtime

import { convexTest } from 'convex-test';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');
const NOW = Date.parse('2026-07-16T12:00:00.000Z');
const activationArgs = {
  expectedRendererVersion: 'faction-sheet-v1' as const,
  targetPrerequisite: 'faction_sheet_targets_verify_v1' as const,
  storagePrerequisite: 'faction_sheet_publication_admissions_v1' as const,
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

  test('activation rejects a stale renderer without creating or changing singleton state', async () => {
    const t = convexTest(schema, modules);
    await recordSuccessfulPrerequisite(t);
    await t.run(async (ctx) => {
      await ctx.db.insert('asset_type_configs', {
        asset_type: 'faction_sheet',
        status: 'disabled',
        active_renderer_version: 'stale-renderer',
        updated_at: NOW,
      });
    });

    await expect(
      t.mutation(internal.assetPublisherOperator.activate, activationArgs)
    ).rejects.toThrow('renderer mismatch');
    await expect(
      t.run(async (ctx) => ({
        configs: await ctx.db.query('asset_type_configs').take(2),
        states: await ctx.db.query('asset_publisher_state').take(1),
      }))
    ).resolves.toMatchObject({
      configs: [{ status: 'disabled', active_renderer_version: 'stale-renderer' }],
      states: [],
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
        active_renderer_version: 'faction-sheet-v1',
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
      rendererVersion: 'faction-sheet-v1',
      nextEligibleAt: 0,
    });

    const after = await t.run(async (ctx) => await ctx.db.get('asset_targets', seeded.targetId));
    expect(after).toMatchObject({
      desired_generation: 2,
      desired_renderer_version: 'faction-sheet-v1',
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
            expectedRendererVersion: 'attacker-selected-renderer',
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
        (await post({ schemaVersion: 1, operation: 'activate' })).json()
      ).resolves.toMatchObject({
        operation: 'activate',
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
