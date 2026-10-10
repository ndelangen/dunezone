import { internal } from '../_generated/api';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { gameActorIds } from './accountIdentity';
import { accountStateOf } from './accountLifecycle';
import { requireUnlockedAccount } from './accountMethods';
import { nowIso } from './utils';

const BATCH = 32;
export async function profileForAccount(ctx: QueryCtx, userId: Id<'users'>) {
  return await ctx.db
    .query('profiles')
    .withIndex('by_user_id', (q) => q.eq('user_id', userId))
    .unique();
}

/** A player cannot acquire two private seats in one game through a profile merge. */
async function checkGameSeats(ctx: MutationCtx, source: Id<'users'>, target: Id<'users'>) {
  const routes = await ctx.db
    .query('play_game_accounts')
    .withIndex('by_user_id', (q) => q.eq('user_id', source))
    .take(201);
  const created = await ctx.db
    .query('play_games')
    .withIndex('by_creator_id', (q) => q.eq('creator_id', source))
    .take(201);
  if (routes.length > 200 || created.length > 200) {
    throw new Error('This account has too many games to check in one merge. Contact an administrator.');
  }
  if (created.some((game) => game.state === 'pending')) {
    throw new Error('This profile has a game being created. Wait for it to finish before merging.');
  }
  const games = new Set([...routes.map((row) => row.game_id), ...created.map((row) => row._id)]);
  for (const gameId of games) {
    const game = await ctx.db.get(gameId);
    if (!game) {
      continue;
    }
    const sourceActors = await gameActorIds(ctx, gameId, source);
    const targetActors = await gameActorIds(ctx, gameId, target);
    if (new Set([...sourceActors, ...targetActors]).size > 32) {
      throw new Error('This game has too many merged identities. Contact an administrator.');
    }
    if (game.state === 'expired' || ['finished', 'discarded'].includes(game.directory?.stage ?? '')) {
      continue;
    }
    const seats = game.directory?.seats ?? [];
    if (
      seats.some((seat) => sourceActors.includes(seat.userId as Id<'users'>)) &&
      seats.some((seat) => targetActors.includes(seat.userId as Id<'users'>))
    ) {
      throw new Error('Both profiles hold a seat in the same game. Leave one of those seats before merging.');
    }
  }
}

export async function startAccountMerge(
  ctx: MutationCtx,
  source: Id<'users'>,
  target: Id<'users'>,
  requestedBy: Id<'users'>
) {
  if (source === target) {
    throw new Error('Choose two different profiles.');
  }
  const [sourceUser, targetUser, sourceProfile, targetProfile] = await Promise.all([
    ctx.db.get(source),
    ctx.db.get(target),
    profileForAccount(ctx, source),
    profileForAccount(ctx, target),
  ]);
  if (
    !sourceUser ||
    !targetUser ||
    accountStateOf(sourceUser) !== 'active' ||
    accountStateOf(targetUser) !== 'active' ||
    sourceProfile?.account_state !== 'active' ||
    targetProfile?.account_state !== 'active'
  ) {
    throw new Error('Both profiles must be active to merge.');
  }
  await requireUnlockedAccount(ctx, source);
  await requireUnlockedAccount(ctx, target);
  await checkGameSeats(ctx, source, target);
  const operationId = await ctx.db.insert('account_merge_operations', {
    source_user_id: source,
    source_profile_id: sourceProfile._id,
    target_user_id: target,
    target_profile_id: targetProfile._id,
    requested_by: requestedBy,
    source_name: sourceProfile.username ?? sourceProfile.slug,
    target_name: targetProfile.username ?? targetProfile.slug,
    target_slug: targetProfile.slug,
    state: 'running',
    phase: 0,
    error: null,
    created_at: Date.now(),
    completed_at: null,
  });
  await ctx.db.patch(source, {
    account_state: 'merge_pending',
    merged_into_user_id: target,
    account_merge_operation_id: operationId,
  });
  await ctx.db.patch(target, {
    account_merge_operation_id: operationId,
    isAdmin: !!(sourceUser.isAdmin || targetUser.isAdmin),
  });
  await ctx.db.patch(sourceProfile._id, {
    account_state: 'merge_pending',
    merged_into_profile_id: targetProfile._id,
    updated_at: nowIso(),
  });
  await ctx.scheduler.runAfter(0, internal.accounts.advance, { operationId });
  return operationId;
}

