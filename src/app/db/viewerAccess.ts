import { assetAccessForViewer } from '@shared/access/collaborativeAccess';
import type { AccessViewer, AssetSubjectFacts } from '@shared/access/collaborativeAccess';
import { useQuery } from 'convex/react';

import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import type { AssignedGroupSummary } from '../../../convex/lib/collaborativeAccess';

const ANONYMOUS: AccessViewer = { kind: 'anonymous' };

/**
 * Who the viewer is for one subject: their user id and their membership of the subject's Group, or undefined while either is on its way.
 * Page queries are `publicQuery`, one cached answer for everyone;
 * this is the small viewer half the browser combines with it.
 */
function useAccessViewer(groupId: Id<'groups'> | null): AccessViewer | undefined {
  const session = useQuery(api.profiles.session, {});
  const membership = useQuery(api.groups.viewerMembership, { groupId });
  if (session === undefined) {
    return undefined;
  }
  if (session.userId === null) {
    return ANONYMOUS;
  }
  if (membership === undefined) {
    return undefined;
  }
  return { kind: 'authenticated', userId: session.userId, membership };
}

/**
 * A faction, ruleset or asset page's capabilities for the current viewer, computed in the browser with the same rules the mutations enforce.
 * While the viewer is still resolving, `resolved` is false and the capabilities are the anonymous ones, so no control appears before it may.
 */
export function useAssetAccess<Kind extends AssetSubjectFacts['kind']>(
  subject: AssetSubjectFacts<AssignedGroupSummary> & { kind: Kind }
) {
  const viewer = useAccessViewer(subject.assignedGroup?.id ?? null);
  const access = assetAccessForViewer(subject, viewer ?? ANONYMOUS);
  return { resolved: viewer !== undefined, viewerAccess: { ...access, kind: subject.kind } };
}

/**
 * The Groups the viewer can move a subject into, for an edit page's Group picker.
 * Mounted only where that picker is, so a reading page never subscribes to it.
 */
export function useViewerAssignableGroups(): AssignedGroupSummary[] {
  return useQuery(api.groups.viewerAssignableGroups, {}) ?? [];
}
