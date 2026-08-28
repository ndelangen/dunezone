import { paginationOptsValidator, paginationResultValidator } from 'convex/server';
import { v } from 'convex/values';

import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { internalAction, query } from './_generated/server';
import type { ActionCtx, MutationCtx, QueryCtx } from './_generated/server';
import { internalMutation, mutation } from './functions';
import { accountStateOf, lifecycleUserId } from './lib/accountLifecycle';
import { DIRECT_OWNERSHIP_KINDS } from './lib/directOwnership';
import type { DirectOwnershipKind } from './lib/directOwnership';
import { requireAdminUserId, requireAuthUserId } from './lib/policy';
import { nowIso, slugify } from './lib/utils';

const SNAPSHOT_BATCH_SIZE = 32;
const APPLY_BATCH_SIZE = 16;
const TRANSACTION_RESERVE = {
  bytesRead: 1_000_000,
  bytesWritten: 1_000_000,
  documentsRead: 1000,
  documentsWritten: 500,
};

const replacementProfileValidator = v.object({
  profileId: v.id('profiles'),
  userId: v.id('users'),
  slug: v.string(),
  username: v.string(),
  avatarUrl: v.union(v.string(), v.null()),
});

type OwnedEntityId = Id<'groups'> | Id<'factions'> | Id<'rulesets'>;
type AnyCtx = QueryCtx | MutationCtx;

async function profileForUser(ctx: AnyCtx, userId: Id<'users'>) {
  return await ctx.db
    .query('profiles')
    .withIndex('by_user_id', (q) => q.eq('user_id', userId))
    .unique();
}

async function requireActiveReplacement(ctx: AnyCtx, sourceUserId: Id<'users'>, replacementUserId: Id<'users'>) {
  if (replacementUserId === sourceUserId) {
    throw new Error('Choose another active profile as the replacement owner');
  }
  const [user, profile] = await Promise.all([
    ctx.db.get('users', replacementUserId),
    profileForUser(ctx, replacementUserId),
  ]);
  if (!user || accountStateOf(user) !== 'active' || !profile || profile.account_state !== 'active') {
    throw new Error('The replacement profile is no longer available');
  }
  return profile;
}

async function findNonterminalSourceOperation(ctx: AnyCtx, userId: Id<'users'>) {
  for (const state of ['pending', 'running', 'failed'] as const) {
    const operation = await ctx.db
      .query('account_deletion_operations')
      .withIndex('by_account_state', (q) => q.eq('source_user_id', userId).eq('state', state))
      .unique();
    if (operation) {
      return operation;
    }
  }
  return null;
}

async function assertNotActiveReplacement(ctx: AnyCtx, userId: Id<'users'>) {
  for (const state of ['pending', 'running', 'failed'] as const) {
    const operation = await ctx.db
      .query('account_deletion_operations')
      .withIndex('by_replacement_state', (q) => q.eq('replacement_user_id', userId).eq('state', state))
      .first();
    if (operation) {
      throw new Error('This account is the replacement owner in an unfinished account deletion');
    }
  }
}

async function ownedPresence(ctx: QueryCtx, userId: Id<'users'>, kind: DirectOwnershipKind) {
  if (kind === 'group') {
    const [active, deleted] = await Promise.all([
      ctx.db
        .query('groups')
        .withIndex('by_created_by_deleted', (q) => q.eq('created_by', userId).eq('is_deleted', false))
        .take(1),
      ctx.db
        .query('groups')
        .withIndex('by_created_by_deleted', (q) => q.eq('created_by', userId).eq('is_deleted', true))
        .take(1),
    ]);
    return { kind, hasActive: active.length > 0, hasDeleted: deleted.length > 0 };
  }
  if (kind === 'faction') {
    const [active, deleted] = await Promise.all([
      ctx.db
        .query('factions')
        .withIndex('by_owner_deleted', (q) => q.eq('owner_id', userId).eq('is_deleted', false))
        .take(1),
      ctx.db
        .query('factions')
        .withIndex('by_owner_deleted', (q) => q.eq('owner_id', userId).eq('is_deleted', true))
        .take(1),
    ]);
    return { kind, hasActive: active.length > 0, hasDeleted: deleted.length > 0 };
  }
  const [active, deleted] = await Promise.all([
    ctx.db
      .query('rulesets')
      .withIndex('by_owner_deleted', (q) => q.eq('owner_id', userId).eq('is_deleted', false))
      .take(1),
    ctx.db
      .query('rulesets')
      .withIndex('by_owner_deleted', (q) => q.eq('owner_id', userId).eq('is_deleted', true))
      .take(1),
  ]);
  return { kind, hasActive: active.length > 0, hasDeleted: deleted.length > 0 };
}

