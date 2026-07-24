import { v } from 'convex/values';

import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { internalMutation, internalQuery } from './_generated/server';
import {
  CURRENT_FACTION_SHEET_RENDERER_VERSION,
  FACTION_SHEET_ASSET_TYPE,
  INITIAL_FACTION_SHEET_RENDERER_VERSION,
  isKnownFactionSheetRendererVersion,
  LEGACY_FACTION_SHEET_RENDERER_VERSION,
  MAX_PUBLISHER_ITEMS,
  PREVIOUS_FACTION_SHEET_RENDERER_VERSION,
} from './lib/assetPublisherConstants';
import type { MutationCtx, QueryCtx } from './types';

const ROLLOUT_DISCOVERY_PAGE_SIZE = 50;
const ROLLOUT_CLEANUP_PAGE_SIZE = 50;
const MAX_ROLLOUT_ATTEMPTS = 3;

const rendererValidator = v.union(
  v.literal(INITIAL_FACTION_SHEET_RENDERER_VERSION),
  v.literal(LEGACY_FACTION_SHEET_RENDERER_VERSION),
  v.literal(PREVIOUS_FACTION_SHEET_RENDERER_VERSION),
  v.literal(CURRENT_FACTION_SHEET_RENDERER_VERSION)
);

type RolloutStatus = Doc<'asset_rollouts'>['status'];
type RolloutItemState = Doc<'asset_rollout_items'>['state'];
type ReadCtx = Pick<QueryCtx, 'db'>;

const NONTERMINAL_STATUSES = [
  'discovering',
  'running',
  'paused',
  'cancelling',
] as const satisfies readonly RolloutStatus[];

function isNonterminal(status: RolloutStatus): boolean {
  return NONTERMINAL_STATUSES.includes(status as (typeof NONTERMINAL_STATUSES)[number]);
}

function supportedRenderer(version: string): boolean {
  return isKnownFactionSheetRendererVersion(version);
}

async function exactConfig(ctx: ReadCtx) {
  const rows = await ctx.db
    .query('asset_type_configs')
    .withIndex('by_asset_type', (q) => q.eq('asset_type', FACTION_SHEET_ASSET_TYPE))
    .take(2);
  if (rows.length !== 1) {
    throw new Error(`Expected exactly one faction-sheet config, found ${rows.length}`);
  }
  return rows[0];
}

async function exactRolloutItem(
  ctx: ReadCtx,
  rolloutId: Id<'asset_rollouts'>,
  targetId: Id<'asset_targets'>
) {
  const rows = await ctx.db
    .query('asset_rollout_items')
    .withIndex('by_rollout_id_and_target_id', (q) =>
      q.eq('rollout_id', rolloutId).eq('target_id', targetId)
    )
    .take(2);
  if (rows.length > 1) throw new Error('Duplicate rollout membership');
  return rows[0] ?? null;
}

function counterPatch(
  rollout: Doc<'asset_rollouts'>,
  from: RolloutItemState | null,
  to: RolloutItemState
) {
  const patch: Record<string, number> = { updated_at: Date.now() };
  if (from) patch[from === 'terminal_error' ? 'terminal_errors' : from] = -1;
  patch[to === 'terminal_error' ? 'terminal_errors' : to] =
    (patch[to === 'terminal_error' ? 'terminal_errors' : to] ?? 0) + 1;

  const result: Record<string, number> = { updated_at: patch.updated_at };
  for (const [field, delta] of Object.entries(patch)) {
    if (field === 'updated_at') continue;
    const current = rollout[field as keyof Doc<'asset_rollouts'>];
    if (typeof current !== 'number' || current + delta < 0) {
      throw new Error(`Invalid rollout counter transition for ${field}`);
    }
    result[field] = current + delta;
  }
  return result;
}

async function clearActiveRolloutPointer(ctx: MutationCtx, rollout: Doc<'asset_rollouts'>) {
  const config = await exactConfig(ctx);
  if (config.active_rollout_id === rollout._id) {
    await ctx.db.patch(config._id, { active_rollout_id: undefined, updated_at: Date.now() });
  }
}

