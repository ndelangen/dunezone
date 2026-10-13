import { useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';

import { useLiveMutation } from '@app/db/core/live';

import { api } from '../../../convex/_generated/api';

type AdminMigrationDashboardData = FunctionReturnType<typeof api.migrations.adminDashboard>;
/** Admin only: the query refuses anyone else, so mount this only once the session says the viewer is an admin. */
export function useAdminMigrationDashboard(ids?: string[]) {
  const args = ids ? { ids } : {};
  return useQuery(api.migrations.adminDashboard, args) as AdminMigrationDashboardData | undefined;
}

export function useSyncMigrationRuns() {
  return useLiveMutation<{ ids?: string[] }, { synced: number }>(api.migrations.syncMigrationRuns);
}
