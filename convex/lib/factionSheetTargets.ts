import { FactionInputSchema } from '../../src/game/schema/faction';
import type { Id } from '../_generated/dataModel';
import { supersedeRolloutForSave } from '../assetRollouts';
import type { MutationCtx } from '../types';
import {
  FACTION_SHEET_ASSET_TYPE,
  INITIAL_FACTION_SHEET_RENDERER_VERSION,
} from './assetPublisherConstants';

export {
  CURRENT_FACTION_SHEET_RENDERER_VERSION,
  KNOWN_FACTION_SHEET_RENDERER_VERSIONS,
  type KnownFactionSheetRendererVersion,
  PREVIOUS_FACTION_SHEET_RENDERER_VERSION,
  SUPPORTED_FACTION_SHEET_RENDERER_VERSIONS,
  type SupportedFactionSheetRendererVersion,
} from './assetPublisherConstants';
export { FACTION_SHEET_ASSET_TYPE, INITIAL_FACTION_SHEET_RENDERER_VERSION };

export function parseFactionInput(input: unknown) {
  const parsed = FactionInputSchema.safeParse(input);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    const issuePath = firstIssue?.path.join('.') ?? 'data';
    const issueMessage = firstIssue?.message ?? 'Invalid faction data';
    throw new Error(`Invalid faction data at ${issuePath}: ${issueMessage}`);
  }
  return parsed.data;
}

async function factionSheetConfigs(ctx: MutationCtx) {
  return await ctx.db
    .query('asset_type_configs')
    .withIndex('by_asset_type', (q) => q.eq('asset_type', FACTION_SHEET_ASSET_TYPE))
    .take(2);
}

/**
 * Returns the singleton faction-sheet config, creating it disabled when absent.
 * The indexed range read makes concurrent first writers conflict and retry rather
 * than creating two rows. Existing configuration is never implicitly activated,
 * paused, or disabled by a faction save.
 */
export async function ensureFactionSheetConfig(ctx: MutationCtx) {
  const configs = await factionSheetConfigs(ctx);
  if (configs.length > 1) {
    throw new Error('Asset publisher invariant violated: duplicate faction-sheet configs');
  }
  if (configs[0]) return configs[0];

  const now = Date.now();
  const configId = await ctx.db.insert('asset_type_configs', {
    asset_type: FACTION_SHEET_ASSET_TYPE,
    status: 'disabled',
    active_renderer_version: INITIAL_FACTION_SHEET_RENDERER_VERSION,
    updated_at: now,
  });
  const config = await ctx.db.get('asset_type_configs', configId);
  if (!config) throw new Error('Failed to seed disabled faction-sheet publisher config');
  return config;
}

async function factionSheetTargets(ctx: MutationCtx, factionId: Id<'factions'>) {
  return await ctx.db
    .query('asset_targets')
    .withIndex('by_faction_id_and_asset_type', (q) =>
      q.eq('faction_id', factionId).eq('asset_type', FACTION_SHEET_ASSET_TYPE)
    )
    .take(2);
}

function exactlyOneTargetOrNull(
  targets: Awaited<ReturnType<typeof factionSheetTargets>>,
  factionId: Id<'factions'>
) {
  if (targets.length > 1) {
    throw new Error(
      `Asset publisher invariant violated: duplicate faction-sheet targets for ${factionId}`
    );
  }
  return targets[0] ?? null;
}

/** Reconcile one successful render-relevant save into the same Convex transaction. */
export async function reconcileFactionSheetTargetForSave(
  ctx: MutationCtx,
  factionId: Id<'factions'>
) {
  const config = await ensureFactionSheetConfig(ctx);
  const target = exactlyOneTargetOrNull(await factionSheetTargets(ctx, factionId), factionId);
  const now = Date.now();

  if (!target) {
    return await ctx.db.insert('asset_targets', {
      faction_id: factionId,
      asset_type: FACTION_SHEET_ASSET_TYPE,
      desired_generation: 1,
      desired_renderer_version: config.active_renderer_version,
      status: 'pending',
      consecutive_render_failures: 0,
      work_lane: 'foreground',
      foreground_updated_at: now,
    });
  }

  await supersedeRolloutForSave(ctx, target, now);
  await ctx.db.patch(target._id, {
    desired_generation: target.desired_generation + 1,
    desired_renderer_version: config.active_renderer_version,
    work_lane: 'foreground',
    rollout_id: undefined,
    rollout_item_id: undefined,
    foreground_updated_at: now,
    consecutive_render_failures: 0,
    last_error: undefined,
    next_eligible_at: undefined,
    attempt_count: undefined,
    first_publication_admitted: undefined,
    ...(target.status === 'leased'
      ? {}
      : {
          status: 'pending' as const,
        }),
  });
  return target._id;
}

/** Idempotently create the target required by the active-faction backfill. */
export async function ensureFactionSheetTargetForBackfill(
  ctx: MutationCtx,
  factionId: Id<'factions'>
) {
  const config = await ensureFactionSheetConfig(ctx);
  const target = exactlyOneTargetOrNull(await factionSheetTargets(ctx, factionId), factionId);
  if (target) return target._id;

  return await ctx.db.insert('asset_targets', {
    faction_id: factionId,
    asset_type: FACTION_SHEET_ASSET_TYPE,
    desired_generation: 1,
    desired_renderer_version: config.active_renderer_version,
    status: 'pending',
    consecutive_render_failures: 0,
    work_lane: 'foreground',
    foreground_updated_at: Date.now(),
  });
}

/** Verification pass postcondition for a single active faction. */
export async function assertExactlyOneFactionSheetTarget(
  ctx: MutationCtx,
  factionId: Id<'factions'>
) {
  const targets = await factionSheetTargets(ctx, factionId);
  if (targets.length === 0) {
    throw new Error(`Faction-sheet target verification failed: missing target for ${factionId}`);
  }
  if (targets.length > 1) {
    throw new Error(`Faction-sheet target verification failed: duplicate targets for ${factionId}`);
  }
}
