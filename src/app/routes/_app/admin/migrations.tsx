import { createFileRoute, Link } from '@tanstack/react-router';
import { RefreshCw } from 'lucide-react';

import { useCurrentProfile } from '@db/profiles';
import { FormTooltip } from '@app/components/form/FormTooltip';
import { ButtonGroup, Stack } from '@app/components/generic/layout';
import { Card } from '@app/components/generic/surfaces/Card';
import { UIButton } from '@app/components/generic/ui/UIButton';
import { PageLayout } from '@app/components/shell';
import {
  loadAdminMigrationDashboard,
  useAdminMigrationDashboard,
  useSyncMigrationRuns,
} from '@app/migrations/db';

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

function AdminMigrationsPage() {
  const loaderData = Route.useLoaderData();
  const profile = useCurrentProfile();
  const dashboard = useAdminMigrationDashboard({ initialData: loaderData.dashboard });
  const syncRuns = useSyncMigrationRuns();

  if (!profile.data?._id) {
    return (
      <PageLayout header={<h1>Migration activity</h1>}>
        <Card>
          <p>
            <Link to="/auth/login">Log in</Link> to view migration activity.
          </p>
        </Card>
      </PageLayout>
    );
  }

  return (
    <PageLayout header={<h1>Migration activity</h1>}>
      <Stack gap={3}>
        {dashboard.isPending && <p>Loading migration dashboard…</p>}
        <Card>
          <Stack gap={2}>
            <h2>Live migration status</h2>
            <ButtonGroup>
              <FormTooltip content="Sync status snapshot to migration_runs table">
                <UIButton
                  type="button"
                  iconOnly
                  aria-label="Sync migration status"
                  disabled={syncRuns.isPending}
                  onClick={() => syncRuns.mutate({})}
                >
                  <RefreshCw size={16} aria-hidden />
                </UIButton>
              </FormTooltip>
            </ButtonGroup>
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
                {dashboard.statuses.map((row) => (
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
        </Card>

        <Card>
          <Stack gap={2}>
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
                {dashboard.snapshots.map((row) => (
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
        </Card>
      </Stack>
    </PageLayout>
  );
}
