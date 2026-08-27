import type { Infer } from 'convex/values';

import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { isActiveProfile, optionalActiveUserId } from './accountLifecycle';
import type {
  assetViewerAccessValidator,
  assignedGroupSummaryValidator,
  factionViewerAccessValidator,
  groupViewerAccessValidator,
  publicViewerValidator,
  rulesetViewerAccessValidator,
} from './collaborativeAccessValidators';

export type MembershipState = 'none' | 'pending' | 'active';

export type PublicViewer = Infer<typeof publicViewerValidator>;

export type AssignedGroupSummary = Infer<typeof assignedGroupSummaryValidator>;

export type CollaborativeAccess =
  | Infer<typeof groupViewerAccessValidator>
  | Infer<typeof factionViewerAccessValidator>
  | Infer<typeof rulesetViewerAccessValidator>
  | Infer<typeof assetViewerAccessValidator>;

export type StoredMembershipState = MembershipState | 'removed';

type ViewerFacts =
  | { kind: 'anonymous' }
  | { kind: 'authenticated'; membership: StoredMembershipState; ownsSubject: boolean };

export type GroupAccessFacts = {
  kind: 'group';
  group: { eligible: boolean };
  viewer: ViewerFacts;
};

export type AssetAccessFacts = {
  kind: 'faction' | 'ruleset' | 'asset';
  resource: { available: boolean };
  group: { eligible: boolean; summary: AssignedGroupSummary | null };
  viewer: ViewerFacts;
};

export type CollaborativeAccessFacts = GroupAccessFacts | AssetAccessFacts;

type CollaborativeSubject =
  | { kind: 'group'; id: Id<'groups'> }
  | { kind: 'faction'; id: Id<'factions'> }
  | { kind: 'ruleset'; id: Id<'rulesets'> }
  | { kind: 'asset'; id: Id<'assets'> };

type LoadedGroupAccess = {
  subject: Doc<'groups'>;
  assignedGroup: Doc<'groups'>;
  viewerMembership: Doc<'group_members'> | null;
  viewerAccess: Extract<CollaborativeAccess, { kind: 'group' }>;
  viewerId: Id<'users'> | null;
};

type LoadedFactionAccess = {
  subject: Doc<'factions'>;
  assignedGroup: Doc<'groups'> | null;
  viewerMembership: Doc<'group_members'> | null;
  viewerAccess: Extract<CollaborativeAccess, { kind: 'faction' }>;
  viewerId: Id<'users'> | null;
};

type LoadedRulesetAccess = {
  subject: Doc<'rulesets'>;
  assignedGroup: Doc<'groups'> | null;
  viewerMembership: Doc<'group_members'> | null;
  viewerAccess: Extract<CollaborativeAccess, { kind: 'ruleset' }>;
  viewerId: Id<'users'> | null;
};

type LoadedAssetAccess = {
  subject: Doc<'assets'>;
  assignedGroup: Doc<'groups'> | null;
  viewerMembership: Doc<'group_members'> | null;
  viewerAccess: Extract<CollaborativeAccess, { kind: 'asset' }>;
  viewerId: Id<'users'> | null;
};

type LoadedCollaborativeAccess = LoadedGroupAccess | LoadedFactionAccess | LoadedRulesetAccess | LoadedAssetAccess;

type AnyCtx = QueryCtx | MutationCtx;

/**
 * The one projection rule for group references: a reference that does not resolve to a live Group (soft-deleted, or missing entirely because historical hard deletions left dangling ids) projects to null (ADR-0003).
 */
export function liveGroupOrNull(group: Doc<'groups'> | null): Doc<'groups'> | null {
  return group === null || group.is_deleted ? null : group;
}

async function requireAuthenticatedViewerId(ctx: AnyCtx) {
  const viewerId = await optionalActiveUserId(ctx);
  if (!viewerId) {
    throw new Error('Not authenticated');
  }
  return viewerId;
}

async function membershipFor(ctx: AnyCtx, groupId: Id<'groups'> | null, viewerId: Id<'users'> | null) {
  if (!groupId || !viewerId) {
    return null;
  }
  return await ctx.db
    .query('group_members')
    .withIndex('by_group_user', (q) => q.eq('group_id', groupId).eq('user_id', viewerId))
    .unique();
}