function operationProjection(operation: Doc<'account_deletion_operations'> | null) {
  return operation
    ? {
        id: operation._id,
        state: operation.state,
        phase: operation.phase,
        error: operation.error,
        replacementUserId: operation.replacement_user_id,
      }
    : null;
}

/** The deletion page's single subscription. Pending/deleted sessions may observe only their own lifecycle operation. */
export const page = query({
  args: { profileSlug: v.string() },
  handler: async (ctx, args) => {
    const userId = await lifecycleUserId(ctx);
    if (!userId) {
      return { kind: 'denied' as const, reason: 'signed_out' as const };
    }
    const [user, profile] = await Promise.all([ctx.db.get('users', userId), profileForUser(ctx, userId)]);
    if (!user || !profile || profile.slug !== args.profileSlug) {
      return { kind: 'denied' as const, reason: 'wrong_profile' as const };
    }
    const state = accountStateOf(user);
    if (state !== 'active' || profile.account_state !== 'active') {
      const operation = user.account_deletion_operation_id
        ? await ctx.db.get('account_deletion_operations', user.account_deletion_operation_id)
        : null;
      return {
        kind: state === 'deleted' ? ('deleted' as const) : ('pending' as const),
        profile: { slug: profile.slug, username: profile.username },
        operation: operationProjection(operation),
      };
    }
    const summary = await Promise.all(DIRECT_OWNERSHIP_KINDS.map(({ kind }) => ownedPresence(ctx, userId, kind)));
    return {
      kind: 'active' as const,
      profile: { slug: profile.slug, username: profile.username },
      summary,
    };
  },
});

/** Lightweight, indexed replacement-owner projection. The picker mounts this query lazily. */
export const listReplacementProfiles = query({
  args: { paginationOpts: paginationOptsValidator, search: v.string() },
  returns: paginationResultValidator(replacementProfileValidator),
  handler: async (ctx, args) => {
    const sourceUserId = await requireAuthUserId(ctx);
    const searchSlug = slugify(args.search);
    const result = searchSlug
      ? await ctx.db
          .query('profiles')
          .withIndex('by_slug', (q) => q.gte('slug', searchSlug).lt('slug', `${searchSlug}\uffff`))
          .paginate(args.paginationOpts)
      : await ctx.db
          .query('profiles')
          .withIndex('by_account_state_username', (q) => q.eq('account_state', 'active'))
          .paginate(args.paginationOpts);
    const page = [];
    for (const profile of result.page) {
      if (profile.user_id === sourceUserId || profile.account_state !== 'active' || !profile.username) {
        continue;
      }
      const user = await ctx.db.get('users', profile.user_id);
      if (!user || accountStateOf(user) !== 'active') {
        continue;
      }
      page.push({
        profileId: profile._id,
        userId: profile.user_id,
        slug: profile.slug,
        username: profile.username,
        avatarUrl: profile.avatar?.url ?? profile.avatar_url,
      });
    }
    return { ...result, page };
  },
});

export const confirm = mutation({
  args: { replacementUserId: v.union(v.id('users'), v.null()) },
  handler: async (ctx, args) => {
    const sourceUserId = await lifecycleUserId(ctx);
    if (!sourceUserId) {
      throw new Error('Not authenticated');
    }
    const existing = await findNonterminalSourceOperation(ctx, sourceUserId);
    if (existing) {
      if (existing.replacement_user_id === args.replacementUserId) {
        return { operationId: existing._id };
      }
      throw new Error('Account deletion already started with a different ownership choice');
    }
    const sourceUser = await ctx.db.get('users', sourceUserId);
    if (!sourceUser || accountStateOf(sourceUser) !== 'active') {
      throw new Error('Not authenticated');
    }
    await assertNotActiveReplacement(ctx, sourceUserId);
    const sourceProfile = await profileForUser(ctx, sourceUserId);
    if (!sourceProfile || sourceProfile.account_state !== 'active') {
      throw new Error('Profile not found');
    }

    if (args.replacementUserId) {
      await requireActiveReplacement(ctx, sourceUserId, args.replacementUserId);
    }

    const now = nowIso();
    const operationId = await ctx.db.insert('account_deletion_operations', {
      source_user_id: sourceUserId,
      source_profile_id: sourceProfile._id,
      replacement_user_id: args.replacementUserId,
      state: 'running',
      phase: 'snapshotting',
      snapshot_kind: DIRECT_OWNERSHIP_KINDS[0].kind,
      snapshot_cursor: null,
      retry_count: 0,
      error: null,
      created_at: now,
      updated_at: now,
      completed_at: null,
    });
    await ctx.db.patch(sourceUserId, {
      account_state: 'deletion_pending',
      account_deletion_operation_id: operationId,
    });
    await ctx.db.patch(sourceProfile._id, {
      account_state: 'deletion_pending',
      account_deletion_operation_id: operationId,
      updated_at: now,
    });
    await ctx.scheduler.runAfter(0, internal.accountDeletion.snapshotWorker, { operationId });
    return { operationId };
  },
});