async function maybeFinalizeRollout(ctx: MutationCtx, rolloutId: Id<'asset_rollouts'>) {
  const rollout = await ctx.db.get('asset_rollouts', rolloutId);
  if (rollout?.pending !== 0 || rollout.leased !== 0) return rollout;

  let terminalStatus: 'cancelled' | 'completed' | 'completed_with_errors' | null = null;
  if (rollout.status === 'cancelling') {
    terminalStatus = 'cancelled';
  } else if (rollout.status === 'running' && rollout.discovery_sealed_at !== undefined) {
    terminalStatus = rollout.terminal_errors === 0 ? 'completed' : 'completed_with_errors';
  }
  if (!terminalStatus) return rollout;

  const updated = { ...rollout, status: terminalStatus, updated_at: Date.now() };
  await ctx.db.patch(rollout._id, {
    status: terminalStatus,
    updated_at: updated.updated_at,
  });
  await clearActiveRolloutPointer(ctx, updated);
  return updated;
}

async function assertNoOtherNonterminalRollout(ctx: MutationCtx) {
  const config = await exactConfig(ctx);
  if (config.active_rollout_id) {
    const active = await ctx.db.get('asset_rollouts', config.active_rollout_id);
    if (active && isNonterminal(active.status)) {
      throw new Error('A nonterminal faction-sheet rollout already exists');
    }
    await ctx.db.patch(config._id, { active_rollout_id: undefined, updated_at: Date.now() });
  }

  for (const status of NONTERMINAL_STATUSES) {
    const existing = await ctx.db
      .query('asset_rollouts')
      .withIndex('by_asset_type_and_status', (q) =>
        q.eq('asset_type', FACTION_SHEET_ASSET_TYPE).eq('status', status)
      )
      .take(1);
    if (existing[0]) {
      throw new Error('A nonterminal rollout exists without the config ownership pointer');
    }
  }
  return config;
}

async function insertPausedRollout(
  ctx: MutationCtx,
  targetRendererVersion: string,
  rollbackOfRolloutId?: Id<'asset_rollouts'>
) {
  if (!supportedRenderer(targetRendererVersion)) {
    throw new Error('Renderer is not supported by the embedded Worker compatibility contract');
  }
  const config = await assertNoOtherNonterminalRollout(ctx);
  const now = Date.now();
  const rolloutId = await ctx.db.insert('asset_rollouts', {
    asset_type: FACTION_SHEET_ASSET_TYPE,
    target_renderer_version: targetRendererVersion,
    ...(rollbackOfRolloutId ? { rollback_of_rollout_id: rollbackOfRolloutId } : {}),
    status: 'paused',
    cutoff_creation_time: now,
    discovery_pages: 0,
    discovery_continuations: 0,
    discovered: 0,
    pending: 0,
    leased: 0,
    succeeded: 0,
    superseded: 0,
    cancelled: 0,
    terminal_errors: 0,
    created_at: now,
    updated_at: now,
  });
  const inserted = await ctx.db.get('asset_rollouts', rolloutId);
  if (!inserted) throw new Error('Failed to read created rollout');
  // Use Convex's ordered database creation clock, not a wall-clock millisecond. This keeps the
  // cutoff exact even when many targets and the rollout are inserted inside one millisecond.
  await ctx.db.patch(rolloutId, { cutoff_creation_time: inserted._creationTime });
  await ctx.db.patch(config._id, { active_rollout_id: rolloutId, updated_at: now });
  return await ctx.db.get('asset_rollouts', rolloutId);
}

export const normalizeRolloutId = internalQuery({
  args: { rolloutId: v.string() },
  handler: async (ctx, args) => ctx.db.normalizeId('asset_rollouts', args.rolloutId),
});

export const createPaused = internalMutation({
  args: { targetRendererVersion: rendererValidator },
  handler: async (ctx, args) => {
    const config = await exactConfig(ctx);
    if (config.active_rollout_id) {
      const existing = await ctx.db.get('asset_rollouts', config.active_rollout_id);
      if (
        existing?.status === 'paused' &&
        existing.target_renderer_version === args.targetRendererVersion &&
        existing.rollback_of_rollout_id === undefined &&
        existing.discovered === 0
      ) {
        return projectRollout(existing);
      }
    }
    const rollout = await insertPausedRollout(ctx, args.targetRendererVersion);
    if (!rollout) throw new Error('Failed to create rollout');
    return projectRollout(rollout);
  },
});