function viewerFacts(
  viewerId: Id<'users'> | null,
  ownerId: Id<'users'>,
  membership: Doc<'group_members'> | null
): ViewerFacts {
  if (!viewerId) {
    return { kind: 'anonymous' };
  }
  return {
    kind: 'authenticated',
    membership: membership?.status ?? 'none',
    ownsSubject: viewerId === ownerId,
  };
}

function groupAccessFromLoaded(
  subject: Doc<'groups'>,
  viewerId: Id<'users'> | null,
  viewerMembership: Doc<'group_members'> | null
): LoadedGroupAccess {
  return {
    subject,
    assignedGroup: subject,
    viewerMembership,
    viewerId,
    viewerAccess: evaluateCollaborativeAccess({
      kind: 'group',
      group: { eligible: !subject.is_deleted },
      viewer: viewerFacts(viewerId, subject.created_by, viewerMembership),
    }) as Extract<CollaborativeAccess, { kind: 'group' }>,
  };
}

function factionAccessFromLoaded(
  subject: Doc<'factions'>,
  assignedGroup: Doc<'groups'> | null,
  viewerId: Id<'users'> | null,
  viewerMembership: Doc<'group_members'> | null
): LoadedFactionAccess {
  return {
    subject,
    assignedGroup,
    viewerMembership,
    viewerId,
    viewerAccess: evaluateCollaborativeAccess({
      kind: 'faction',
      resource: { available: !subject.is_deleted },
      group: {
        eligible: assignedGroup !== null,
        summary: assignedGroup ? { id: assignedGroup._id, name: assignedGroup.name, slug: assignedGroup.slug } : null,
      },
      viewer: viewerFacts(viewerId, subject.owner_id, viewerMembership),
    }) as Extract<CollaborativeAccess, { kind: 'faction' }>,
  };
}

function rulesetAccessFromLoaded(
  subject: Doc<'rulesets'>,
  assignedGroup: Doc<'groups'> | null,
  viewerId: Id<'users'> | null,
  viewerMembership: Doc<'group_members'> | null
): LoadedRulesetAccess {
  return {
    subject,
    assignedGroup,
    viewerMembership,
    viewerId,
    viewerAccess: evaluateCollaborativeAccess({
      kind: 'ruleset',
      resource: { available: !subject.is_deleted },
      group: {
        eligible: assignedGroup !== null,
        summary: assignedGroup ? { id: assignedGroup._id, name: assignedGroup.name, slug: assignedGroup.slug } : null,
      },
      viewer: viewerFacts(viewerId, subject.owner_id, viewerMembership),
    }) as Extract<CollaborativeAccess, { kind: 'ruleset' }>,
  };
}

function assetAccessFromLoaded(
  subject: Doc<'assets'>,
  assignedGroup: Doc<'groups'> | null,
  viewerId: Id<'users'> | null,
  viewerMembership: Doc<'group_members'> | null
): LoadedAssetAccess {
  return {
    subject,
    assignedGroup,
    viewerMembership,
    viewerId,
    viewerAccess: evaluateCollaborativeAccess({
      kind: 'asset',
      resource: { available: !subject.is_deleted },
      group: {
        eligible: assignedGroup !== null,
        summary: assignedGroup ? { id: assignedGroup._id, name: assignedGroup.name, slug: assignedGroup.slug } : null,
      },
      viewer: viewerFacts(viewerId, subject.owner_id, viewerMembership),
    }) as Extract<CollaborativeAccess, { kind: 'asset' }>,
  };
}

