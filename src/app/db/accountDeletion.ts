import { usePaginatedQuery, useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';

import { toLiveQueryResult, useLiveMutation } from '@app/db/core/live';

import { api } from '../../../convex/_generated/api';

export type ReplacementProfile = FunctionReturnType<typeof api.accountDeletion.listReplacementProfiles>['page'][number];

export function useAccountDeletionPage(profileSlug: string) {
  return toLiveQueryResult(useQuery(api.accountDeletion.page, { profileSlug }));
}

export function useReplacementProfiles(search: string) {
  const result = usePaginatedQuery(api.accountDeletion.listReplacementProfiles, { search }, { initialNumItems: 24 });
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
