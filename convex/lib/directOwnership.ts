import { v } from 'convex/values';

export const DIRECT_OWNERSHIP_KINDS = [
  {
    kind: 'group',
    table: 'groups',
    ownerField: 'created_by',
    deletedField: 'is_deleted',
    ownerDeletedIndex: 'by_created_by_deleted',
  },
  {
    kind: 'faction',
    table: 'factions',
    ownerField: 'owner_id',
    deletedField: 'is_deleted',
    ownerDeletedIndex: 'by_owner_deleted',
  },
  {
    kind: 'ruleset',
    table: 'rulesets',
    ownerField: 'owner_id',
    deletedField: 'is_deleted',
    ownerDeletedIndex: 'by_owner_deleted',
  },
] as const;

export type DirectOwnershipKind = (typeof DIRECT_OWNERSHIP_KINDS)[number]['kind'];

export const directOwnershipKindValidator = v.union(
  v.literal(DIRECT_OWNERSHIP_KINDS[0].kind),
  v.literal(DIRECT_OWNERSHIP_KINDS[1].kind),
  v.literal(DIRECT_OWNERSHIP_KINDS[2].kind)
);
