import { useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';

import { useLiveMutation } from '@app/db/core/live';

import { api } from '../../../convex/_generated/api';

type AdminMigrationDashboardData = FunctionReturnType<typeof api.migrations.adminDashboard>;
/** Admin only: the query refuses anyone else, so mount it behind the session gate, which asks for it only for an administrator. */
export function useAdminMigrationDashboard(ids?: string[]) {
  const args = ids ? { ids } : {};
  return useQuery(api.migrations.adminDashboard, args) as AdminMigrationDashboardData | undefined;
}

export function useSyncMigrationRuns() {
  return useLiveMutation<{ ids?: string[] }, { synced: number }>(api.migrations.syncMigrationRuns);
}
