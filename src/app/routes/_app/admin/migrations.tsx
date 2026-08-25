import { Group, Stack } from '@mantine/core';
import { createFileRoute } from '@tanstack/react-router';
import { LoginGate } from '@ui/block/LoginGate';
import { PageTitle } from '@ui/block/PageTitle';
import { IconAction } from '@ui/control/IconAction';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import { RefreshCw } from 'lucide-react';

import { loadAdminMigrationDashboard, useAdminMigrationDashboard, useSyncMigrationRuns } from '@db/migrations';
import { useCurrentProfile } from '@db/profiles';
import { PageMessage } from '@app/widgets/page-message/PageMessage';

export const Route = createFileRoute('/_app/admin/migrations')({
  loader: async () => ({ dashboard: await loadAdminMigrationDashboard() }),
  component: AdminMigrationsPage,
});

function formatDate(timestamp?: number) {
  if (!timestamp) {
    return '-';
  }
  return new Date(timestamp).toLocaleString();
}

const migrationsHeader = <PageTitle title="Migration activity" />;

function AdminMigrationsPage() {
  const loaderData = Route.useLoaderData();
  const profile = useCurrentProfile();
  const dashboardQuery = useAdminMigrationDashboard({ initialData: loaderData.dashboard });
  const dashboard = dashboardQuery.data;
  const syncRuns = useSyncMigrationRuns();

  /* The one gate with no way back, because this route has no parent in the navigation and today's
     version offers none either. Where an admin page sends a signed-out reader is a question about
     admin navigation rather than about this frame, so it is left as it was rather than invented. */
  if (!profile.data?._id) {
    return (
      <PageMessage title="Migration activity">
        <LoginGate action="view migration activity" />
      </PageMessage>
    );
  }

  return (
    <PageLayout>
      <PageLayout.Header>{migrationsHeader}</PageLayout.Header>
      <PageLayout.Content>
        <Stack gap="sm">
          {dashboardQuery.isPending && <p>Loading migration dashboard…</p>}
          <Surface padding="lg">
            <Stack gap="xs">
              <h2>Live migration status</h2>
              <Group gap="xs" wrap="nowrap">
                <IconAction
                  label="Sync migration status"
                  tooltip="Sync status snapshot to migration_runs table"
                  variant="filled"
                  color="confirm"
                  size="lg"
                  disabled={syncRuns.isPending}
                  onClick={() => syncRuns.mutate({})}
                  icon={<RefreshCw size={16} aria-hidden />}
                />
              </Group>
              <table>
                <thead>
                  <tr>
                    <th align="left">Migration</th>
                    <th align="left">State</th>
                    <th align="left">Done</th>
                    <th align="left">Processed</th>
                    <th align="left">Started</th>
                    <th align="left">Ended</th>
                    <th align="left">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {(dashboard?.statuses ?? []).map((row) => (
                    <tr key={row.name}>
                      <td>{row.name}</td>
                      <td>{row.state}</td>
                      <td>{row.isDone ? 'yes' : 'no'}</td>
                      <td>{row.processed}</td>
                      <td>{formatDate(row.latestStart)}</td>
                      <td>{formatDate(row.latestEnd)}</td>
                      <td>{row.error ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Stack>
          </Surface>

          <Surface padding="lg">
            <Stack gap="xs">
              <h2>Recorded snapshots</h2>
              <table>
                <thead>
                  <tr>
                    <th align="left">Migration ID</th>
                    <th align="left">State</th>
                    <th align="left">Done</th>
                    <th align="left">Processed</th>
                    <th align="left">Updated</th>
                    <th align="left">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {(dashboard?.snapshots ?? []).map((row) => (
                    <tr key={row._id}>
                      <td>{row.migration_id}</td>
                      <td>{row.state}</td>
                      <td>{row.is_done ? 'yes' : 'no'}</td>
                      <td>{row.processed}</td>
                      <td>{row.updated_at}</td>
                      <td>{row.error ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Stack>
          </Surface>
        </Stack>
      </PageLayout.Content>
    </PageLayout>
  );
}