async function snapshotPage(ctx: MutationCtx, operation: Doc<'account_deletion_operations'>) {
  const pagination = { cursor: operation.snapshot_cursor, numItems: SNAPSHOT_BATCH_SIZE };
  if (operation.snapshot_kind === 'group') {
    return await ctx.db
      .query('groups')
      .withIndex('by_created_by_deleted', (q) => q.eq('created_by', operation.source_user_id))
      .paginate(pagination);
  }
  if (operation.snapshot_kind === 'faction') {
    return await ctx.db
      .query('factions')
      .withIndex('by_owner_deleted', (q) => q.eq('owner_id', operation.source_user_id))
      .paginate(pagination);
  }
  return await ctx.db
    .query('rulesets')
    .withIndex('by_owner_deleted', (q) => q.eq('owner_id', operation.source_user_id))
    .paginate(pagination);
}

async function captureItem(
  ctx: MutationCtx,
  operationId: Id<'account_deletion_operations'>,
  kind: DirectOwnershipKind,
  entityId: OwnedEntityId,
  wasDeleted: boolean
) {
  const existing = await ctx.db
    .query('account_deletion_items')
    .withIndex('by_operation_kind_entity', (q) =>
      q.eq('operation_id', operationId).eq('kind', kind).eq('entity_id', entityId)
    )
    .unique();
  if (existing) {
    return false;
  }
  await ctx.db.insert('account_deletion_items', {
    operation_id: operationId,
    kind,
    entity_id: entityId,
    was_deleted: wasDeleted,
    state: 'captured',
    updated_at: nowIso(),
  });
  return true;
}

export const snapshotBatch = internalMutation({
  args: { operationId: v.id('account_deletion_operations') },
  handler: async (ctx, args) => {
    const operation = await ctx.db.get('account_deletion_operations', args.operationId);
    if (!operation || operation.state !== 'running' || operation.phase !== 'snapshotting' || !operation.snapshot_kind) {
      return { next: 'done' as const };
    }
    const result = await snapshotPage(ctx, operation);
    let inserted = 0;
    for (const row of result.page) {
      if (await captureItem(ctx, operation._id, operation.snapshot_kind, row._id, row.is_deleted)) {
        inserted += 1;
      }
    }
    const capturedThisPass = operation.retry_count + inserted;
    const currentIndex = DIRECT_OWNERSHIP_KINDS.findIndex(({ kind }) => kind === operation.snapshot_kind);
    if (!result.isDone) {
      await ctx.db.patch(operation._id, {
        snapshot_cursor: result.continueCursor,
        retry_count: capturedThisPass,
        updated_at: nowIso(),
      });
      return { next: 'snapshot' as const };
    }
    const nextKind = DIRECT_OWNERSHIP_KINDS[currentIndex + 1]?.kind;
    if (nextKind) {
      await ctx.db.patch(operation._id, {
        snapshot_kind: nextKind,
        snapshot_cursor: null,
        retry_count: capturedThisPass,
        updated_at: nowIso(),
      });
      return { next: 'snapshot' as const };
    }
    if (capturedThisPass > 0) {
      await ctx.db.patch(operation._id, {
        snapshot_kind: DIRECT_OWNERSHIP_KINDS[0].kind,
        snapshot_cursor: null,
        retry_count: 0,
        updated_at: nowIso(),
      });
      return { next: 'snapshot' as const };
    }
    await ctx.db.patch(operation._id, {
      phase: 'applying',
      snapshot_kind: null,
      snapshot_cursor: null,
      updated_at: nowIso(),
    });
    return { next: 'apply' as const };
  },
});

