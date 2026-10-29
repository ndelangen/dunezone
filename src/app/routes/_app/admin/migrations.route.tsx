import { Anchor, Group, Stack, Table } from '@mantine/core';
import { createFileRoute, Link } from '@tanstack/react-router';
import { PageTitle } from '@ui/block/PageTitle';
import { Section } from '@ui/block/Section';
import { IconAction } from '@ui/control/IconAction';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import { RefreshCw } from 'lucide-react';

import { useAdminMigrationDashboard, useSyncMigrationRuns } from '@db/migrations';
import { pageHead } from '@app/routes/pageTitle';
import { AdminPageLoading } from '@app/widgets/page-message/AdminGate';

export const Route = createFileRoute('/_app/admin/migrations')({
  head: () => pageHead('Migration activity'),
  component: MigrationDashboard,
});

function formatDate(timestamp?: number) {
  if (!timestamp) {
    return '-';
  }
  return new Date(timestamp).toLocaleString();
}

const migrationsHeader = <PageTitle title="Migration activity" />;

function MigrationsLoading() {
  return <AdminPageLoading title="Migration activity">The migration dashboard is still loading.</AdminPageLoading>;
}

/** Mounted only for an administrator, so the admin-only query is never asked by anyone else. */
function MigrationDashboard() {
  const dashboard = useAdminMigrationDashboard();
  const syncRuns = useSyncMigrationRuns();

  if (dashboard === undefined) {
    return <MigrationsLoading />;
  }

  return (
    <PageLayout>
      <PageLayout.Header>{migrationsHeader}</PageLayout.Header>
      <PageLayout.Toolbar>
        <Anchor renderRoot={(props) => <Link {...props} to="/admin" />}>All admin tools</Anchor>
      </PageLayout.Toolbar>
      <PageLayout.Content>
        <Stack gap="sm">
          <Section title="Live migration status">
            <Surface padding="lg">
              <Stack gap="xs">
                <Group gap="xs" wrap="nowrap">
                  <IconAction
                    label="Sync migration status"
                    tooltip="Sync status snapshot to migration_runs table"
                    emphasis="strong"
                    intent="positive"
                    size="lg"
                    disabled={syncRuns.isPending}
                    onClick={() => syncRuns.mutate({})}
                    icon={<RefreshCw size={16} aria-hidden />}
                  />
                </Group>
                <Table.ScrollContainer minWidth={800}>
                  <Table striped>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Migration</Table.Th>
                        <Table.Th>State</Table.Th>
                        <Table.Th>Done</Table.Th>
                        <Table.Th>Processed</Table.Th>
                        <Table.Th>Started</Table.Th>
                        <Table.Th>Ended</Table.Th>
                        <Table.Th>Error</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {dashboard.statuses.map((row) => (
                        <Table.Tr key={row.name}>
                          <Table.Td>{row.name}</Table.Td>
                          <Table.Td>{row.state}</Table.Td>
                          <Table.Td>{row.isDone ? 'yes' : 'no'}</Table.Td>
                          <Table.Td>{row.processed}</Table.Td>
                          <Table.Td>{formatDate(row.latestStart)}</Table.Td>
                          <Table.Td>{formatDate(row.latestEnd)}</Table.Td>
                          <Table.Td>{row.error ?? '-'}</Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </Table.ScrollContainer>
              </Stack>
            </Surface>
          </Section>

          <Section title="Recorded snapshots">
            <Surface padding="lg">
              <Stack gap="xs">
                <Table.ScrollContainer minWidth={800}>
                  <Table striped>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Migration ID</Table.Th>
                        <Table.Th>State</Table.Th>
                        <Table.Th>Done</Table.Th>
                        <Table.Th>Processed</Table.Th>
                        <Table.Th>Updated</Table.Th>
                        <Table.Th>Error</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {dashboard.snapshots.map((row) => (
                        <Table.Tr key={row._id}>
                          <Table.Td>{row.migration_id}</Table.Td>
                          <Table.Td>{row.state}</Table.Td>
                          <Table.Td>{row.is_done ? 'yes' : 'no'}</Table.Td>
                          <Table.Td>{row.processed}</Table.Td>
                          <Table.Td>{row.updated_at}</Table.Td>
                          <Table.Td>{row.error ?? '-'}</Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </Table.ScrollContainer>
              </Stack>
            </Surface>
          </Section>
        </Stack>
      </PageLayout.Content>
    </PageLayout>
  );
}
