import { v } from 'convex/values';

import type { Doc } from './_generated/dataModel';
import { internalMutation } from './_generated/server';
import { FREE_BROWSER_ALLOWANCE_MS } from './lib/assetPublisherLimits';
import { publisherTokenSchema } from './lib/assetPublisherSchemas';
import {
  assertFirstPublicationCounterReady,
  exactPublisherStateOrNull,
  FACTION_SHEET_STORAGE_ACTIVATION_PREREQUISITE,
  FACTION_SHEET_TARGET_ACTIVATION_PREREQUISITE,
  initializeFirstPublicationCounterDisabled,
  insertDisabledPublisherState,
} from './lib/factionSheetPublicationGuard';
import {
  FACTION_SHEET_ASSET_TYPE,
  INITIAL_FACTION_SHEET_RENDERER_VERSION,
} from './lib/factionSheetTargets';
import type { MutationCtx } from './types';

const rendererValidator = v.literal(INITIAL_FACTION_SHEET_RENDERER_VERSION);
const targetPrerequisiteValidator = v.literal(FACTION_SHEET_TARGET_ACTIVATION_PREREQUISITE);
const storagePrerequisiteValidator = v.literal(FACTION_SHEET_STORAGE_ACTIVATION_PREREQUISITE);
// Freeze both evidence-backed compare-and-swap amounts. These maintenance values must not follow a
// later change to the normal acquisition reservation policy.
const HISTORICAL_BROWSER_USAGE_RECONCILIATION_RESERVATION_MS = 8 * 60 * 1_000;
const DEPLOYED_BROWSER_USAGE_RECONCILIATION_RESERVATION_MS = 4 * 60 * 1_000;

function isReconciliableBrowserReservation(value: number): boolean {
  return (
    value === HISTORICAL_BROWSER_USAGE_RECONCILIATION_RESERVATION_MS ||
    value === DEPLOYED_BROWSER_USAGE_RECONCILIATION_RESERVATION_MS
  );
}

async function exactConfigOrNull(ctx: MutationCtx) {
  const configs = await ctx.db
    .query('asset_type_configs')
    .withIndex('by_asset_type', (q) => q.eq('asset_type', FACTION_SHEET_ASSET_TYPE))
    .take(2);
  if (configs.length > 1) {
    throw new Error('Asset publisher invariant violated: duplicate faction-sheet configs');
  }
  return configs[0] ?? null;
}

async function insertDisabledConfig(ctx: MutationCtx) {
  const id = await ctx.db.insert('asset_type_configs', {
    asset_type: FACTION_SHEET_ASSET_TYPE,
    status: 'disabled',
    active_renderer_version: INITIAL_FACTION_SHEET_RENDERER_VERSION,
    updated_at: Date.now(),
  });
  const config = await ctx.db.get('asset_type_configs', id);
  if (!config) throw new Error('Failed to initialize disabled faction-sheet config');
  return config;
}

async function ensureDisabledRows(ctx: MutationCtx) {
  const [existingConfig, existingState] = await Promise.all([
    exactConfigOrNull(ctx),
    exactPublisherStateOrNull(ctx),
  ]);
  const config = existingConfig ?? (await insertDisabledConfig(ctx));
  const state = existingState ?? (await insertDisabledPublisherState(ctx));
  if (config.status === 'disabled' && state.status === 'disabled') {
    await initializeFirstPublicationCounterDisabled(ctx);
  }
  return { config, state };
}

function controlResult(
  config: Doc<'asset_type_configs'>,
  state: Doc<'asset_publisher_state'>,
  changed: boolean
) {
  return {
    assetType: FACTION_SHEET_ASSET_TYPE,
    rendererVersion: config.active_renderer_version,
    configStatus: config.status,
    publisherStatus: state.status,
    changed,
  };
}

export const initializeDisabled = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existingConfig = await exactConfigOrNull(ctx);
    const existingState = await exactPublisherStateOrNull(ctx);
    const { config, state } = await ensureDisabledRows(ctx);
    return controlResult(config, state, !existingConfig || !existingState);
  },
});

async function setStatus(ctx: MutationCtx, status: 'disabled' | 'paused') {
  const { config, state } = await ensureDisabledRows(ctx);
  const configChanged = config.status !== status;
  const stateChanged = state.status !== status;
  if (configChanged) {
    await ctx.db.patch(config._id, { status, updated_at: Date.now() });
  }
  if (stateChanged) {
    await ctx.db.patch(state._id, { status });
  }
  if (status === 'disabled') {
    await initializeFirstPublicationCounterDisabled(ctx);
  }
  return controlResult({ ...config, status }, { ...state, status }, configChanged || stateChanged);
}

export const pause = internalMutation({
  args: {},
  handler: async (ctx) => await setStatus(ctx, 'paused'),
});