export const createRollback = internalMutation({
  args: {
    rollbackOfRolloutId: v.id('asset_rollouts'),
    targetRendererVersion: rendererValidator,
  },
  handler: async (ctx, args) => {
    const prior = await ctx.db.get('asset_rollouts', args.rollbackOfRolloutId);
    if (!prior || isNonterminal(prior.status)) {
      throw new Error('Rollback source must be a terminal rollout');
    }
    const config = await exactConfig(ctx);
    if (config.active_rollout_id) {
      const existing = await ctx.db.get('asset_rollouts', config.active_rollout_id);
      if (
        existing?.status === 'paused' &&
        existing.target_renderer_version === args.targetRendererVersion &&
        existing.rollback_of_rollout_id === args.rollbackOfRolloutId &&
        existing.discovered === 0
      ) {
        return projectRollout(existing);
      }
    }
    const rollout = await insertPausedRollout(
      ctx,
      args.targetRendererVersion,
      args.rollbackOfRolloutId
    );
    if (!rollout) throw new Error('Failed to create rollback rollout');
    return projectRollout(rollout);
  },
});

export const resume = internalMutation({
  args: { rolloutId: v.id('asset_rollouts') },
  handler: async (ctx, args) => {
    const rollout = await ctx.db.get('asset_rollouts', args.rolloutId);
    if (!rollout) throw new Error('Rollout not found');
    if (!isNonterminal(rollout.status) || rollout.status === 'cancelling') {
      return projectRollout(rollout);
    }
    if (rollout.status === 'discovering' || rollout.status === 'running') {
      return projectRollout(rollout);
    }
    const status = rollout.discovery_sealed_at === undefined ? 'discovering' : 'running';
    const updatedAt = Date.now();
    await ctx.db.patch(rollout._id, { status, updated_at: updatedAt });
    if (status === 'discovering') {
      await ctx.scheduler.runAfter(0, internal.assetRollouts.discoverPage, {
        rolloutId: rollout._id,
      });
    } else {
      await maybeFinalizeRollout(ctx, rollout._id);
    }
    const updated = await ctx.db.get('asset_rollouts', rollout._id);
    if (!updated) throw new Error('Rollout disappeared');
    return projectRollout(updated);
  },
});

export const pause = internalMutation({
  args: { rolloutId: v.id('asset_rollouts') },
  handler: async (ctx, args) => {
    const rollout = await ctx.db.get('asset_rollouts', args.rolloutId);
    if (!rollout) throw new Error('Rollout not found');
    if (rollout.status !== 'discovering' && rollout.status !== 'running') {
      return projectRollout(rollout);
    }
    const updatedAt = Date.now();
    await ctx.db.patch(rollout._id, { status: 'paused', updated_at: updatedAt });
    return projectRollout({ ...rollout, status: 'paused', updated_at: updatedAt });
  },
});

export const cancel = internalMutation({
  args: { rolloutId: v.id('asset_rollouts') },
  handler: async (ctx, args) => {
    const rollout = await ctx.db.get('asset_rollouts', args.rolloutId);
    if (!rollout) throw new Error('Rollout not found');
    if (!isNonterminal(rollout.status)) return projectRollout(rollout);
    if (rollout.status !== 'cancelling') {
      const updatedAt = Date.now();
      await ctx.db.patch(rollout._id, {
        status: 'cancelling',
        discovery_cursor: undefined,
        discovery_sealed_at: rollout.discovery_sealed_at ?? updatedAt,
        updated_at: updatedAt,
      });
    }
    await ctx.scheduler.runAfter(0, internal.assetRollouts.cancelPage, {
      rolloutId: rollout._id,
    });
    const updated = await ctx.db.get('asset_rollouts', rollout._id);
    if (!updated) throw new Error('Rollout disappeared');
    return projectRollout(updated);
  },
});

function exactCurrentPublication(target: Doc<'asset_targets'>): boolean {
  return (
    target.status === 'current' &&
    target.published_generation !== undefined &&
    target.published_renderer_version !== undefined &&
    target.desired_generation === target.published_generation &&
    target.desired_renderer_version === target.published_renderer_version
  );
}