async function ensureReplacementOwnerMembership(
  ctx: MutationCtx,
  groupId: Id<'groups'>,
  replacementUserId: Id<'users'>
) {
  const existing = await ctx.db
    .query('group_members')
    .withIndex('by_group_user', (q) => q.eq('group_id', groupId).eq('user_id', replacementUserId))
    .unique();
  const now = nowIso();
  if (existing) {
    if (existing.status !== 'active') {
      await ctx.db.patch(existing._id, { status: 'active', approved_at: now, approved_by: replacementUserId });
    }
    return;
  }
  await ctx.db.insert('group_members', {
    group_id: groupId,
    user_id: replacementUserId,
    status: 'active',
    requested_at: now,
    approved_at: now,
    approved_by: replacementUserId,
  });
}

async function applyItem(
  ctx: MutationCtx,
  operation: Doc<'account_deletion_operations'>,
  item: Doc<'account_deletion_items'>
) {
  const replacement = operation.replacement_user_id;
  if (item.kind === 'group') {
    const group = await ctx.db.get('groups', item.entity_id as Id<'groups'>);
    if (group?.created_by === operation.source_user_id) {
      if (replacement) {
        await ensureReplacementOwnerMembership(ctx, group._id, replacement);
        await ctx.db.patch(group._id, { created_by: replacement });
      } else if (!group.is_deleted) {
        await ctx.db.patch(group._id, { is_deleted: true });
      }
    }
  } else if (item.kind === 'faction') {
    const faction = await ctx.db.get('factions', item.entity_id as Id<'factions'>);
    if (faction?.owner_id === operation.source_user_id) {
      await ctx.db.patch(
        faction._id,
        replacement ? { owner_id: replacement } : { is_deleted: true, updated_at: nowIso() }
      );
    }
  } else {
    const ruleset = await ctx.db.get('rulesets', item.entity_id as Id<'rulesets'>);
    if (ruleset?.owner_id === operation.source_user_id) {
      await ctx.db.patch(
        ruleset._id,
        replacement ? { owner_id: replacement } : { is_deleted: true, updated_at: nowIso() }
      );
    }
  }
  await ctx.db.patch(item._id, { state: 'applied', updated_at: nowIso() });
}

function hasApplyHeadroom(metrics: Awaited<ReturnType<MutationCtx['meta']['getTransactionMetrics']>>) {
  return (
    metrics.bytesRead.remaining > TRANSACTION_RESERVE.bytesRead &&
    metrics.bytesWritten.remaining > TRANSACTION_RESERVE.bytesWritten &&
    metrics.documentsRead.remaining > TRANSACTION_RESERVE.documentsRead &&
    metrics.documentsWritten.remaining > TRANSACTION_RESERVE.documentsWritten
  );
}

async function hasRemainingOwnership(ctx: MutationCtx, sourceUserId: Id<'users'>, replacement: Id<'users'> | null) {
  const requireDeleted = replacement ? undefined : false;
  const group = await ctx.db
    .query('groups')
    .withIndex('by_created_by_deleted', (q) => {
      const owner = q.eq('created_by', sourceUserId);
      return requireDeleted === undefined ? owner : owner.eq('is_deleted', requireDeleted);
    })
    .take(1);
  const faction = await ctx.db
    .query('factions')
    .withIndex('by_owner_deleted', (q) => {
      const owner = q.eq('owner_id', sourceUserId);
      return requireDeleted === undefined ? owner : owner.eq('is_deleted', requireDeleted);
    })
    .take(1);
  const ruleset = await ctx.db
    .query('rulesets')
    .withIndex('by_owner_deleted', (q) => {
      const owner = q.eq('owner_id', sourceUserId);
      return requireDeleted === undefined ? owner : owner.eq('is_deleted', requireDeleted);
    })
    .take(1);
  return group.length > 0 || faction.length > 0 || ruleset.length > 0;
}