export function loadCollaborativeAccess(
  ctx: AnyCtx,
  subject: Extract<CollaborativeSubject, { kind: 'group' }>
): Promise<LoadedGroupAccess>;
export function loadCollaborativeAccess(
  ctx: AnyCtx,
  subject: Extract<CollaborativeSubject, { kind: 'faction' }>
): Promise<LoadedFactionAccess>;
export function loadCollaborativeAccess(
  ctx: AnyCtx,
  subject: Extract<CollaborativeSubject, { kind: 'ruleset' }>
): Promise<LoadedRulesetAccess>;
export function loadCollaborativeAccess(
  ctx: AnyCtx,
  subject: Extract<CollaborativeSubject, { kind: 'asset' }>
): Promise<LoadedAssetAccess>;
export async function loadCollaborativeAccess(
  ctx: AnyCtx,
  subject: CollaborativeSubject
): Promise<LoadedCollaborativeAccess> {
  const viewerId = await optionalActiveUserId(ctx);

  if (subject.kind === 'group') {
    const row = liveGroupOrNull(await ctx.db.get('groups', subject.id));
    if (!row) {
      throw new Error(`Group with id ${subject.id} not found`);
    }
    const viewerMembership = await membershipFor(ctx, row._id, viewerId);
    return groupAccessFromLoaded(row, viewerId, viewerMembership);
  }

  if (subject.kind === 'faction') {
    const row = await ctx.db.get('factions', subject.id);
    if (!row) {
      throw new Error(`Faction with id ${subject.id} not found`);
    }
    const assignedGroup = liveGroupOrNull(row.group_id ? await ctx.db.get('groups', row.group_id) : null);
    const viewerMembership = await membershipFor(ctx, assignedGroup?._id ?? null, viewerId);
    return factionAccessFromLoaded(row, assignedGroup, viewerId, viewerMembership);
  }

  if (subject.kind === 'asset') {
    const row = await ctx.db.get('assets', subject.id);
    if (!row) {
      throw new Error(`Asset with id ${subject.id} not found`);
    }
    const assignedGroup = liveGroupOrNull(row.group_id ? await ctx.db.get('groups', row.group_id) : null);
    const viewerMembership = await membershipFor(ctx, assignedGroup?._id ?? null, viewerId);
    return assetAccessFromLoaded(row, assignedGroup, viewerId, viewerMembership);
  }

  const row = await ctx.db.get('rulesets', subject.id);
  if (!row) {
    throw new Error(`Ruleset with id ${subject.id} not found`);
  }
  const assignedGroup = liveGroupOrNull(row.group_id ? await ctx.db.get(row.group_id) : null);
  const viewerMembership = await membershipFor(ctx, assignedGroup?._id ?? null, viewerId);
  return rulesetAccessFromLoaded(row, assignedGroup, viewerId, viewerMembership);
}

export async function collaborativeAccessFor(ctx: AnyCtx, subject: CollaborativeSubject): Promise<CollaborativeAccess> {
  if (subject.kind === 'group') {
    return (await loadCollaborativeAccess(ctx, subject)).viewerAccess;
  }
  if (subject.kind === 'faction') {
    return (await loadCollaborativeAccess(ctx, subject)).viewerAccess;
  }
  if (subject.kind === 'ruleset') {
    return (await loadCollaborativeAccess(ctx, subject)).viewerAccess;
  }
  return (await loadCollaborativeAccess(ctx, subject)).viewerAccess;
}

export async function loadRulesetAccessForLoadedSubject(ctx: AnyCtx, ruleset: Doc<'rulesets'>) {
  const viewerId = await optionalActiveUserId(ctx);
  const assignedGroup = liveGroupOrNull(ruleset.group_id ? await ctx.db.get('groups', ruleset.group_id) : null);
  const viewerMembership = await membershipFor(ctx, assignedGroup?._id ?? null, viewerId);
  return rulesetAccessFromLoaded(ruleset, assignedGroup, viewerId, viewerMembership);
}

export async function requireGroupCapability(
  ctx: MutationCtx,
  groupId: Id<'groups'>,
  capability: keyof Extract<CollaborativeAccess, { kind: 'group' }>['capabilities'],
  message = 'Not authorized'
) {
  await requireAuthenticatedViewerId(ctx);
  const access = await loadCollaborativeAccess(ctx, { kind: 'group', id: groupId });
  if (!access.viewerAccess.capabilities[capability]) {
    throw new Error(message);
  }
  return access;
}

