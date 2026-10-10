import { useMutation, useQuery } from 'convex/react';
import { useState } from 'react';

import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import type { AuthProvider } from '../../../convex/lib/accountMethods';

export const authProviderNames = { google: 'Google', discord: 'Discord', reddit: 'Reddit' } satisfies Record<
  AuthProvider,
  string
>;

export function useSignInProviders() {
  return useQuery(api.accounts.providers, {});
}

export type { AuthProvider } from '../../../convex/lib/accountMethods';
/** The admin accounts page. Choosing a profile or another page changes the arguments, so the last answer stays on screen until the next one arrives rather than the form unmounting into a loading state. */
export function useAccountManagementPage(cursor: string | null, selectedUserIds: string[]) {
  const page = useQuery(api.accounts.adminPage, {
    paginationOpts: { cursor, numItems: 40 },
    selectedUserIds: selectedUserIds as Id<'users'>[],
  });
  const [shown, setShown] = useState(page);
  if (page !== undefined && page !== shown) {
    setShown(page);
  }
  return page ?? shown;
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
