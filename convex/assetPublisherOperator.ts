import { v } from 'convex/values';

import type { Doc } from './_generated/dataModel';
import { internalMutation } from './_generated/server';
import {
  FACTION_SHEET_ASSET_TYPE,
  INITIAL_FACTION_SHEET_RENDERER_VERSION,
} from './lib/factionSheetTargets';
import type { MutationCtx } from './types';

export const FACTION_SHEET_ACTIVATION_PREREQUISITE = 'faction_sheet_targets_verify_v1' as const;

const rendererValidator = v.literal(INITIAL_FACTION_SHEET_RENDERER_VERSION);
const prerequisiteValidator = v.literal(FACTION_SHEET_ACTIVATION_PREREQUISITE);

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

async function exactPublisherStateOrNull(ctx: MutationCtx) {
  const states = await ctx.db
    .query('asset_publisher_state')
    .withIndex('by_key', (q) => q.eq('key', 'singleton'))
    .take(2);
  if (states.length > 1) {
    throw new Error('Asset publisher invariant violated: duplicate publisher singletons');
  }
  return states[0] ?? null;
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

async function insertDisabledPublisherState(ctx: MutationCtx) {
  const id = await ctx.db.insert('asset_publisher_state', {
    key: 'singleton',
    status: 'disabled',
    cooldown_until: 0,
    daily_browser_utc_date: new Date(Date.now()).toISOString().slice(0, 10),
    daily_browser_ms: 0,
    next_lane: 'foreground',
  });
  const state = await ctx.db.get('asset_publisher_state', id);
  if (!state) throw new Error('Failed to initialize disabled publisher singleton');
  return state;
}

async function ensureDisabledRows(ctx: MutationCtx) {
  const [existingConfig, existingState] = await Promise.all([
    exactConfigOrNull(ctx),
    exactPublisherStateOrNull(ctx),
  ]);
  const config = existingConfig ?? (await insertDisabledConfig(ctx));
  const state = existingState ?? (await insertDisabledPublisherState(ctx));
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

async function assertExactPrerequisite(
  ctx: MutationCtx,
  prerequisite: typeof FACTION_SHEET_ACTIVATION_PREREQUISITE
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
 * Internal integration contract for a later authenticated operator boundary:
 * callers must supply the exact renderer and prerequisite literals. This
 * mutation remains private and performs no secret, HTTP, Worker, Queue, or R2 work.
 */
export const activate = internalMutation({
  args: {
    expectedRendererVersion: rendererValidator,
    prerequisite: prerequisiteValidator,
  },
  handler: async (ctx, args) => {
    await assertExactPrerequisite(ctx, args.prerequisite);
    const { config, state } = await ensureDisabledRows(ctx);
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
