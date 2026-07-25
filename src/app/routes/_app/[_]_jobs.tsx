import {
  Alert,
  Badge,
  Center,
  Code,
  Group,
  Loader,
  Pagination,
  Paper,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { createFileRoute } from '@tanstack/react-router';
import { AlertCircle, BriefcaseBusiness } from 'lucide-react';
import { useState } from 'react';

import { PageLayout } from '@app/components/shell';
import {
  type PublicationJobStatus,
  usePublicationJobsPage,
  useSetPublicationPickupEnabled,
} from '@app/publications/db';

const PAGE_SIZE = 25;

export const Route = createFileRoute('/_app/__jobs')({
  codeSplitGroupings: [['component']],
  component: PublicationJobsPage,
});

function PublicationJobsPage() {
  const [status, setStatus] = useState<PublicationJobStatus | undefined>();
  const [assetType, setAssetType] = useState<string | undefined>();
  const [page, setPage] = useState(1);
  const result = usePublicationJobsPage({
    status,
    assetType,
    page,
    pageSize: PAGE_SIZE,
  });
  const pickupMutation = useSetPublicationPickupEnabled();

  return (
    <PageLayout
      headerSize="compact"
      header={
        <Stack align="center" gap="xs">
          <BriefcaseBusiness size={32} strokeWidth={1.6} aria-hidden />
          <Title order={1}>Publication jobs</Title>
          <Text ta="center" maw={680}>
            Inspect the durable work queue and control whether the next scheduled run may pick up
            pending work.
          </Text>
        </Stack>
      }
    >
      {result === undefined ? (
        <Center py="xl">
          <Loader aria-label="Loading publication jobs" />
        </Center>
      ) : result.access === 'unauthenticated' ? (
        <Alert icon={<AlertCircle size={18} />} title="Sign in required" color="yellow">
          Sign in with an administrator account to inspect publication jobs.
        </Alert>
      ) : result.access === 'not_authorized' ? (
        <Alert icon={<AlertCircle size={18} />} title="Not authorized" color="red">
          Your account does not have permission to view publication jobs.
        </Alert>
      ) : (
        <Stack gap="lg">
          <Paper withBorder p="lg" radius="md">
            <Stack gap="lg">
              <Group justify="space-between" align="flex-start" wrap="wrap">
                <div>
                  <Text fw={700}>Publisher pickup</Text>
                  <Text size="sm" c="dimmed" maw={620}>
                    Turning this off only prevents the next cron run from picking up pending jobs.
                    It does not interrupt work already in progress.
                  </Text>
                </div>
                <Switch
                  size="lg"
                  checked={result.settings?.publicationPickupEnabled ?? false}
                  disabled={result.settings === null || pickupMutation.isPending}
                  label={result.settings?.publicationPickupEnabled ? 'Enabled' : 'Disabled'}
                  onChange={(event) =>
                    pickupMutation.mutate({ enabled: event.currentTarget.checked })
                  }
                />
              </Group>

              {pickupMutation.isError ? (
                <Alert color="red" title="Could not update publisher pickup">
                  {pickupMutation.error?.message}
                </Alert>
              ) : null}

              <Group gap="xl" align="flex-start" wrap="wrap">
                <Count label="Pending" value={result.counts.pending} color="yellow" />
                <Count label="In progress" value={result.counts.inProgress} color="blue" />
                <Count label="Error" value={result.counts.error} color="red" />
                <div>
                  <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                    Renderer revisions
                  </Text>
                  <Group gap="xs" mt={4}>
                    {result.settings
                      ? Object.entries(result.settings.rendererRevisions).map(
                          ([type, revision]) => (
                            <Badge variant="light" key={type}>
                              {formatAssetType(type)} · {revision}
                            </Badge>
                          )
                        )
                      : 'Not initialized'}
                  </Group>
                </div>
              </Group>
            </Stack>
          </Paper>

          <Paper withBorder radius="md">
            <Group p="md" justify="space-between" align="end" wrap="wrap">
              <Group align="end">
                <Select
                  label="Status"
                  clearable
                  placeholder="All statuses"
                  value={status ?? null}
                  data={[
                    { value: 'error', label: 'Error' },
                    { value: 'in_progress', label: 'In progress' },
                    { value: 'pending', label: 'Pending' },
                  ]}
                  onChange={(value) => {
                    setStatus((value as PublicationJobStatus | null) ?? undefined);
                    setPage(1);
                  }}
                />
                <Select
                  label="Asset type"
                  clearable
                  placeholder="All asset types"
                  value={assetType ?? null}
                  data={Object.keys(result.settings?.rendererRevisions ?? {}).map((value) => ({
                    value,
                    label: formatAssetType(value),
                  }))}
                  onChange={(value) => {
                    setAssetType(value ?? undefined);
                    setPage(1);
                  }}
                />
              </Group>
              <Text size="sm" c="dimmed">
                {result.total} {result.total === 1 ? 'job' : 'jobs'}
              </Text>
            </Group>

            <Table.ScrollContainer minWidth={980}>
              <Table striped highlightOnHover verticalSpacing="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Status</Table.Th>
                    <Table.Th>Asset</Table.Th>
                    <Table.Th>Attempts</Table.Th>
                    <Table.Th>Lease expires</Table.Th>
                    <Table.Th>Last error</Table.Th>
                    <Table.Th>Updated</Table.Th>
                    <Table.Th>Job ID</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {result.jobs.length > 0 ? (
                    result.jobs.map((job) => (
                      <Table.Tr key={job.id}>
                        <Table.Td>
                          <JobStatusBadge status={job.status} />
                        </Table.Td>
                        <Table.Td>
                          <Text fw={600}>{formatAssetType(job.assetType)}</Text>
                          <Code>{job.assetId}</Code>
                        </Table.Td>
                        <Table.Td>{job.attemptCounter}</Table.Td>
                        <Table.Td>{formatDate(job.expiresAt)}</Table.Td>
                        <Table.Td>
                          <Text size="sm" c={job.error ? 'red' : 'dimmed'} maw={280} lineClamp={3}>
                            {job.error ?? '—'}
                          </Text>
                        </Table.Td>
                        <Table.Td>{formatDate(job.updatedAt)}</Table.Td>
                        <Table.Td>
                          <Code>{job.id}</Code>
                        </Table.Td>
                      </Table.Tr>
                    ))
                  ) : (
                    <Table.Tr>
                      <Table.Td colSpan={7}>
                        <Text ta="center" c="dimmed" py="lg">
                          No publication jobs match these filters.
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  )}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </Paper>

          {result.total > PAGE_SIZE ? (
            <Center>
              <Pagination
                value={result.page}
                onChange={setPage}
                total={Math.ceil(result.total / result.pageSize)}
                withEdges
                aria-label="Publication job pages"
              />
            </Center>
          ) : null}
        </Stack>
      )}
    </PageLayout>
  );
}

function Count({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: 'yellow' | 'blue' | 'red';
}) {
  return (
    <div>
      <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
        {label}
      </Text>
      <Badge size="xl" color={color} variant="light" mt={4}>
        {value}
      </Badge>
    </div>
  );
}

function JobStatusBadge({ status }: { status: PublicationJobStatus }) {
  const presentation = {
    pending: { color: 'yellow', label: 'Pending' },
    in_progress: { color: 'blue', label: 'In progress' },
    error: { color: 'red', label: 'Error' },
  } as const;
  return (
    <Badge color={presentation[status].color} variant="light">
      {presentation[status].label}
    </Badge>
  );
}

function formatAssetType(value: string) {
  return value.replaceAll('_', ' ');
}

function formatDate(value: number | null) {
  if (value === null) return '—';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value);
}
