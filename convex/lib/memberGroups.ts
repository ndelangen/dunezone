import type { Id } from '../_generated/dataModel';
import type { QueryCtx } from '../types';

async function loadGroup(ctx: QueryCtx, groupId: Id<'groups'>) {
  return await ctx.db.get(groupId);
}

/**
 * Active group_members for a user with joined group id/name/slug (same shape as
 * `members.listByUserActiveWithGroups`).
 */
export async function listByUserActiveWithGroupsData(ctx: QueryCtx, userId: Id<'users'>) {
  const rows = await ctx.db
    .query('group_members')
    .withIndex('by_user_status', (q) => q.eq('user_id', userId).eq('status', 'active'))
    .take(200);
  const groups = await Promise.all(rows.map((row) => loadGroup(ctx, row.group_id)));
  return rows.map((row, index) => {
    const group = groups[index];
    return {
      ...row,
      groups: group
        ? {
            id: group._id,
            name: group.name,
            slug: group.slug,
          }
        : null,
    };
  });
}
