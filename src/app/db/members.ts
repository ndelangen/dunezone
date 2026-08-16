import { useLiveMutation } from '@app/db/core/live';
import type { LiveMutationResult } from '@app/db/core/live';

import { api } from '../../../convex/_generated/api';
import type { Doc } from '../../../convex/_generated/dataModel';

export type GroupMemberRow = Doc<'group_members'>;
type MembershipCommandAcknowledgement = {
  membershipId: string;
  status: 'pending' | 'active' | 'removed';
};

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

export function useGroupMembershipWorkflow() {
  const requestMutation = useLiveMutation<{ group_id: string }, GroupMemberRow>(api.members.request);
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

  return {
    request: membershipCommand(requestMutation, (groupId: string) => ({ group_id: groupId })),
    approve: membershipCommand(
      approveMutation,
      (membershipId: string) => ({ membershipId }),
      () => {
        rejectMutation.reset();
        removeMutation.reset();
      }
    ),
    reject: membershipCommand(
      rejectMutation,
      (membershipId: string) => ({ membershipId }),
      () => {
        approveMutation.reset();
        removeMutation.reset();
      }
    ),
    remove: membershipCommand(
      removeMutation,
      (membershipId: string) => ({ membershipId }),
      () => {
        approveMutation.reset();
        rejectMutation.reset();
      }
    ),
    add: membershipCommand(addMutation, (input: { groupId: string; userId: string }) => input),
  };
}
