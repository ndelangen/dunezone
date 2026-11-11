import { usePaginatedQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';

import { toLiveQueryResult, useLiveMutation, useLiveQuery } from '@app/db/core/live';

import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';

export type ReplacementProfile = FunctionReturnType<typeof api.accountDeletion.listReplacementProfiles>['page'][number];

export function useAccountDeletionPage(profileSlug: string) {
  return toLiveQueryResult(useLiveQuery(api.accountDeletion.page, { profileSlug }));
}

export function useReplacementProfiles(search: string) {
  const result = usePaginatedQuery(api.accountDeletion.listReplacementProfiles, { search }, { initialNumItems: 24 });
  return {
    data: result.results,
    status: result.status,
    loadMore: () => result.loadMore(24),
  };
}

export function useAdminReplacementProfiles(search: string, sourceUserId: string) {
  const result = usePaginatedQuery(
    api.accountDeletion.adminListReplacementProfiles,
    { search, sourceUserId: sourceUserId as Id<'users'> },
    { initialNumItems: 24 }
  );
  return {
    data: result.results,
    status: result.status,
    loadMore: () => result.loadMore(24),
  };
}

export function useConfirmAccountDeletion() {
  return useLiveMutation<{ replacementUserId: string | null }, FunctionReturnType<typeof api.accountDeletion.confirm>>(
    api.accountDeletion.confirm
  );
}

export function useAccountModerationPage(profileSlug: string) {
  return toLiveQueryResult(useLiveQuery(api.accountDeletion.adminPage, { profileSlug }));
}

export function useBanAccount() {
  return useLiveMutation<
    { sourceUserId: string; replacementUserId: string | null; reason?: string },
    FunctionReturnType<typeof api.accountDeletion.adminBan>
  >(api.accountDeletion.adminBan);
}

export function useUnbanAccount() {
  return useLiveMutation<{ sourceUserId: string }, FunctionReturnType<typeof api.accountDeletion.adminUnban>>(
    api.accountDeletion.adminUnban
  );
}

export function useResumeAccountContentOperation() {
  return useLiveMutation<{ operationId: string }, FunctionReturnType<typeof api.accountDeletion.resume>>(
    api.accountDeletion.resume
  );
}