export async function requireFactionCapability(
  ctx: MutationCtx,
  factionId: Id<'factions'>,
  capability: keyof Extract<CollaborativeAccess, { kind: 'faction' }>['capabilities'],
  message = 'Not authorized'
) {
  await requireAuthenticatedViewerId(ctx);
  const access = await loadCollaborativeAccess(ctx, { kind: 'faction', id: factionId });
  if (!access.viewerAccess.capabilities[capability]) {
    throw new Error(message);
  }
  return access;
}

export async function requireRulesetCapability(
  ctx: MutationCtx,
  rulesetId: Id<'rulesets'>,
  capability: keyof Extract<CollaborativeAccess, { kind: 'ruleset' }>['capabilities'],
  message = 'Not authorized'
) {
  await requireAuthenticatedViewerId(ctx);
  const access = await loadCollaborativeAccess(ctx, { kind: 'ruleset', id: rulesetId });
  if (!access.viewerAccess.capabilities[capability]) {
    throw new Error(message);
  }
  return access;
}

export async function requireAssignableGroup(ctx: MutationCtx, groupId: Id<'groups'>) {
  return await requireGroupCapability(ctx, groupId, 'addMember', 'Not authorized for group');
}

export async function requireMembershipRequest(ctx: MutationCtx, groupId: Id<'groups'>) {
  const viewerId = await requireAuthenticatedViewerId(ctx);
  const group = liveGroupOrNull(await ctx.db.get('groups', groupId));
  if (!group) {
    throw new Error('Group not found');
  }
  const viewerMembership = await membershipFor(ctx, groupId, viewerId);
  const access = groupAccessFromLoaded(group, viewerId, viewerMembership);
  if (
    access.viewerMembership?.status !== 'pending' &&
    access.viewerMembership?.status !== 'active' &&
    !access.viewerAccess.capabilities.requestMembership
  ) {
    throw new Error('Not authorized');
  }
  return access;
}

export async function requireFactionUpdate(
  ctx: MutationCtx,
  factionId: Id<'factions'>,
  proposedData: { name: string }
) {
  await requireAuthenticatedViewerId(ctx);
  const access = await loadCollaborativeAccess(ctx, { kind: 'faction', id: factionId });
  if (access.subject.is_deleted) {
    throw new Error(`Faction with id ${factionId} not found`);
  }
  if (!access.viewerAccess.capabilities.edit) {
    throw new Error('Not authorized');
  }
  if (proposedData.name !== access.subject.data.name && !access.viewerAccess.capabilities.rename) {
    throw new Error('Not authorized');
  }
  return access;
}

/**
 * Authorizes an edit to a community Asset's content, the faction convention: `edit` gates the save, `rename` gates a name change (renames re-slug, so they move the asset's URL).
 */
export async function requireAssetUpdate(ctx: MutationCtx, assetId: Id<'assets'>, proposedName: string) {
  await requireAuthenticatedViewerId(ctx);
  const access = await loadCollaborativeAccess(ctx, { kind: 'asset', id: assetId });
  if (access.subject.is_deleted) {
    throw new Error(`Asset with id ${assetId} not found`);
  }
  if (!access.viewerAccess.capabilities.edit) {
    throw new Error('Not authorized');
  }
  const currentName = (access.subject.data as { name?: unknown } | null | undefined)?.name;
  if (proposedName !== currentName && !access.viewerAccess.capabilities.rename) {
    throw new Error('Not authorized');
  }
  return access;
}

/**
 * Authorizes an edit to a ruleset's own content: its name, cover and About.
 * Group assignment is deliberately not among them: it is a different capability with a different audience, so it goes through `requireGroupReassignment` from `rulesets.setGroup` instead, the same route factions already take.
 * A caller that cannot express a name, such as the cover rehost, omits `proposedChange` and the rename gate does not apply.
 */