export const discoverPage = internalMutation({
  args: { rolloutId: v.id('asset_rollouts') },
  handler: async (ctx, args) => {
    const rollout = await ctx.db.get('asset_rollouts', args.rolloutId);
    if (rollout?.status !== 'discovering') return { status: 'stopped' as const };

    const page = await ctx.db
      .query('asset_targets')
      .withIndex('by_asset_type', (q) =>
        q
          .eq('asset_type', FACTION_SHEET_ASSET_TYPE)
          .lte('_creationTime', rollout.cutoff_creation_time)
      )
      .paginate({
        numItems: ROLLOUT_DISCOVERY_PAGE_SIZE,
        cursor: rollout.discovery_cursor ?? null,
      });

    const counts = {
      discovered: rollout.discovered,
      pending: rollout.pending,
      succeeded: rollout.succeeded,
      superseded: rollout.superseded,
    };
    for (const target of page.page) {
      const existing = await exactRolloutItem(ctx, rollout._id, target._id);
      if (existing) continue;
      const faction = await ctx.db.get('factions', target.faction_id);
      if (!faction || faction.is_deleted) continue;

      const now = Date.now();
      let state: 'pending' | 'succeeded' | 'superseded';
      if (
        exactCurrentPublication(target) &&
        target.published_renderer_version === rollout.target_renderer_version
      ) {
        state = 'succeeded';
      } else if (
        !exactCurrentPublication(target) ||
        target.status === 'leased' ||
        (target.foreground_updated_at ?? 0) > rollout.cutoff_creation_time ||
        target.desired_renderer_version === rollout.target_renderer_version
      ) {
        state = 'superseded';
      } else {
        state = 'pending';
      }

      const itemId = await ctx.db.insert('asset_rollout_items', {
        rollout_id: rollout._id,
        target_id: target._id,
        enrolled_generation: target.desired_generation,
        enrolled_renderer_version: rollout.target_renderer_version,
        ...(target.published_renderer_version
          ? { previous_renderer_version: target.published_renderer_version }
          : {}),
        state,
        retry_count: 0,
        next_eligible_at: now,
        created_at: now,
        updated_at: now,
      });
      counts.discovered += 1;
      counts[state] += 1;
      if (state === 'pending') {
        await ctx.db.patch(target._id, {
          desired_renderer_version: rollout.target_renderer_version,
          status: 'pending',
          last_error: undefined,
          work_lane: 'rollout',
          rollout_id: rollout._id,
          rollout_item_id: itemId,
        });
      }
    }

    const now = Date.now();
    await ctx.db.patch(rollout._id, {
      ...counts,
      discovery_pages: rollout.discovery_pages + 1,
      discovery_continuations: rollout.discovery_continuations + (page.isDone ? 0 : 1),
      discovery_cursor: page.isDone ? undefined : page.continueCursor,
      ...(page.isDone ? { discovery_sealed_at: now, status: 'running' as const } : {}),
      updated_at: now,
    });
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.assetRollouts.discoverPage, {
        rolloutId: rollout._id,
      });
    } else {
      await maybeFinalizeRollout(ctx, rollout._id);
    }
    return {
      status: page.isDone ? ('sealed' as const) : ('continued' as const),
      pageSize: page.page.length,
      discovered: counts.discovered,
    };
  },
});

function restoreTargetAfterRollout(
  target: Doc<'asset_targets'>,
  item: Doc<'asset_rollout_items'>,
  _now: number
) {
  const restoredRenderer =
    item.previous_renderer_version ??
    target.published_renderer_version ??
    target.desired_renderer_version;
  const isCurrent =
    target.published_generation === target.desired_generation &&
    target.published_renderer_version === restoredRenderer;
  return {
    desired_renderer_version: restoredRenderer,
    status: isCurrent ? ('current' as const) : ('pending' as const),
    last_error: undefined,
    work_lane: 'foreground' as const,
    rollout_id: undefined,
    rollout_item_id: undefined,
    claim_token: undefined,
    claimed_generation: undefined,
    claimed_renderer_version: undefined,
    lease_expires_at: undefined,
  };
}

