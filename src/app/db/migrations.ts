import { useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';

import { useLiveMutation } from '@app/db/core/live';

import { api } from '../../../convex/_generated/api';

export type AdminMigrationDashboardData = FunctionReturnType<typeof api.migrations.adminDashboard>;
export function useAdminMigrationDashboard(ids?: string[]) {
  const args = ids ? { ids } : {};
  return useQuery(api.migrations.adminDashboard, args) as AdminMigrationDashboardData | undefined;
}

export function useSyncMigrationRuns() {
  return useLiveMutation<{ ids?: string[] }, { synced: number }>(api.migrations.syncMigrationRuns);
}
