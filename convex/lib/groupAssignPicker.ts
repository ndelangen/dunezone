import { v } from 'convex/values';

import type { Id } from '../_generated/dataModel';
import type { QueryCtx } from '../types';
import { liveGroupOrNull } from './collaborativeAccess';

type OwnedRowWithGroup = { group_id: Id<'groups'> | null };

export const OWNED_FOR_GROUP_ASSIGN_LIMIT = 500;

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
  const groups = await Promise.all([...groupIds].map((gid) => ctx.db.get('groups', gid)));
  const groupNameById = new Map<Id<'groups'>, string>();
  for (const candidate of groups) {
    const group = liveGroupOrNull(candidate);
    if (group) {
      groupNameById.set(group._id, group.name.trim());
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

type OwnedTableName = 'factions' | 'rulesets';

/** Row shape shared by the group-detail "add my faction/ruleset to this group" pickers. */
export function ownedForGroupAssignRowValidator<TableName extends OwnedTableName>(table: TableName) {
  return v.object({
    id: v.id(table),
    slug: v.string(),
    name: v.string(),
    groupId: v.union(v.id('groups'), v.null()),
    groupName: v.union(v.string(), v.null()),
  });
}

type OwnedForGroupAssignRow = OwnedRowWithGroup & { _id: Id<OwnedTableName>; slug: string };

/**
 * Projects already-fetched owned rows into the group-detail "add my faction/ruleset to this group" picker shape, resolving each row's current (live) group name.
 */
export async function buildOwnedForGroupAssignRows<Row extends OwnedForGroupAssignRow>(
  ctx: QueryCtx,
  rows: readonly Row[],
  nameOf: (row: Row) => string
): Promise<
  {
    id: Row['_id'];
    slug: string;
    name: string;
    groupId: Id<'groups'> | null;
    groupName: string | null;
  }[]
> {
  const groupNameById = await resolveLiveGroupNames(ctx, rows);

  return rows.map((row) => ({
    id: row._id,
    slug: row.slug,
    name: nameOf(row),
    ...projectOwnedGroupRef(row.group_id, groupNameById),
  }));
}