async function cancelOneItem(
  ctx: MutationCtx,
  rollout: Doc<'asset_rollouts'>,
  item: Doc<'asset_rollout_items'>
) {
  if (item.state !== 'pending') return rollout;
  const target = await ctx.db.get('asset_targets', item.target_id);
  const now = Date.now();
  if (
    target?.rollout_id === rollout._id &&
    target.rollout_item_id === item._id &&
    target.status !== 'leased'
  ) {
    await ctx.db.patch(target._id, restoreTargetAfterRollout(target, item, now));
  }
  await ctx.db.patch(item._id, { state: 'cancelled', updated_at: now, last_error: undefined });
  const updated = { ...rollout, ...counterPatch(rollout, 'pending', 'cancelled') };
  await ctx.db.patch(rollout._id, counterPatch(rollout, 'pending', 'cancelled'));
  return updated;
}

export const cancelPage = internalMutation({
  args: { rolloutId: v.id('asset_rollouts') },
  handler: async (ctx, args) => {
    let rollout = await ctx.db.get('asset_rollouts', args.rolloutId);
    if (rollout?.status !== 'cancelling') return { status: 'stopped' as const };
    const rolloutId = rollout._id;
    const now = Date.now();
    const expiredTargets = await ctx.db
      .query('asset_targets')
      .withIndex('by_type_lane_status_lease', (q) =>
        q
          .eq('asset_type', FACTION_SHEET_ASSET_TYPE)
          .eq('work_lane', 'rollout')
          .eq('status', 'leased')
          .lte('lease_expires_at', now)
      )
      .take(ROLLOUT_CLEANUP_PAGE_SIZE);
    for (const target of expiredTargets) {
      if (target.rollout_id !== rolloutId) continue;
      await recoverExpiredRolloutClaim(ctx, target, now);
    }
    rollout = (await ctx.db.get('asset_rollouts', rolloutId)) ?? rollout;
    const remainingCapacity = ROLLOUT_CLEANUP_PAGE_SIZE - expiredTargets.length;
    const items =
      remainingCapacity === 0
        ? []
        : await ctx.db
            .query('asset_rollout_items')
            .withIndex('by_rollout_id_and_state_and_next_eligible_at', (q) =>
              q.eq('rollout_id', rolloutId).eq('state', 'pending')
            )
            .take(remainingCapacity);
    for (const item of items) rollout = await cancelOneItem(ctx, rollout, item);

    if (items.length + expiredTargets.length === ROLLOUT_CLEANUP_PAGE_SIZE) {
      await ctx.scheduler.runAfter(0, internal.assetRollouts.cancelPage, {
        rolloutId: rollout._id,
      });
    } else {
      const finalized = await maybeFinalizeRollout(ctx, rollout._id);
      if (finalized?.status === 'cancelling' && finalized.leased > 0) {
        const earliestLease = await ctx.db
          .query('asset_targets')
          .withIndex('by_type_lane_status_lease', (q) =>
            q
              .eq('asset_type', FACTION_SHEET_ASSET_TYPE)
              .eq('work_lane', 'rollout')
              .eq('status', 'leased')
          )
          .first();
        if (!earliestLease?.lease_expires_at) {
          throw new Error('Cancelling rollout has leased count without an owned target');
        }
        await ctx.scheduler.runAfter(
          Math.max(0, earliestLease.lease_expires_at - Date.now() + 1),
          internal.assetRollouts.cancelPage,
          { rolloutId: rollout._id }
        );
      }
    }
    return {
      status: 'processed' as const,
      pendingCount: items.length,
      expiredLeaseCount: expiredTargets.length,
    };
  },
});

