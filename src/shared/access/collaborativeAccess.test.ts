import { describe, expect, test } from 'vitest';

import { groupAccessForViewer, groupRosterCapabilities, groupSubjectFacts } from './collaborativeAccess';
import type { AccessViewer, GroupRosterMemberFacts } from './collaborativeAccess';

/*
 * Expected values follow the per-viewer server read this replaced (`loadGroupAccessBundle`):
 * approve and reject went to an active member of a live Group on a pending membership,
 * remove to the owner (the `rename` capability) on an active membership that is not the owner's own.
 */
const OWNER = 'user-owner';

const pendingMember: GroupRosterMemberFacts = { status: 'pending', isGroupOwner: false };
const activeMember: GroupRosterMemberFacts = { status: 'active', isGroupOwner: false };
const ownerMember: GroupRosterMemberFacts = { status: 'active', isGroupOwner: true };

const NOTHING = { approve: false, reject: false, remove: false };

function signedIn(userId: string, membership: 'none' | 'pending' | 'active' | 'removed'): AccessViewer {
  return { kind: 'authenticated', userId, membership };
}

describe('groupAccessForViewer and groupRosterCapabilities', () => {
  test.each([
    {
      label: 'anonymous',
      viewer: { kind: 'anonymous' } as AccessViewer,
      deleted: false,
      publicViewer: { kind: 'anonymous' },
      capabilities: { requestMembership: false, rename: false, delete: false, addMember: false },
      roster: { pending: NOTHING, active: NOTHING, owner: NOTHING },
    },
    {
      label: 'signed in with no membership',
      viewer: signedIn('user-2', 'none'),
      deleted: false,
      publicViewer: { kind: 'authenticated', membership: 'none' },
      capabilities: { requestMembership: true, rename: false, delete: false, addMember: false },
      roster: { pending: NOTHING, active: NOTHING, owner: NOTHING },
    },
    {
      label: 'removed member, who reads as none',
      viewer: signedIn('user-2', 'removed'),
      deleted: false,
      publicViewer: { kind: 'authenticated', membership: 'none' },
      capabilities: { requestMembership: true, rename: false, delete: false, addMember: false },
      roster: { pending: NOTHING, active: NOTHING, owner: NOTHING },
    },
    {
      label: 'pending member',
      viewer: signedIn('user-2', 'pending'),
      deleted: false,
      publicViewer: { kind: 'authenticated', membership: 'pending' },
      capabilities: { requestMembership: false, rename: false, delete: false, addMember: false },
      roster: { pending: NOTHING, active: NOTHING, owner: NOTHING },
    },
    {
      label: 'active member who is not the owner',
      viewer: signedIn('user-2', 'active'),
      deleted: false,
      publicViewer: { kind: 'authenticated', membership: 'active' },
      capabilities: { requestMembership: false, rename: false, delete: false, addMember: true },
      roster: { pending: { approve: true, reject: true, remove: false }, active: NOTHING, owner: NOTHING },
    },
    {
      label: 'owner who is an active member',
      viewer: signedIn(OWNER, 'active'),
      deleted: false,
      publicViewer: { kind: 'authenticated', membership: 'active' },
      capabilities: { requestMembership: false, rename: true, delete: true, addMember: true },
      roster: {
        pending: { approve: true, reject: true, remove: false },
        active: { approve: false, reject: false, remove: true },
        owner: NOTHING,
      },
    },
    {
      label: 'owner without a membership',
      viewer: signedIn(OWNER, 'none'),
      deleted: false,
      publicViewer: { kind: 'authenticated', membership: 'none' },
      capabilities: { requestMembership: true, rename: true, delete: true, addMember: false },
      roster: { pending: NOTHING, active: { approve: false, reject: false, remove: true }, owner: NOTHING },
    },
    {
      label: 'owner of a deleted Group',
      viewer: signedIn(OWNER, 'active'),
      deleted: true,
      publicViewer: { kind: 'authenticated', membership: 'active' },
      capabilities: { requestMembership: false, rename: false, delete: false, addMember: false },
      roster: { pending: NOTHING, active: NOTHING, owner: NOTHING },
    },
    {
      label: 'active member of a deleted Group',
      viewer: signedIn('user-2', 'active'),
      deleted: true,
      publicViewer: { kind: 'authenticated', membership: 'active' },
      capabilities: { requestMembership: false, rename: false, delete: false, addMember: false },
      roster: { pending: NOTHING, active: NOTHING, owner: NOTHING },
    },
  ])('$label', ({ viewer, deleted, publicViewer, capabilities, roster }) => {
    const access = groupAccessForViewer(groupSubjectFacts({ created_by: OWNER, is_deleted: deleted }), viewer);
    expect(access).toEqual({ kind: 'group', viewer: publicViewer, capabilities });
    expect(groupRosterCapabilities(access, pendingMember)).toEqual(roster.pending);
    expect(groupRosterCapabilities(access, activeMember)).toEqual(roster.active);
    expect(groupRosterCapabilities(access, ownerMember)).toEqual(roster.owner);
  });
});
