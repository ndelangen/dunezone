import { v } from 'convex/values';

import type { Doc } from './_generated/dataModel';
import { internalMutation } from './_generated/server';
import {
  CURRENT_FACTION_SHEET_RENDERER_VERSION,
  FACTION_SHEET_ASSET_TYPE,
  FACTION_SHEET_TARGET_ACTIVATION_PREREQUISITE,
  INITIAL_FACTION_SHEET_RENDERER_VERSION,
  PREVIOUS_FACTION_SHEET_RENDERER_VERSION,
} from './lib/assetPublisherConstants';
import type { MutationCtx } from './types';

const rendererValidator = v.union(
  v.literal(INITIAL_FACTION_SHEET_RENDERER_VERSION),
  v.literal(PREVIOUS_FACTION_SHEET_RENDERER_VERSION),
  v.literal(CURRENT_FACTION_SHEET_RENDERER_VERSION)
);

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

async function ensureConfig(ctx: MutationCtx) {
  return (await exactConfigOrNull(ctx)) ?? (await insertDisabledConfig(ctx));
}

function controlResult(config: Doc<'asset_type_configs'>, changed: boolean) {
  return {
    assetType: FACTION_SHEET_ASSET_TYPE,
    rendererVersion: config.active_renderer_version,
    status: config.status,
    changed,
  };
}

export const initializeDisabled = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existing = await exactConfigOrNull(ctx);
    const config = existing ?? (await insertDisabledConfig(ctx));
    return controlResult(config, !existing);
  },
});

async function setStatus(ctx: MutationCtx, status: 'disabled' | 'paused') {
  const config = await ensureConfig(ctx);
  const changed = config.status !== status;
  if (changed) await ctx.db.patch(config._id, { status, updated_at: Date.now() });
  return controlResult({ ...config, status }, changed);
}

export const pause = internalMutation({
  args: {},
  handler: async (ctx) => await setStatus(ctx, 'paused'),
});

export const disable = internalMutation({
  args: {},
  handler: async (ctx) => await setStatus(ctx, 'disabled'),
});

async function assertExactPrerequisite(ctx: MutationCtx, prerequisite: string) {
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

/** `asset_type_configs` is the sole publisher activation and renderer authority. */
export const activate = internalMutation({
  args: { rendererVersion: rendererValidator },
  handler: async (ctx, args) => {
    await assertExactPrerequisite(ctx, FACTION_SHEET_TARGET_ACTIVATION_PREREQUISITE);
    const config = await ensureConfig(ctx);
    const changed =
      config.status !== 'active' || config.active_renderer_version !== args.rendererVersion;
    if (changed) {
      await ctx.db.patch(config._id, {
        status: 'active',
        active_renderer_version: args.rendererVersion,
        updated_at: Date.now(),
      });
    }
    return controlResult(
      { ...config, status: 'active', active_renderer_version: args.rendererVersion },
      changed
    );
  },
});