async function moveRouting(ctx: MutationCtx, row: Doc<'play_game_accounts'>, target: Id<'users'>) {
  const game = await ctx.db.get(row.game_id);
  const targetHasActor =
    (game?.creator_actor_id ?? game?.creator_id) === target ||
    game?.directory?.seats.some((seat) => seat.userId === target);
  const existing = await ctx.db
    .query('play_game_accounts')
    .withIndex('by_game_id_user_id', (q) => q.eq('game_id', row.game_id).eq('user_id', target))
    .unique();
  const actors = [
    ...new Set([
      ...(row.actor_user_ids ?? [row.user_id]),
      ...(existing?.actor_user_ids ?? (existing || targetHasActor ? [target] : [])),
    ]),
  ];
  if (existing) {
    await ctx.db.patch(existing._id, { actor_user_ids: actors });
    await ctx.db.delete(row._id);
  } else {
    await ctx.db.patch(row._id, { user_id: target, actor_user_ids: actors });
  }
}

/** Every phase drains an indexed source range, so retries need no cursor and never repeat user-visible writes. */
export async function advanceAccountMerge(ctx: MutationCtx, operation: Doc<'account_merge_operations'>) {
  const source = operation.source_user_id;
  const target = operation.target_user_id;
  let count = 0;
  switch (operation.phase) {
    case 0: {
      const rows = await ctx.db
        .query('groups')
        .withIndex('by_created_by', (q) => q.eq('created_by', source))
        .take(BATCH);
      for (const row of rows) {
        await ctx.db.patch(row._id, { created_by: target });
      }
      count = rows.length;
      break;
    }
    case 1: {
      const rows = await ctx.db
        .query('factions')
        .withIndex('by_owner_id', (q) => q.eq('owner_id', source))
        .take(BATCH);
      for (const row of rows) {
        await ctx.db.patch(row._id, { owner_id: target });
      }
      count = rows.length;
      break;
    }
    case 2: {
      const rows = await ctx.db
        .query('assets')
        .withIndex('by_owner_deleted', (q) => q.eq('owner_id', source))
        .take(BATCH);
      for (const row of rows) {
        await ctx.db.patch(row._id, { owner_id: target });
      }
      count = rows.length;
      break;
    }
    case 3: {
      const rows = await ctx.db
        .query('rulesets')
        .withIndex('by_owner_deleted', (q) => q.eq('owner_id', source))
        .take(BATCH);
      for (const row of rows) {
        await ctx.db.patch(row._id, { owner_id: target });
      }
      count = rows.length;
      break;
    }
    case 4: {
      const rows = await ctx.db
        .query('group_members')
        .withIndex('by_user', (q) => q.eq('user_id', source))
        .take(BATCH);
      const rank = { removed: 0, pending: 1, active: 2 };
      for (const row of rows) {
        const existing = await ctx.db
          .query('group_members')
          .withIndex('by_group_user', (q) => q.eq('group_id', row.group_id).eq('user_id', target))
          .unique();
        if (existing) {
          if (rank[row.status] > rank[existing.status]) {
            await ctx.db.patch(existing._id, {
              status: row.status,
              approved_at: row.approved_at,
              approved_by: row.approved_by,
            });
          }
          await ctx.db.delete(row._id);
        } else {
          await ctx.db.patch(row._id, { user_id: target });
        }
      }
      count = rows.length;
      break;
    }
    case 5: {
      const rows = await ctx.db
        .query('group_members')
        .withIndex('by_approved_by', (q) => q.eq('approved_by', source))
        .take(BATCH);
      for (const row of rows) {
        await ctx.db.patch(row._id, { approved_by: target });
      }
      count = rows.length;
      break;
    }
    case 6: {
      const rows = await ctx.db
        .query('faq_items')
        .withIndex('by_asked_by_created', (q) => q.eq('asked_by', source))
        .take(BATCH);
      for (const row of rows) {
        await ctx.db.patch(row._id, { asked_by: target });
      }
      count = rows.length;
      break;
    }
    case 7: {
      const rows = await ctx.db
        .query('faq_answers')
        .withIndex('by_answered_by_created', (q) => q.eq('answered_by', source))
        .take(BATCH);
      for (const row of rows) {
        await ctx.db.patch(row._id, { answered_by: target });
      }
      count = rows.length;
      break;
    }
    case 8: {
      const rows = await ctx.db
        .query('rulebooks')
        .withIndex('by_created_by', (q) => q.eq('created_by', source))
        .take(BATCH);
      for (const row of rows) {
        await ctx.db.patch(row._id, { created_by: target });
      }
      count = rows.length;
      break;
    }
    case 9: {
      const rows = await ctx.db
        .query('rulebook_drafts')
        .withIndex('by_updated_by', (q) => q.eq('updated_by', source))
        .take(BATCH);
      for (const row of rows) {
        await ctx.db.patch(row._id, { updated_by: target });
      }
      count = rows.length;
      break;
    }
    case 10: {
      const rows = await ctx.db
        .query('rulebook_editions')
        .withIndex('by_created_by', (q) => q.eq('created_by', source))
        .take(BATCH);
      for (const row of rows) {
        await ctx.db.patch(row._id, { created_by: target });
      }
      count = rows.length;
      break;
    }
    case 11: {
      const rows = await ctx.db
        .query('play_games')
        .withIndex('by_creator_id', (q) => q.eq('creator_id', source))
        .take(BATCH);
      for (const row of rows) {
        const routing = await ctx.db
          .query('play_game_accounts')
          .withIndex('by_game_id_user_id', (q) => q.eq('game_id', row._id).eq('user_id', source))
          .unique();
        if (!routing) {
          await ctx.db.insert('play_game_accounts', { game_id: row._id, user_id: source });
        }
        await ctx.db.patch(row._id, { creator_id: target, creator_actor_id: row.creator_actor_id ?? source });
      }
      count = rows.length;
      break;
    }
    case 12: {
      const rows = await ctx.db
        .query('play_game_accounts')
        .withIndex('by_user_id', (q) => q.eq('user_id', source))
        .take(BATCH);
      for (const row of rows) {
        await moveRouting(ctx, row, target);
      }
      count = rows.length;
      break;
    }
    case 13: {
      const rows = await ctx.db
        .query('users')
        .withIndex('by_merged_into_user_id', (q) => q.eq('merged_into_user_id', source))
        .take(BATCH);
      for (const row of rows) {
        await ctx.db.patch(row._id, { merged_into_user_id: target });
      }
      count = rows.length;
      break;
    }
    case 14: {
      const rows = await ctx.db
        .query('profiles')
        .withIndex('by_merged_into_profile_id', (q) => q.eq('merged_into_profile_id', operation.source_profile_id))
        .take(BATCH);
      for (const row of rows) {
        await ctx.db.patch(row._id, { merged_into_profile_id: operation.target_profile_id });
      }
      count = rows.length;
      break;
    }
    case 15: {
      const rows = await ctx.db
        .query('authAccounts')
        .withIndex('userIdAndProvider', (q) => q.eq('userId', source))
        .take(BATCH);
      for (const row of rows) {
        await ctx.db.patch(row._id, { userId: target });
      }
      count = rows.length;
      break;
    }
    case 16: {
      const session = await ctx.db
        .query('authSessions')
        .withIndex('userId', (q) => q.eq('userId', source))
        .first();
      if (session) {
        const tokens = await ctx.db
          .query('authRefreshTokens')
          .withIndex('sessionId', (q) => q.eq('sessionId', session._id))
          .take(BATCH);
        for (const token of tokens) {
          await ctx.db.delete(token._id);
        }
        if (tokens.length === 0) {
          await ctx.db.delete(session._id);
        }
        count = 1;
      }
      break;
    }
    default: {
      const now = nowIso();
      await ctx.db.patch(source, { account_state: 'deleted', deleted_at: now, account_merge_operation_id: undefined });
      await ctx.db.patch(operation.source_profile_id, { account_state: 'deleted', deleted_at: now, updated_at: now });
      await ctx.db.patch(target, { account_merge_operation_id: undefined });
      await ctx.db.patch(operation._id, { state: 'completed', completed_at: Date.now(), error: null });
      return;
    }
  }
  if (count === 0) {
    await ctx.db.patch(operation._id, { phase: operation.phase + 1 });
  }
  await ctx.scheduler.runAfter(0, internal.accounts.advance, { operationId: operation._id });
}
