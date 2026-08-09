import type { Id } from '../_generated/dataModel';
import type { QueryCtx } from '../types';

type OwnedRowWithGroup = { group_id: Id<'groups'> | null };

/** Live (non-deleted) group names for every distinct group_id referenced by `rows`. */
export async function resolveLiveGroupNames(
  ctx: QueryCtx,
  rows: readonly OwnedRowWithGroup[]
): Promise<Map<Id<'groups'>, string>> {
  const groupIds = new Set<Id<'groups'>>();
  for (const row of rows) {
    if (row.group_id) {
      groupIds.add(row.group_id);
    }
  }
  const groupNameById = new Map<Id<'groups'>, string>();
  for (const gid of groupIds) {
    const group = await ctx.db.get('groups', gid);
    if (group && !group.is_deleted) {
      groupNameById.set(gid, group.name.trim());
    }
  }
  return groupNameById;
}

/** Projects a `group_id` to `{groupId, groupName}`, nulling out references to soft-deleted groups. */
export function projectOwnedGroupRef(
  groupId: Id<'groups'> | null,
  groupNameById: Map<Id<'groups'>, string>
): { groupId: Id<'groups'> | null; groupName: string | null } {
  const liveGroupId = groupId && groupNameById.has(groupId) ? groupId : null;
  return {
    groupId: liveGroupId,
    groupName: liveGroupId ? (groupNameById.get(liveGroupId) ?? null) : null,
  };
}
