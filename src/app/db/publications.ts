import { useQuery } from 'convex/react';

import { useLiveMutation } from '@app/db/core/live';

import { api } from '../../../convex/_generated/api';

export type PublicationJobStatus = 'pending' | 'in_progress' | 'error';

/** Admin only: the query refuses anyone else, so mount it behind the session gate, which asks for it only for an administrator. */
export function usePublicationJobsPage(args: {
  status?: PublicationJobStatus;
  assetType?: string;
  paginationOpts: { cursor: string | null; numItems: number };
}) {
  return useQuery(api.publicationAdmin.listing, args);
}

export function useSetPublicationPickupEnabled() {
  return useLiveMutation<{ enabled: boolean }, { publicationPickupEnabled: boolean; updatedAt: number }>(
    api.publicationAdmin.setPickupEnabled
  );
}