export async function requireRulesetUpdate(ctx: AnyCtx, rulesetId: Id<'rulesets'>, proposedChange?: { name: string }) {
  await requireAuthenticatedViewerId(ctx);
  const access = await loadCollaborativeAccess(ctx, { kind: 'ruleset', id: rulesetId });
  if (access.subject.is_deleted) {
    throw new Error(`Ruleset with id ${rulesetId} not found`);
  }
  if (!access.viewerAccess.capabilities.edit) {
    throw new Error('Not authorized');
  }
  if (proposedChange && proposedChange.name !== access.subject.name && !access.viewerAccess.capabilities.rename) {
    throw new Error('Only the ruleset owner can rename this ruleset');
  }
  return access;
}

/** Names the subject in a not-found message, since the three kinds share one reassignment path. */
const REASSIGNMENT_SUBJECT_LABEL = { faction: 'Faction', ruleset: 'Ruleset', asset: 'Asset' } as const;

export function requireGroupReassignment(
  ctx: MutationCtx,
  subject: { kind: 'faction'; id: Id<'factions'> },
  targetGroupId: Id<'groups'> | null,
  message?: string
): Promise<LoadedFactionAccess>;
export function requireGroupReassignment(
  ctx: MutationCtx,
  subject: { kind: 'ruleset'; id: Id<'rulesets'> },
  targetGroupId: Id<'groups'> | null,
  message?: string
): Promise<LoadedRulesetAccess>;
export function requireGroupReassignment(
  ctx: MutationCtx,
  subject: { kind: 'asset'; id: Id<'assets'> },
  targetGroupId: Id<'groups'> | null,
  message?: string
): Promise<LoadedAssetAccess>;
export async function requireGroupReassignment(
  ctx: MutationCtx,
  subject:
    | { kind: 'faction'; id: Id<'factions'> }
    | { kind: 'ruleset'; id: Id<'rulesets'> }
    | { kind: 'asset'; id: Id<'assets'> },
  targetGroupId: Id<'groups'> | null,
  message = 'Not authorized'
) {
  await requireAuthenticatedViewerId(ctx);
  /*
   * Every branch calls the same function on purpose, and this is not redundant.
   * `loadCollaborativeAccess` is overloaded per subject kind, so handing it the union resolves to no overload and collapses `access` to `never`.
   * Discriminating the union first lets each call pick its own overload.
   */
  let access: LoadedFactionAccess | LoadedRulesetAccess | LoadedAssetAccess;
  switch (subject.kind) {
    case 'faction':
      access = await loadCollaborativeAccess(ctx, subject);
      break;
    case 'ruleset':
      access = await loadCollaborativeAccess(ctx, subject);
      break;
    case 'asset':
      access = await loadCollaborativeAccess(ctx, subject);
      break;
  }
  if (access.subject.is_deleted) {
    throw new Error(`${REASSIGNMENT_SUBJECT_LABEL[subject.kind]} with id ${subject.id} not found`);
  }
  if (!access.viewerAccess.capabilities.changeGroup) {
    throw new Error(message);
  }
  if (targetGroupId !== null) {
    await requireAssignableGroup(ctx, targetGroupId);
  }
  return access;
}

export async function requireFactionSoftDelete(ctx: MutationCtx, factionId: Id<'factions'>) {
  await requireAuthenticatedViewerId(ctx);
  const access = await loadCollaborativeAccess(ctx, { kind: 'faction', id: factionId });
  if (access.viewerId !== access.subject.owner_id) {
    throw new Error('Not authorized');
  }
  return access;
}

export async function requireAssetSoftDelete(ctx: MutationCtx, assetId: Id<'assets'>) {
  await requireAuthenticatedViewerId(ctx);
  const access = await loadCollaborativeAccess(ctx, { kind: 'asset', id: assetId });
  if (access.viewerId !== access.subject.owner_id) {
    throw new Error('Not authorized');
  }
  return access;
}

export async function requireRulesetSoftDelete(ctx: MutationCtx, rulesetId: Id<'rulesets'>) {
  await requireAuthenticatedViewerId(ctx);
  const access = await loadCollaborativeAccess(ctx, { kind: 'ruleset', id: rulesetId });
  if (access.viewerId !== access.subject.owner_id) {
    throw new Error('Not authorized');
  }
  return access;
}

