import { useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';

import { db } from '@db/core';
import { toLiveQueryResult, useLiveMutation } from '@app/db/core/live';

import { api } from '../../../convex/_generated/api';

export type AdminMigrationDashboardData = FunctionReturnType<typeof api.migrations.adminDashboard>;
export type MigrationStatusRow = AdminMigrationDashboardData['statuses'][number];
export type MigrationRunSnapshot = AdminMigrationDashboardData['snapshots'][number];

export async function loadAdminMigrationDashboard(
  ids?: string[]
): Promise<AdminMigrationDashboardData> {
  return await db.query(api.migrations.adminDashboard, { ids });
}

export function useAdminMigrationDashboard(options?: {
  initialData?: AdminMigrationDashboardData;
  ids?: string[];
}) {
  const args = options?.ids ? { ids: options.ids } : {};
  const liveData = useQuery(api.migrations.adminDashboard, args) as
    | AdminMigrationDashboardData
    | undefined;
  const result = toLiveQueryResult(liveData, true, () => options?.initialData);
  return {
    ...result,
    statuses: result.data?.statuses ?? [],
    snapshots: result.data?.snapshots ?? [],
  };
}

export function useSyncMigrationRuns() {
  return useLiveMutation<{ ids?: string[] }, { synced: number }>(api.migrations.syncMigrationRuns);
}
