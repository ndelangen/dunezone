import { usePaginatedQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';

import { toLiveQueryResult, useLiveMutation, useLiveQuery } from '@app/db/core/live';
import type { LiveMutationResult } from '@app/db/core/live';

import { api } from '../../../convex/_generated/api';
import type { Doc, Id } from '../../../convex/_generated/dataModel';

export type GroupMemberRow = Doc<'group_members'>;
type MembershipCommandAcknowledgement = {
  membershipId: string;
  status: 'pending' | 'active' | 'removed' | 'invited';
};

/** One invitation as the invited person sees it: the Group, who asked, and when. */
export type ViewerInvitation = FunctionReturnType<typeof api.members.viewerInvitations>[number];
/** One invitation as a Group's active members see it: who was asked, by whom, and when. */
export type GroupInvitation = FunctionReturnType<typeof api.members.groupInvitations>[number];
/** A person the invite picker offers. */
export type InviteCandidate = FunctionReturnType<typeof api.members.inviteCandidates>['page'][number];

type GroupMembershipCommand<TInput> = {
  run: (input: TInput) => Promise<void>;
  isPending: boolean;
  isError: boolean;
  error: Error | null;
  reset: () => void;
};

function membershipCommand<TInput, TVariables, TResult>(
  mutation: LiveMutationResult<TVariables, TResult>,
  variables: (input: TInput) => TVariables,
  beforeRun?: () => void
): GroupMembershipCommand<TInput> {
  return {
    run: async (input) => {
      beforeRun?.();
      await mutation.mutateAsync(variables(input));
    },
    isPending: mutation.isPending,
    isError: mutation.isError,
    error: mutation.error,
    reset: mutation.reset,
  };
}

/**
 * The membership commands, by name.
 * The viewer's own take a Group id (`request`, `withdraw`, `accept`, `decline`, `leave`);
 * moderation takes the membership id the roster or invitation list carries (`approve`, `reject`, `remove`);
 * `add` sends an invitation, and approves a request the person already made.
 */
export function useGroupMembershipWorkflow() {
  const requestMutation = useLiveMutation<{ group_id: string }, GroupMemberRow>(api.members.request);
  const withdrawMutation = useLiveMutation<{ group_id: string }, MembershipCommandAcknowledgement>(
    api.members.withdrawRequest
  );
  const acceptMutation = useLiveMutation<{ group_id: string }, MembershipCommandAcknowledgement>(
    api.members.acceptInvite
  );
  const declineMutation = useLiveMutation<{ group_id: string }, MembershipCommandAcknowledgement>(
    api.members.declineInvite
  );
  const leaveMutation = useLiveMutation<{ group_id: string }, MembershipCommandAcknowledgement>(api.members.leave);
  const approveMutation = useLiveMutation<{ membershipId: string }, MembershipCommandAcknowledgement>(
    api.members.approveRequest
  );
  const rejectMutation = useLiveMutation<{ membershipId: string }, MembershipCommandAcknowledgement>(
    api.members.rejectRequest
  );
  const removeMutation = useLiveMutation<{ membershipId: string }, MembershipCommandAcknowledgement>(
    api.members.removeMember
  );
  const addMutation = useLiveMutation<{ groupId: string; userId: string }, MembershipCommandAcknowledgement>(
    api.members.addMember
  );

  const byGroup = (groupId: string) => ({ group_id: groupId });
  const byMembership = (membershipId: string) => ({ membershipId });

  return {
    request: membershipCommand(requestMutation, byGroup, () => {
      withdrawMutation.reset();
      acceptMutation.reset();
      declineMutation.reset();
      leaveMutation.reset();
    }),
    withdraw: membershipCommand(withdrawMutation, byGroup, () => {
      requestMutation.reset();
      acceptMutation.reset();
      declineMutation.reset();
      leaveMutation.reset();
    }),
    accept: membershipCommand(acceptMutation, byGroup, () => {
      requestMutation.reset();
      withdrawMutation.reset();
      declineMutation.reset();
      leaveMutation.reset();
    }),
    decline: membershipCommand(declineMutation, byGroup, () => {
      requestMutation.reset();
      withdrawMutation.reset();
      acceptMutation.reset();
      leaveMutation.reset();
    }),
    leave: membershipCommand(leaveMutation, byGroup, () => {
      requestMutation.reset();
      withdrawMutation.reset();
      acceptMutation.reset();
      declineMutation.reset();
    }),
    approve: membershipCommand(approveMutation, byMembership, () => {
      rejectMutation.reset();
      removeMutation.reset();
      addMutation.reset();
    }),
    reject: membershipCommand(rejectMutation, byMembership, () => {
      approveMutation.reset();
      removeMutation.reset();
      addMutation.reset();
    }),
    remove: membershipCommand(removeMutation, byMembership, () => {
      approveMutation.reset();
      rejectMutation.reset();
      addMutation.reset();
    }),
    add: membershipCommand(
      addMutation,
      (input: { groupId: string; userId: string }) => input,
      () => {
        approveMutation.reset();
        rejectMutation.reset();
        removeMutation.reset();
      }
    ),
  };
}

/** The invitations waiting on the viewer. Mount it only for a signed-in viewer who may hold one, since it answers nobody else. */
export function useViewerInvitations() {
  return toLiveQueryResult(useLiveQuery(api.members.viewerInvitations, {}));
}

/** A Group's open invitations. Answers only an active member, so mount it only for one. */
export function useGroupInvitations(groupId: string) {
  return toLiveQueryResult(useLiveQuery(api.members.groupInvitations, { groupId: groupId as Id<'groups'> }));
}

/** The people the viewer may invite into a Group, by slug prefix, a page at a time. Mounted by the invite picker alone. */
export function useInviteCandidates(groupId: string, search: string) {
  const result = usePaginatedQuery(
    api.members.inviteCandidates,
    { groupId: groupId as Id<'groups'>, search },
    { initialNumItems: 24 }
  );
  return {
    data: result.results,
    status: result.status,
    loadMore: () => result.loadMore(24),
  };
}
