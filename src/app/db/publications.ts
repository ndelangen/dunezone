import { useQuery } from 'convex/react';

import { useLiveMutation } from '@app/db/core/live';

import { api } from '../../../convex/_generated/api';

export type PublicationJobStatus = 'pending' | 'in_progress' | 'error';

export function usePublicationJobsPage(args: {
  status?: PublicationJobStatus;
  assetType?: string;
  page: number;
  pageSize: number;
}) {
  return useQuery(api.publicationAdmin.page, args);
}

export function useSetPublicationPickupEnabled() {
  return useLiveMutation<
    { enabled: boolean },
    { publicationPickupEnabled: boolean; updatedAt: number }
  >(api.publicationAdmin.setPickupEnabled);
}
