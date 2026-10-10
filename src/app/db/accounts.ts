import { useMutation, useQuery } from 'convex/react';

import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';

export type { AuthProvider } from '../../../convex/lib/accountMethods';
export function useAccountManagementPage(cursor: string | null, selectedUserIds: string[]) {
  return useQuery(api.accounts.adminPage, {
    paginationOpts: { cursor, numItems: 40 },
    selectedUserIds: selectedUserIds as Id<'users'>[],
  });
}
export function useMergeAccounts() {
  const mutate = useMutation(api.accounts.merge);
  return (sourceUserId: string, targetUserId: string) =>
    mutate({ sourceUserId: sourceUserId as Id<'users'>, targetUserId: targetUserId as Id<'users'> });
}
export function useResumeAccountMerge() {
  return useMutation(api.accounts.resumeMerge);
}
export function useBeginAuthConnection() {
  return useMutation(api.accounts.beginConnection);
}
export function useDisconnectAuthMethod() {
  return useMutation(api.accounts.disconnect);
}
export function useAuthConnection(token: string) {
  return useQuery(api.accounts.connection, { token });
}
export function useConfirmAuthConnection() {
  return useMutation(api.accounts.confirmConnection);
}