export async function requireRulesetMaintenance(ctx: MutationCtx, rulesetId: Id<'rulesets'>) {
  await requireAuthenticatedViewerId(ctx);
  const ruleset = await ctx.db.get('rulesets', rulesetId);
  if (!ruleset || ruleset.is_deleted) {
    throw new Error('Ruleset not found');
  }
  const access = await loadRulesetAccessForLoadedSubject(ctx, ruleset);
  if (!access.viewerAccess.capabilities.edit) {
    throw new Error('Not authorized');
  }
  return access;
}

type LoadedFactionAccessBundle = LoadedFactionAccess & {
  assignableGroups: AssignedGroupSummary[];
};

type LoadedRulesetAccessBundle = LoadedRulesetAccess & {
  assignableGroups: AssignedGroupSummary[];
};

type LoadedAssetAccessBundle = LoadedAssetAccess & {
  assignableGroups: AssignedGroupSummary[];
};

export function loadAssetAccessBundle(
  ctx: QueryCtx,
  subject: { kind: 'faction'; row: Doc<'factions'> }
): Promise<LoadedFactionAccessBundle>;
export function loadAssetAccessBundle(
  ctx: QueryCtx,
  subject: { kind: 'ruleset'; row: Doc<'rulesets'> }
): Promise<LoadedRulesetAccessBundle>;
export function loadAssetAccessBundle(
  ctx: QueryCtx,
  subject: { kind: 'asset'; row: Doc<'assets'> }
): Promise<LoadedAssetAccessBundle>;
export async function loadAssetAccessBundle(
  ctx: QueryCtx,
  subject:
    | { kind: 'faction'; row: Doc<'factions'> }
    | { kind: 'ruleset'; row: Doc<'rulesets'> }
    | { kind: 'asset'; row: Doc<'assets'> }
): Promise<LoadedFactionAccessBundle | LoadedRulesetAccessBundle | LoadedAssetAccessBundle> {
  const viewerId = await optionalActiveUserId(ctx);
  const memberships = viewerId
    ? await ctx.db
        .query('group_members')
        .withIndex('by_user_status', (q) => q.eq('user_id', viewerId).eq('status', 'active'))
        .take(200)
    : [];
  const groupIds = new Set<Id<'groups'>>();
  if (subject.row.group_id) {
    groupIds.add(subject.row.group_id);
  }
  for (const membership of memberships) {
    groupIds.add(membership.group_id);
  }

  const groupById = new Map<Id<'groups'>, Doc<'groups'>>();
  const groups = await Promise.all([...groupIds].map((groupId) => ctx.db.get('groups', groupId)));
  for (const group of groups) {
    const live = liveGroupOrNull(group);
    if (live) {
      groupById.set(live._id, live);
    }
  }
  const assignedGroup = subject.row.group_id ? (groupById.get(subject.row.group_id) ?? null) : null;
  const viewerMembership = await membershipFor(ctx, subject.row.group_id, viewerId);
  const assignableGroups = memberships.flatMap((membership) => {
    const group = groupById.get(membership.group_id);
    return group ? [{ id: group._id, name: group.name, slug: group.slug }] : [];
  });

  switch (subject.kind) {
    case 'faction':
      return { ...factionAccessFromLoaded(subject.row, assignedGroup, viewerId, viewerMembership), assignableGroups };
    case 'ruleset':
      return { ...rulesetAccessFromLoaded(subject.row, assignedGroup, viewerId, viewerMembership), assignableGroups };
    case 'asset':
      return { ...assetAccessFromLoaded(subject.row, assignedGroup, viewerId, viewerMembership), assignableGroups };
  }
}

export type GroupRosterEntry = {
  membershipId: Id<'group_members'>;
  user: {
    id: Id<'profiles'>;
    slug: string;
    username: string | null;
    avatar_url: string | null;
  };
  status: 'pending' | 'active';
  requestedAt: string;
  capabilities: { approve: boolean; reject: boolean; remove: boolean };
};

