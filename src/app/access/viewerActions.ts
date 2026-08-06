import type {
  AssignedGroupSummary,
  CollaborativeAccess,
  MembershipState,
} from '../../../convex/lib/collaborativeAccess';

export type ViewerActions = {
  /** Anonymous viewers report 'none'; the log-in affordance keys off `isAnonymous`. */
  membershipStatus: MembershipState;
  isAnonymous: boolean;
  canRequestMembership: boolean;
  canEdit: boolean;
  canDelete: boolean;
  /** Resolved assignment summary (asset kinds only); null when unassigned or dangling. */
  assignedGroup: AssignedGroupSummary | null;
  /** Offer assignment only when the subject row carries no assignment at all. */
  assignGroup: boolean;
  /** Removal stays available for dangling assignments (row assigned, group unresolvable). */
  removeGroup: boolean;
  askQuestion: boolean;
};

/**
 * The one capability projection for detail routes: ruleset, faction, and group pages derive their
 * action visibility from the page's `viewerAccess` through this instead of unpacking capabilities
 * inline.
 */
export function viewerActionsFor(
  access: CollaborativeAccess | undefined,
  context: { hasProfile?: boolean; subjectGroupId?: unknown } = {}
): ViewerActions {
  const isAsset = access !== undefined && access.kind !== 'group';
  const canChangeGroup = isAsset ? access.capabilities.changeGroup : false;
  const hasAssignment = context.subjectGroupId != null;
  return {
    membershipStatus: access?.viewer.kind === 'authenticated' ? access.viewer.membership : 'none',
    isAnonymous: access === undefined || access.viewer.kind === 'anonymous',
    canRequestMembership: access?.capabilities.requestMembership ?? false,
    canEdit: isAsset ? access.capabilities.edit : false,
    canDelete: access?.capabilities.delete ?? false,
    assignedGroup: isAsset ? access.assignedGroup : null,
    assignGroup: canChangeGroup && !hasAssignment,
    removeGroup: canChangeGroup && hasAssignment,
    askQuestion: context.hasProfile ?? false,
  };
}
