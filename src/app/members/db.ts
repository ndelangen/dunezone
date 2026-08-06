import { useQuery } from 'convex/react';

import { db } from '@db/core';
import { toLiveQueryResult, useLiveMutation } from '@app/db/core/live';
import type { LiveMutationResult } from '@app/db/core/live';

import { api } from '../../../convex/_generated/api';
import type { Doc } from '../../../convex/_generated/dataModel';

export type GroupMemberRow = Doc<'group_members'>;
export type GroupMemberEntry = GroupMemberRow & { id: string };
export type GroupMemberInsert = GroupMemberEntry;
export type GroupMemberUpdate = Partial<GroupMemberEntry>;
export type GroupMemberStatus = GroupMemberRow['status'];

type MembershipCommandAcknowledgement = {
  membershipId: string;
  status: GroupMemberStatus;
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
  variables: (input: TInput) => TVariables
): GroupMembershipCommand<TInput> {
  return {
    run: async (input) => {
      await mutation.mutateAsync(variables(input));
    },
    isPending: mutation.isPending,
    isError: mutation.isError,
    error: mutation.error,
    reset: mutation.reset,
  };
}

export async function loadGroupMembersByStatus(
  groupId: string,
  status: GroupMemberStatus
): Promise<GroupMemberEntry[]> {
  const entries = await db.query<GroupMemberRow[]>(api.members.listByGroupAndStatus, {
    group_id: groupId,
    status,
  });
  return entries.map((entry) => ({ ...entry, id: entry._id }));
}

export async function loadGroupMembers(groupId: string): Promise<GroupMemberEntry[]> {
  const entries = await db.query<GroupMemberRow[]>(api.members.listByGroup, {
    group_id: groupId,
  });
  return entries.map((entry) => ({ ...entry, id: entry._id }));
}

/** Mount only when `groupId` is a real group id. */
export function useGroupMembers(groupId: string, options?: { initialData?: GroupMemberEntry[] }) {
  const liveData = useQuery(api.members.listByGroup, { group_id: groupId } as never) as
    | GroupMemberRow[]
    | undefined;
  const result = toLiveQueryResult(liveData, true, () => options?.initialData ?? undefined);
  return {
    ...result,
    data: result.data?.map((entry) => ({ ...entry, id: entry._id })),
  };
}

export function useGroupMembersByStatus(
  groupId: string,
  status: GroupMemberStatus,
  options?: { initialData?: GroupMemberEntry[] }
) {
  const liveData = useQuery(api.members.listByGroupAndStatus, {
    group_id: groupId,
    status,
  } as never) as GroupMemberRow[] | undefined;
  const result = toLiveQueryResult(liveData, true, () => options?.initialData ?? undefined);
  return {
    ...result,
    data: result.data?.map((entry) => ({ ...entry, id: entry._id })),
  };
}

export function useGroupMember(groupId: string, userId: string) {
  const liveData = useQuery(api.members.get, {
    group_id: groupId,
    user_id: userId,
  } as never) as GroupMemberRow | undefined;
  const result = toLiveQueryResult(liveData, true);
  return {
    ...result,
    data: result.data ? { ...result.data, id: result.data._id } : undefined,
  };
}

export function useGroupMembershipWorkflow() {
  const requestMutation = useLiveMutation<{ group_id: string }, GroupMemberRow>(
    api.members.request
  );
  const approveMutation = useLiveMutation<
    { membershipId: string },
    MembershipCommandAcknowledgement
  >(api.members.approveRequest);
  const rejectMutation = useLiveMutation<
    { membershipId: string },
    MembershipCommandAcknowledgement
  >(api.members.rejectRequest);
  const removeMutation = useLiveMutation<
    { membershipId: string },
    MembershipCommandAcknowledgement
  >(api.members.removeMember);
  const addMutation = useLiveMutation<
    { groupId: string; userId: string },
    MembershipCommandAcknowledgement
  >(api.members.addMember);

  return {
    request: membershipCommand(requestMutation, (groupId: string) => ({ group_id: groupId })),
    approve: membershipCommand(approveMutation, (membershipId: string) => ({ membershipId })),
    reject: membershipCommand(rejectMutation, (membershipId: string) => ({ membershipId })),
    remove: membershipCommand(removeMutation, (membershipId: string) => ({ membershipId })),
    add: membershipCommand(addMutation, (input: { groupId: string; userId: string }) => input),
  };
}