export const applyBatch = internalMutation({
  args: { operationId: v.id('account_deletion_operations') },
  handler: async (ctx, args) => {
    const operation = await ctx.db.get('account_deletion_operations', args.operationId);
    if (
      !operation ||
      operation.state !== 'running' ||
      !['applying', 'verifying', 'finalizing'].includes(operation.phase)
    ) {
      return { next: 'done' as const };
    }
    if (operation.replacement_user_id) {
      await requireActiveReplacement(ctx, operation.source_user_id, operation.replacement_user_id);
    }
    const items = await ctx.db
      .query('account_deletion_items')
      .withIndex('by_operation_state', (q) => q.eq('operation_id', operation._id).eq('state', 'captured'))
      .take(APPLY_BATCH_SIZE);
    for (const item of items) {
      await applyItem(ctx, operation, item);
      if (!hasApplyHeadroom(await ctx.meta.getTransactionMetrics())) {
        break;
      }
    }
    const remainingItems = await ctx.db
      .query('account_deletion_items')
      .withIndex('by_operation_state', (q) => q.eq('operation_id', operation._id).eq('state', 'captured'))
      .take(1);
    if (remainingItems.length > 0) {
      await ctx.db.patch(operation._id, { phase: 'applying', updated_at: nowIso() });
      return { next: 'apply' as const };
    }
    await ctx.db.patch(operation._id, { phase: 'verifying', updated_at: nowIso() });
    if (await hasRemainingOwnership(ctx, operation.source_user_id, operation.replacement_user_id)) {
      throw new Error('Account deletion verification found ownership that was not disposed');
    }
    const now = nowIso();
    await ctx.db.patch(operation._id, {
      state: 'completed',
      phase: 'complete',
      error: null,
      updated_at: now,
      completed_at: now,
    });
    await ctx.db.patch(operation.source_user_id, { account_state: 'deleted', deleted_at: now });
    await ctx.db.patch(operation.source_profile_id, {
      account_state: 'deleted',
      deleted_at: now,
      updated_at: now,
    });
    return { next: 'done' as const };
  },
});

export const markFailed = internalMutation({
  args: { operationId: v.id('account_deletion_operations'), error: v.string() },
  handler: async (ctx, args) => {
    const operation = await ctx.db.get('account_deletion_operations', args.operationId);
    if (!operation || operation.state === 'completed') {
      return;
    }
    await ctx.db.patch(operation._id, { state: 'failed', error: args.error, updated_at: nowIso() });
  },
});