export const disable = internalMutation({
  args: {},
  handler: async (ctx) => await setStatus(ctx, 'disabled'),
});

const CANARY_PRIORITY_NEXT_ELIGIBLE_AT = 0;

/**
 * One-shot maintenance operation for replacing a known current canary after a
 * renderer correction. It is intentionally internal-only and may run only
 * while both publisher controls are paused and no batch owns the singleton.
 */
export const requeueCurrentFactionSheetCanary = internalMutation({
  args: { factionId: v.id('factions') },
  handler: async (ctx, args) => {
    const [config, state] = await Promise.all([
      exactConfigOrNull(ctx),
      exactPublisherStateOrNull(ctx),
    ]);
    if (config?.status !== 'paused' || state?.status !== 'paused') {
      throw new Error('Canary requeue requires paused publisher controls');
    }
    if (state.batch_token !== undefined) {
      throw new Error('Canary requeue requires no owned publisher batch');
    }

    const targets = await ctx.db
      .query('asset_targets')
      .withIndex('by_faction_id_and_asset_type', (q) =>
        q.eq('faction_id', args.factionId).eq('asset_type', FACTION_SHEET_ASSET_TYPE)
      )
      .take(2);
    if (targets.length === 0) {
      throw new Error('Canary requeue target is missing');
    }
    if (targets.length > 1) {
      throw new Error('Canary requeue target is duplicated');
    }
    const target = targets[0];
    if (target?.status !== 'current') {
      throw new Error('Canary requeue requires one current target');
    }

    const snapshots = await ctx.db
      .query('asset_claim_snapshots')
      .withIndex('by_target_id', (q) => q.eq('target_id', target._id))
      .take(2);
    if (snapshots.length !== 0) {
      throw new Error('Canary requeue target has an unexpected claim snapshot');
    }

    const publicationIsComplete =
      target.first_publication_admitted === true &&
      Number.isSafeInteger(target.published_generation) &&
      (target.published_generation ?? 0) > 0 &&
      typeof target.published_renderer_version === 'string' &&
      target.published_renderer_version.length > 0 &&
      typeof target.published_cache_token === 'string' &&
      target.published_cache_token.length > 0 &&
      typeof target.published_r2_etag === 'string' &&
      target.published_r2_etag.length > 0 &&
      Number.isSafeInteger(target.published_bytes) &&
      (target.published_bytes ?? 0) > 0 &&
      Number.isFinite(target.published_at);
    if (!publicationIsComplete) {
      throw new Error('Canary requeue requires a complete admitted publication');
    }
    if (
      !Number.isSafeInteger(target.desired_generation) ||
      target.desired_generation < 1 ||
      target.desired_generation >= Number.MAX_SAFE_INTEGER ||
      target.desired_generation !== target.published_generation ||
      target.desired_renderer_version !== target.published_renderer_version
    ) {
      throw new Error('Canary requeue target is not exactly current');
    }

    const desiredGeneration = target.desired_generation + 1;
    await ctx.db.patch(target._id, {
      desired_generation: desiredGeneration,
      desired_renderer_version: config.active_renderer_version,
      status: 'pending',
      next_eligible_at: CANARY_PRIORITY_NEXT_ELIGIBLE_AT,
      last_error: undefined,
    });
    return {
      status: 'requeued' as const,
      targetId: target._id,
      factionId: target.faction_id,
      previousGeneration: target.desired_generation,
      desiredGeneration,
      rendererVersion: config.active_renderer_version,
      nextEligibleAt: CANARY_PRIORITY_NEXT_ELIGIBLE_AT,
    };
  },
});

function currentUtcDate() {
  return new Date(Date.now()).toISOString().slice(0, 10);
}

/**
 * One-shot reconciliation for a provider-observed Browser total after an
 * ambiguous close retained a conservative reservation. The exact comparison
 * fields make the cleared reservation a compare-and-swap, not a generic quota
 * adjustment.
 */