export async function loadGroupAccessBundle(ctx: QueryCtx, group: Doc<'groups'>) {
  const viewerId = await optionalActiveUserId(ctx);
  const members = await ctx.db
    .query('group_members')
    .withIndex('by_group', (q) => q.eq('group_id', group._id))
    .take(500);
  const viewerMembership = await membershipFor(ctx, group._id, viewerId);
  const access = groupAccessFromLoaded(group, viewerId, viewerMembership);
  const profileByUserId = new Map<Id<'users'>, Doc<'profiles'>>();
  const userIds = new Set<Id<'users'>>([access.subject.created_by]);
  for (const membership of members) {
    userIds.add(membership.user_id);
  }
  const profiles = await Promise.all(
    [...userIds].map(async (userId) => {
      const profile = await ctx.db
        .query('profiles')
        .withIndex('by_user_id', (q) => q.eq('user_id', userId))
        .unique();
      if (!profile) {
        throw new Error(`Invariant: every user must have a profile (missing for ${userId})`);
      }
      return profile;
    })
  );
  for (const profile of profiles) {
    profileByUserId.set(profile.user_id, profile);
  }

  const actorIsActive =
    !group.is_deleted &&
    access.viewerAccess.viewer.kind === 'authenticated' &&
    access.viewerAccess.viewer.membership === 'active';
  const actorIsOwner = access.viewerAccess.capabilities.rename;
  const roster: GroupRosterEntry[] = members.flatMap((membership) => {
    if (membership.status === 'removed') {
      return [];
    }
    const profile = profileByUserId.get(membership.user_id);
    if (!profile) {
      throw new Error(`Invariant: every member must have a profile (missing for ${membership.user_id})`);
    }
    if (!isActiveProfile(profile)) {
      return [];
    }
    const pending = membership.status === 'pending';
    return [
      {
        membershipId: membership._id,
        user: {
          id: profile._id,
          slug: profile.slug,
          username: profile.username,
          avatar_url: profile.avatar_url,
        },
        status: membership.status,
        requestedAt: membership.requested_at,
        capabilities: {
          approve: actorIsActive && pending,
          reject: actorIsActive && pending,
          remove: actorIsOwner && !pending && membership.user_id !== access.subject.created_by,
        },
      },
    ];
  });

  const ownerProfile = profileByUserId.get(access.subject.created_by);
  const owner =
    ownerProfile && isActiveProfile(ownerProfile)
      ? {
          id: ownerProfile._id,
          slug: ownerProfile.slug,
          username: ownerProfile.username,
          avatar_url: ownerProfile.avatar_url,
        }
      : null;

  return { ...access, owner, roster };
}

export function evaluateCollaborativeAccess(facts: CollaborativeAccessFacts): CollaborativeAccess {
  const authenticated = facts.viewer.kind === 'authenticated';
  const membership: MembershipState | null =
    facts.viewer.kind === 'authenticated'
      ? facts.viewer.membership === 'removed'
        ? 'none'
        : facts.viewer.membership
      : null;
  const activeMember = authenticated && membership === 'active';
  const owner = facts.viewer.kind === 'authenticated' && facts.viewer.ownsSubject;
  const viewer: PublicViewer =
    facts.viewer.kind === 'anonymous' ? facts.viewer : { kind: 'authenticated', membership: membership ?? 'none' };
  const requestMembership = authenticated && membership === 'none' && facts.group.eligible;

  if (facts.kind === 'group') {
    return {
      kind: 'group',
      viewer,
      capabilities: {
        requestMembership,
        rename: owner && facts.group.eligible,
        delete: owner && facts.group.eligible,
        addMember: activeMember && facts.group.eligible,
      },
    };
  }

  return {
    kind: facts.kind,
    assignedGroup: facts.group.summary,
    viewer,
    capabilities: {
      requestMembership: requestMembership && facts.resource.available,
      edit: facts.resource.available && (owner || (activeMember && facts.group.eligible)),
      /* Factions and community Assets rename collaboratively (decision on the assets map: Asset access reuses Group-associated-asset semantics); rulesets reserve renames for their owner. */
      rename: facts.resource.available && (owner || (facts.kind !== 'ruleset' && activeMember && facts.group.eligible)),
      changeGroup: facts.resource.available && owner,
      delete: facts.resource.available && owner,
    },
  };
}