export function useRequestGroupMembership() {
  const mutation = useLiveMutation<{ group_id: string }, GroupMemberRow>(api.members.request);
  return {
    ...mutation,
    mutate: (
      groupId: string,
      options?: { onSuccess?: (entry: GroupMemberEntry) => void; onError?: (error: Error) => void }
    ) =>
      mutation.mutate(
        { group_id: groupId },
        {
          onSuccess: (entry) => options?.onSuccess?.({ ...entry, id: entry._id }),
          onError: (error) => options?.onError?.(error),
        }
      ),
    mutateAsync: async (groupId: string) => {
      const entry = await mutation.mutateAsync({ group_id: groupId });
      return { ...entry, id: entry._id };
    },
  };
}

export function useApproveGroupMember() {
  const mutation = useLiveMutation<{ group_id: string; user_id: string }, GroupMemberRow>(
    api.members.approve
  );
  return {
    ...mutation,
    mutate: (
      variables: { groupId: string; userId: string },
      options?: { onSuccess?: (entry: GroupMemberEntry) => void; onError?: (error: Error) => void }
    ) =>
      mutation.mutate(
        { group_id: variables.groupId, user_id: variables.userId },
        {
          onSuccess: (entry) => options?.onSuccess?.({ ...entry, id: entry._id }),
          onError: (error) => options?.onError?.(error),
        }
      ),
    mutateAsync: async ({ groupId, userId }: { groupId: string; userId: string }) => {
      const entry = await mutation.mutateAsync({ group_id: groupId, user_id: userId });
      return { ...entry, id: entry._id };
    },
  };
}

export function useRejectGroupMember() {
  const mutation = useLiveMutation<{ group_id: string; user_id: string }, GroupMemberRow>(
    api.members.reject
  );
  return {
    ...mutation,
    mutate: (
      variables: { groupId: string; userId: string },
      options?: { onSuccess?: (entry: GroupMemberEntry) => void; onError?: (error: Error) => void }
    ) =>
      mutation.mutate(
        { group_id: variables.groupId, user_id: variables.userId },
        {
          onSuccess: (entry) => options?.onSuccess?.({ ...entry, id: entry._id }),
          onError: (error) => options?.onError?.(error),
        }
      ),
    mutateAsync: async ({ groupId, userId }: { groupId: string; userId: string }) => {
      const entry = await mutation.mutateAsync({ group_id: groupId, user_id: userId });
      return { ...entry, id: entry._id };
    },
  };
}

export function useRemoveGroupMember() {
  const mutation = useLiveMutation<
    { group_id: string; user_id: string },
    { groupId: string; userId: string }
  >(api.members.remove);
  return {
    ...mutation,
    mutate: (
      variables: { groupId: string; userId: string },
      options?: {
        onSuccess?: (entry: { groupId: string; userId: string }) => void;
        onError?: (error: Error) => void;
      }
    ) =>
      mutation.mutate(
        { group_id: variables.groupId, user_id: variables.userId },
        {
          onSuccess: (entry) => options?.onSuccess?.(entry),
          onError: (error) => options?.onError?.(error),
        }
      ),
    mutateAsync: async ({ groupId, userId }: { groupId: string; userId: string }) =>
      await mutation.mutateAsync({ group_id: groupId, user_id: userId }),
  };
}

export function useAddGroupMember() {
  const mutation = useLiveMutation<{ group_id: string; user_id: string }, GroupMemberRow>(
    api.members.add
  );
  return {
    ...mutation,
    mutate: (
      variables: { groupId: string; userId: string },
      options?: { onSuccess?: (entry: GroupMemberEntry) => void; onError?: (error: Error) => void }
    ) =>
      mutation.mutate(
        { group_id: variables.groupId, user_id: variables.userId },
        {
          onSuccess: (entry) => options?.onSuccess?.({ ...entry, id: entry._id }),
          onError: (error) => options?.onError?.(error),
        }
      ),
    mutateAsync: async ({ groupId, userId }: { groupId: string; userId: string }) => {
      const entry = await mutation.mutateAsync({ group_id: groupId, user_id: userId });
      return { ...entry, id: entry._id };
    },
  };
}