export const reconcileCurrentBrowserUsage = internalMutation({
  args: {
    expectedUtcDate: v.string(),
    expectedDailyBrowserMs: v.number(),
    expectedBrowserReservationBatchToken: v.string(),
    expectedBrowserReservationUtcDate: v.string(),
    expectedBrowserReservedMs: v.number(),
    replacementDailyBrowserMs: v.number(),
  },
  handler: async (ctx, args) => {
    const today = currentUtcDate();
    if (args.expectedUtcDate !== today || args.expectedBrowserReservationUtcDate !== today) {
      throw new Error('Browser usage reconciliation requires the current UTC accounting date');
    }
    if (
      !publisherTokenSchema.safeParse(args.expectedBrowserReservationBatchToken).success ||
      !Number.isSafeInteger(args.expectedDailyBrowserMs) ||
      args.expectedDailyBrowserMs < 0 ||
      !isReconciliableBrowserReservation(args.expectedBrowserReservedMs) ||
      !Number.isSafeInteger(args.replacementDailyBrowserMs) ||
      args.replacementDailyBrowserMs < 0 ||
      args.replacementDailyBrowserMs > FREE_BROWSER_ALLOWANCE_MS ||
      args.replacementDailyBrowserMs >= args.expectedDailyBrowserMs
    ) {
      throw new Error('Invalid Browser usage reconciliation values');
    }

    const [config, state] = await Promise.all([
      exactConfigOrNull(ctx),
      exactPublisherStateOrNull(ctx),
    ]);
    if (config?.status !== 'paused' || state?.status !== 'paused') {
      throw new Error('Browser usage reconciliation requires paused publisher controls');
    }
    if (state.batch_token !== undefined || state.batch_lease_expires_at !== undefined) {
      throw new Error('Browser usage reconciliation requires no owned publisher batch');
    }

    const [ownedTarget, ownedSnapshot] = await Promise.all([
      ctx.db
        .query('asset_targets')
        .withIndex('by_batch_token', (q) => q.gte('batch_token', ''))
        .first(),
      ctx.db.query('asset_claim_snapshots').withIndex('by_batch_token').first(),
    ]);
    if (ownedTarget || ownedSnapshot) {
      throw new Error('Browser usage reconciliation requires no owned claims or snapshots');
    }
    if (
      state.daily_browser_utc_date !== args.expectedUtcDate ||
      state.daily_browser_ms !== args.expectedDailyBrowserMs ||
      state.browser_reservation_batch_token !== args.expectedBrowserReservationBatchToken ||
      state.browser_reservation_utc_date !== args.expectedBrowserReservationUtcDate ||
      state.browser_reserved_ms !== args.expectedBrowserReservedMs
    ) {
      throw new Error('Browser usage reconciliation state does not match expected accounting');
    }

    await ctx.db.patch(state._id, {
      daily_browser_ms: args.replacementDailyBrowserMs,
      browser_reservation_batch_token: undefined,
      browser_reservation_utc_date: undefined,
      browser_reserved_ms: undefined,
    });
    return {
      status: 'reconciled' as const,
      utcDate: args.expectedUtcDate,
      previousDailyBrowserMs: args.expectedDailyBrowserMs,
      dailyBrowserMs: args.replacementDailyBrowserMs,
      clearedReservationBatchToken: args.expectedBrowserReservationBatchToken,
    };
  },
});

async function assertExactPrerequisite(
  ctx: MutationCtx,
  prerequisite:
    | typeof FACTION_SHEET_TARGET_ACTIVATION_PREREQUISITE
    | typeof FACTION_SHEET_STORAGE_ACTIVATION_PREREQUISITE
) {
  const rows = await ctx.db
    .query('migration_runs')
    .withIndex('by_migration_id', (q) => q.eq('migration_id', prerequisite))
    .take(2);
  if (rows.length !== 1) {
    throw new Error(`Publisher activation prerequisite is not exactly complete: ${prerequisite}`);
  }
  const [row] = rows;
  if (!row?.is_done || row.state !== 'success') {
    throw new Error(`Publisher activation prerequisite is incomplete: ${prerequisite}`);
  }
}

/**
 * Private operator transition. The authenticated HTTP boundary supplies the
 * exact renderer and both prerequisite literals; this mutation itself performs
 * no secret, Worker, Queue, or R2 work.
 */
export const activate = internalMutation({
  args: {
    expectedRendererVersion: rendererValidator,
    targetPrerequisite: targetPrerequisiteValidator,
    storagePrerequisite: storagePrerequisiteValidator,
  },
  handler: async (ctx, args) => {
    await assertExactPrerequisite(ctx, args.targetPrerequisite);
    await assertExactPrerequisite(ctx, args.storagePrerequisite);
    const { config, state } = await ensureDisabledRows(ctx);
    await assertFirstPublicationCounterReady(ctx);
    if (config.active_renderer_version !== args.expectedRendererVersion) {
      throw new Error(
        `Publisher activation renderer mismatch: expected ${args.expectedRendererVersion}`
      );
    }

    const configChanged = config.status !== 'active';
    const stateChanged = state.status !== 'active';
    if (configChanged) {
      await ctx.db.patch(config._id, {
        status: 'active',
        active_renderer_version: args.expectedRendererVersion,
        updated_at: Date.now(),
      });
    }
    if (stateChanged) {
      await ctx.db.patch(state._id, { status: 'active' });
    }
    return controlResult(
      { ...config, status: 'active', active_renderer_version: args.expectedRendererVersion },
      { ...state, status: 'active' },
      configChanged || stateChanged
    );
  },
});
