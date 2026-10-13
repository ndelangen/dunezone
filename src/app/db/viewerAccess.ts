import { assetAccessForViewer, groupAccessForViewer, groupSubjectFacts } from '@shared/access/collaborativeAccess';
import type { AccessViewer, AssetSubjectFacts } from '@shared/access/collaborativeAccess';
import { useQuery } from 'convex/react';
import { useState } from 'react';

import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import type { AssignedGroupSummary } from '../../../convex/lib/collaborativeAccess';

const ANONYMOUS: AccessViewer = { kind: 'anonymous' };

/** Hooks run unconditionally, so a page still on its way needs facts too: an unavailable subject with no owner grants nothing. */
export const UNAVAILABLE_SUBJECT = { owner_id: '', is_deleted: true };

/**
 * Who the viewer is for one subject: their user id and their membership of the subject's Group, or undefined while either is on its way.
 * Page queries are `publicQuery`, one cached answer for everyone;
 * this is the small viewer half the browser combines with it.
 *
 * Once resolved, the viewer stays resolved while a new membership loads (the subject moved to another Group):
 * Convex answers undefined for new arguments, and treating that as "unknown" would unmount an open editor and lose its draft.
 * The last answer is kept only for the same signed-in user;
 * the mutations re-check every write regardless.
 */
function useAccessViewer(groupId: Id<'groups'> | null): AccessViewer | undefined {
  const session = useQuery(api.profiles.session, {});
  /*
   * Until the session says who this is, ask about no Group: the answer is "none" without a read,
   * so an anonymous visitor's subscription costs nothing and never invalidates.
   */
  const membership = useQuery(api.groups.viewerMembership, { groupId: session?.userId ? groupId : null });
  const [held, setHeld] = useState<{ userId: Id<'users'>; membership: NonNullable<typeof membership> } | null>(null);
  if (session === undefined) {
    return undefined;
  }
  if (session.userId === null) {
    return ANONYMOUS;
  }
  if (membership === undefined) {
    return held?.userId === session.userId
      ? { kind: 'authenticated', userId: session.userId, membership: held.membership }
      : undefined;
  }
  if (held?.userId !== session.userId || held.membership !== membership) {
    /* Derived state set during render, React's documented pattern for remembering the previous answer. */
    setHeld({ userId: session.userId, membership });
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
 * A Group page's capabilities for the current viewer (null while the page is on its way), computed in the browser with the same rules the mutations enforce.
 * While the viewer is still resolving, `resolved` is false and the capabilities are the anonymous ones, so no control appears before it may.
 */
export function useGroupAccess(group: { _id: Id<'groups'>; created_by: string; is_deleted: boolean } | null) {
  const viewer = useAccessViewer(group?._id ?? null);
  const subject = groupSubjectFacts(group ?? { created_by: UNAVAILABLE_SUBJECT.owner_id, is_deleted: true });
  return { resolved: viewer !== undefined, viewerAccess: groupAccessForViewer(subject, viewer ?? ANONYMOUS) };
}

/**
 * The Groups the viewer can move a subject into, for an edit page's Group picker.
 * Mounted only where that picker is, so a reading page never subscribes to it.
 */
export function useViewerAssignableGroups(): AssignedGroupSummary[] {
  return useQuery(api.groups.viewerAssignableGroups, {}) ?? [];
}

/** The viewer's user id: null when signed out, undefined while the session is on its way. */
export function useViewerUserId(): Id<'users'> | null | undefined {
  const session = useQuery(api.profiles.session, {});
  return session === undefined ? undefined : session.userId;
}

/** Whether the viewer is an administrator, for the few page actions only admins see. False while the session is on its way. */
export function useViewerIsAdmin(): boolean {
  return useQuery(api.profiles.session, {})?.isAdmin === true;
}