export async function firstEligibleRolloutTarget(ctx: ReadCtx, now: number) {
  const config = await exactConfig(ctx);
  if (!config.active_rollout_id) return null;
  const rollout = await ctx.db.get('asset_rollouts', config.active_rollout_id);
  if (rollout?.status !== 'running') return null;
  const targets = await ctx.db
    .query('asset_targets')
    .withIndex('by_asset_type_and_work_lane_and_status', (q) =>
      q
        .eq('asset_type', FACTION_SHEET_ASSET_TYPE)
        .eq('work_lane', 'rollout')
        .eq('status', 'pending')
    )
    .take(MAX_PUBLISHER_ITEMS);
  for (const target of targets) {
    if (target.rollout_id !== rollout._id || !target.rollout_item_id) continue;
    const item = await ctx.db.get('asset_rollout_items', target.rollout_item_id);
    if (
      item?.state === 'pending' &&
      item.rollout_id === rollout._id &&
      item.next_eligible_at <= now
    ) {
      return target;
    }
  }
  const expired = await ctx.db
    .query('asset_targets')
    .withIndex('by_type_lane_status_lease', (q) =>
      q
        .eq('asset_type', FACTION_SHEET_ASSET_TYPE)
        .eq('work_lane', 'rollout')
        .eq('status', 'leased')
        .lte('lease_expires_at', now)
    )
    .take(1);
  return expired[0] ?? null;
}

export async function markRolloutClaimed(
  ctx: MutationCtx,
  target: Doc<'asset_targets'>,
  now: number
) {
  if (!target.rollout_id || !target.rollout_item_id) return;
  const [rollout, item] = await Promise.all([
    ctx.db.get('asset_rollouts', target.rollout_id),
    ctx.db.get('asset_rollout_items', target.rollout_item_id),
  ]);
  if (
    rollout?.status !== 'running' ||
    !item ||
    item.rollout_id !== rollout._id ||
    item.target_id !== target._id ||
    item.state !== 'pending'
  ) {
    throw new Error('Rollout claim ownership is inconsistent');
  }
  await ctx.db.patch(item._id, { state: 'leased', updated_at: now });
  await ctx.db.patch(rollout._id, counterPatch(rollout, 'pending', 'leased'));
}

export async function recoverExpiredRolloutClaim(
  ctx: MutationCtx,
  target: Doc<'asset_targets'>,
  now: number
) {
  if (!target.rollout_id || !target.rollout_item_id) return false;
  const [rollout, item] = await Promise.all([
    ctx.db.get('asset_rollouts', target.rollout_id),
    ctx.db.get('asset_rollout_items', target.rollout_item_id),
  ]);
  if (!rollout || !item || item.state !== 'leased') return false;
  if (rollout.status === 'cancelling') {
    await ctx.db.patch(target._id, restoreTargetAfterRollout(target, item, now));
    await ctx.db.patch(item._id, { state: 'cancelled', updated_at: now });
    await ctx.db.patch(rollout._id, counterPatch(rollout, 'leased', 'cancelled'));
    await maybeFinalizeRollout(ctx, rollout._id);
    return true;
  }
  await ctx.db.patch(item._id, { state: 'pending', next_eligible_at: now, updated_at: now });
  await ctx.db.patch(rollout._id, counterPatch(rollout, 'leased', 'pending'));
  return false;
}

export async function supersedeRolloutForSave(
  ctx: MutationCtx,
  target: Doc<'asset_targets'>,
  now: number
) {
  if (!target.rollout_id || !target.rollout_item_id) return;
  const [rollout, item] = await Promise.all([
    ctx.db.get('asset_rollouts', target.rollout_id),
    ctx.db.get('asset_rollout_items', target.rollout_item_id),
  ]);
  if (
    !rollout ||
    !item ||
    item.rollout_id !== rollout._id ||
    item.target_id !== target._id ||
    (item.state !== 'pending' && item.state !== 'leased')
  ) {
    throw new Error('Save found inconsistent rollout ownership');
  }
  await ctx.db.patch(item._id, { state: 'superseded', updated_at: now, last_error: undefined });
  await ctx.db.patch(rollout._id, counterPatch(rollout, item.state, 'superseded'));
  await maybeFinalizeRollout(ctx, rollout._id);
}

export async function completeRolloutItem(
  ctx: MutationCtx,
  target: Doc<'asset_targets'>,
  now: number
) {
  if (!target.rollout_id || !target.rollout_item_id) return;
  const [rollout, item] = await Promise.all([
    ctx.db.get('asset_rollouts', target.rollout_id),
    ctx.db.get('asset_rollout_items', target.rollout_item_id),
  ]);
  if (!rollout || !item || item.state !== 'leased') {
    throw new Error('Rollout completion ownership is inconsistent');
  }
  await ctx.db.patch(item._id, { state: 'succeeded', updated_at: now, last_error: undefined });
  await ctx.db.patch(rollout._id, counterPatch(rollout, 'leased', 'succeeded'));
  await maybeFinalizeRollout(ctx, rollout._id);
}