async function runWorker(ctx: ActionCtx, operationId: Id<'account_deletion_operations'>, worker: 'snapshot' | 'apply') {
  try {
    const result =
      worker === 'snapshot'
        ? await ctx.runMutation(internal.accountDeletion.snapshotBatch, { operationId })
        : await ctx.runMutation(internal.accountDeletion.applyBatch, { operationId });
    if (result.next === 'snapshot') {
      await ctx.scheduler.runAfter(0, internal.accountDeletion.snapshotWorker, { operationId });
    }
    if (result.next === 'apply') {
      await ctx.scheduler.runAfter(0, internal.accountDeletion.applyWorker, { operationId });
    }
  } catch (error) {
    await ctx.runMutation(internal.accountDeletion.markFailed, {
      operationId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export const snapshotWorker = internalAction({
  args: { operationId: v.id('account_deletion_operations') },
  handler: async (ctx, args) => await runWorker(ctx, args.operationId, 'snapshot'),
});

export const applyWorker = internalAction({
  args: { operationId: v.id('account_deletion_operations') },
  handler: async (ctx, args) => await runWorker(ctx, args.operationId, 'apply'),
});

export const resume = mutation({
  args: { operationId: v.id('account_deletion_operations') },
  handler: async (ctx, args) => {
    await requireAdminUserId(ctx);
    const operation = await ctx.db.get('account_deletion_operations', args.operationId);
    if (!operation || operation.state !== 'failed') {
      throw new Error('Failed account deletion operation not found');
    }
    await ctx.db.patch(operation._id, {
      state: 'running',
      error: null,
      retry_count: operation.retry_count + 1,
      updated_at: nowIso(),
    });
    if (operation.phase === 'snapshotting') {
      await ctx.scheduler.runAfter(0, internal.accountDeletion.snapshotWorker, { operationId: operation._id });
    } else if (operation.phase === 'restoring') {
      await ctx.scheduler.runAfter(0, internal.accountDeletion.restoreWorker, { operationId: operation._id });
    } else {
      await ctx.scheduler.runAfter(0, internal.accountDeletion.applyWorker, { operationId: operation._id });
    }
  },
});

async function reactivateSource(ctx: MutationCtx, operation: Doc<'account_deletion_operations'>) {
  const now = nowIso();
  await ctx.db.patch(operation.source_user_id, {
    account_state: 'active',
    deleted_at: undefined,
    account_deletion_operation_id: undefined,
  });
  await ctx.db.patch(operation.source_profile_id, {
    account_state: 'active',
    deleted_at: undefined,
    account_deletion_operation_id: undefined,
    updated_at: now,
  });
  await ctx.db.patch(operation._id, { state: 'completed', phase: 'complete', error: null, updated_at: now });
}

async function restoreItem(
  ctx: MutationCtx,
  operation: Doc<'account_deletion_operations'>,
  item: Doc<'account_deletion_items'>
) {
  if (!item.was_deleted) {
    if (item.kind === 'group') {
      const group = await ctx.db.get('groups', item.entity_id as Id<'groups'>);
      if (group?.created_by === operation.source_user_id && group.is_deleted) {
        await ctx.db.patch(group._id, { is_deleted: false });
      }
    } else if (item.kind === 'faction') {
      const faction = await ctx.db.get('factions', item.entity_id as Id<'factions'>);
      if (faction?.owner_id === operation.source_user_id && faction.is_deleted) {
        await ctx.db.patch(faction._id, { is_deleted: false, updated_at: nowIso() });
      }
    } else {
      const ruleset = await ctx.db.get('rulesets', item.entity_id as Id<'rulesets'>);
      if (ruleset?.owner_id === operation.source_user_id && ruleset.is_deleted) {
        await ctx.db.patch(ruleset._id, { is_deleted: false, updated_at: nowIso() });
      }
    }
  }
  await ctx.db.patch(item._id, { state: 'restored', updated_at: nowIso() });
}

export const restoreBatch = internalMutation({
  args: { operationId: v.id('account_deletion_operations') },
  handler: async (ctx, args) => {
    const operation = await ctx.db.get('account_deletion_operations', args.operationId);
    if (!operation || operation.state !== 'running' || operation.phase !== 'restoring') {
      return { next: 'done' as const };
    }
    const items = await ctx.db
      .query('account_deletion_items')
      .withIndex('by_operation_state', (q) => q.eq('operation_id', operation._id).eq('state', 'applied'))
      .take(APPLY_BATCH_SIZE);
    for (const item of items) {
      await restoreItem(ctx, operation, item);
      if (!hasApplyHeadroom(await ctx.meta.getTransactionMetrics())) {
        break;
      }
    }
    const remaining = await ctx.db
      .query('account_deletion_items')
      .withIndex('by_operation_state', (q) => q.eq('operation_id', operation._id).eq('state', 'applied'))
      .take(1);
    if (remaining.length > 0) {
      return { next: 'restore' as const };
    }
    await reactivateSource(ctx, operation);
    return { next: 'done' as const };
  },
});

export const restoreWorker = internalAction({
  args: { operationId: v.id('account_deletion_operations') },
  handler: async (ctx, args) => {
    try {
      const result = await ctx.runMutation(internal.accountDeletion.restoreBatch, args);
      if (result.next === 'restore') {
        await ctx.scheduler.runAfter(0, internal.accountDeletion.restoreWorker, args);
      }
    } catch (error) {
      await ctx.runMutation(internal.accountDeletion.markFailed, {
        operationId: args.operationId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
});

export const restore = mutation({
  args: { operationId: v.id('account_deletion_operations') },
  handler: async (ctx, args) => {
    await requireAdminUserId(ctx);
    const operation = await ctx.db.get('account_deletion_operations', args.operationId);
    if (!operation || operation.state !== 'completed') {
      throw new Error('Completed account deletion operation not found');
    }
    const source = await ctx.db.get('users', operation.source_user_id);
    if (!source || accountStateOf(source) !== 'deleted') {
      throw new Error('Deleted source account not found');
    }
    if (operation.replacement_user_id) {
      await reactivateSource(ctx, operation);
      return;
    }
    await ctx.db.patch(operation._id, { state: 'running', phase: 'restoring', error: null, updated_at: nowIso() });
    await ctx.db.patch(operation.source_user_id, { account_state: 'deletion_pending' });
    await ctx.db.patch(operation.source_profile_id, { account_state: 'deletion_pending', updated_at: nowIso() });
    await ctx.scheduler.runAfter(0, internal.accountDeletion.restoreWorker, { operationId: operation._id });
  },
});