export async function failRolloutItem(
  ctx: MutationCtx,
  target: Doc<'asset_targets'>,
  error: string,
  nextEligibleAt: number,
  now: number,
  forceTerminal = false
): Promise<'not_rollout' | 'retry' | 'detached'> {
  if (!target.rollout_id || !target.rollout_item_id) return 'not_rollout';
  const [rollout, item] = await Promise.all([
    ctx.db.get('asset_rollouts', target.rollout_id),
    ctx.db.get('asset_rollout_items', target.rollout_item_id),
  ]);
  if (!rollout || !item || item.state !== 'leased') {
    throw new Error('Rollout failure ownership is inconsistent');
  }
  if (rollout.status === 'cancelling') {
    await ctx.db.patch(target._id, restoreTargetAfterRollout(target, item, now));
    await ctx.db.patch(item._id, { state: 'cancelled', updated_at: now, last_error: undefined });
    await ctx.db.patch(rollout._id, counterPatch(rollout, 'leased', 'cancelled'));
    await maybeFinalizeRollout(ctx, rollout._id);
    return 'detached';
  }
  const retryCount = item.retry_count + 1;
  if (forceTerminal || retryCount >= MAX_ROLLOUT_ATTEMPTS) {
    await ctx.db.patch(target._id, restoreTargetAfterRollout(target, item, now));
    await ctx.db.patch(item._id, {
      state: 'terminal_error',
      retry_count: retryCount,
      last_error: error,
      updated_at: now,
    });
    await ctx.db.patch(rollout._id, counterPatch(rollout, 'leased', 'terminal_error'));
    await maybeFinalizeRollout(ctx, rollout._id);
    return 'detached';
  }
  await ctx.db.patch(item._id, {
    state: 'pending',
    retry_count: retryCount,
    next_eligible_at: nextEligibleAt,
    last_error: error,
    updated_at: now,
  });
  await ctx.db.patch(rollout._id, counterPatch(rollout, 'leased', 'pending'));
  return 'retry';
}

function projectRollout(rollout: Doc<'asset_rollouts'>) {
  return {
    rolloutId: rollout._id,
    assetType: rollout.asset_type,
    targetRendererVersion: rollout.target_renderer_version,
    rollbackOfRolloutId: rollout.rollback_of_rollout_id ?? null,
    status: rollout.status,
    cutoffCreationTime: rollout.cutoff_creation_time,
    discoverySealedAt: rollout.discovery_sealed_at ?? null,
    discoveryPages: rollout.discovery_pages,
    discoveryContinuations: rollout.discovery_continuations,
    counters: {
      discovered: rollout.discovered,
      pending: rollout.pending,
      leased: rollout.leased,
      succeeded: rollout.succeeded,
      superseded: rollout.superseded,
      cancelled: rollout.cancelled,
      terminalErrors: rollout.terminal_errors,
    },
    remainingItems: rollout.pending + rollout.leased,
    createdAt: rollout.created_at,
    updatedAt: rollout.updated_at,
  };
}

export const progress = internalQuery({
  args: { rolloutId: v.optional(v.id('asset_rollouts')) },
  handler: async (ctx, args) => {
    const config = await exactConfig(ctx);
    const rolloutId = args.rolloutId ?? config.active_rollout_id;
    const rollout = rolloutId ? await ctx.db.get('asset_rollouts', rolloutId) : null;
    return {
      activeRolloutId: config.active_rollout_id ?? null,
      configStatus: config.status,
      activeRendererVersion: config.active_renderer_version,
      effectiveMaxItems: MAX_PUBLISHER_ITEMS,
      rollout: rollout ? projectRollout(rollout) : null,
      etaInputs: rollout
        ? {
            remainingItems: rollout.pending + rollout.leased,
            observedBrowserMsPerItem: null,
            dispatchIntervalMinutes: 5,
          }
        : null,
    };
  },
});
