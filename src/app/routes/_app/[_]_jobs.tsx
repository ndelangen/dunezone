import { Alert, Badge, Center, Code, Group, Pagination, Select, Stack, Switch, Table, Text } from '@mantine/core';
import { createFileRoute } from '@tanstack/react-router';
import { LoadPending } from '@ui/block/LoadPending';
import { LoginGate } from '@ui/block/LoginGate';
import { NotAvailable } from '@ui/block/NotAvailable';
import { PageTitle } from '@ui/block/PageTitle';
import { StatusBadge } from '@ui/content/StatusBadge';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import { BriefcaseBusiness } from 'lucide-react';
import { useReducer } from 'react';

import { usePublicationJobsPage, useSetPublicationPickupEnabled } from '@db/publications';
import type { PublicationJobStatus } from '@db/publications';
import { PageMessage } from '@app/widgets/page-message/PageMessage';

const PAGE_SIZE = 25;

export const Route = createFileRoute('/_app/__jobs')({
  codeSplitGroupings: [['component']],
  component: PublicationJobsPage,
});

function PublicationJobsPage() {
  /* One listing query, one reducer: a filter change resets the page in the same event, so a third
     filter cannot forget the reset (the one-event-two-setters shape, #608). */
  const [listing, dispatch] = useReducer(
    (
      state: { status: PublicationJobStatus | undefined; assetType: string | undefined; page: number },
      event:
        | { kind: 'filter'; update: Partial<Pick<typeof state, 'status' | 'assetType'>> }
        | { kind: 'page'; page: number }
    ) => (event.kind === 'page' ? { ...state, page: event.page } : { ...state, ...event.update, page: 1 }),
    { status: undefined, assetType: undefined, page: 1 }
  );
  const { status, assetType, page } = listing;
  const result = usePublicationJobsPage({
    status,
    assetType,
    page,
    pageSize: PAGE_SIZE,
  });
  const pickupMutation = useSetPublicationPickupEnabled();

  /* Early returns rather than a ternary chain inside the content: each of the first three is the
     whole page rather than one region of it, and rendering them under this page's own header meant
     a reader who may not see the queue at all still got its briefcase and its description. The
     header is a statement about a dashboard they are not being shown. */
  if (result === undefined) {
    return (
      <PageMessage size="compact" title="Publication jobs">
        <LoadPending title="Loading publication jobs">The durable work queue is still loading.</LoadPending>
      </PageMessage>
    );
  }

  if (result.access === 'unauthenticated') {
    return (
      <PageMessage size="compact" title="Publication jobs">
        <LoginGate action="inspect publication jobs" />
      </PageMessage>
    );
  }

  if (result.access === 'not_authorized') {
    return (
      <PageMessage size="compact" title="Publication jobs">
        <NotAvailable title="You cannot view publication jobs">
          Your account does not have permission to view publication jobs.
        </NotAvailable>
      </PageMessage>
    );
  }

  return (
    <PageLayout>
      <PageLayout.Header size="compact">
        <Stack align="center" gap="xs">
          <BriefcaseBusiness size={32} strokeWidth={1.6} aria-hidden />
          <PageTitle title="Publication jobs" />
          <Text ta="center" maw={680}>
            Inspect the durable work queue and control whether the next scheduled run may pick up pending work.
          </Text>
        </Stack>
      </PageLayout.Header>
      <PageLayout.Content>
        <Stack gap="lg">
          <Surface padding="lg">
            <Stack gap="lg">
              <Group justify="space-between" align="flex-start" wrap="wrap">
                <div>
                  <Text fw={700}>Publisher pickup</Text>
                  <Text size="sm" c="dimmed" maw={620}>
                    Turning this off only prevents the next cron run from picking up pending jobs. It does not interrupt
                    work already in progress.
                  </Text>
                </div>
                <Switch
                  size="lg"
                  checked={result.settings?.publicationPickupEnabled ?? false}
                  disabled={result.settings === null || pickupMutation.isPending}
                  label={result.settings?.publicationPickupEnabled ? 'Enabled' : 'Disabled'}
                  onChange={(event) => pickupMutation.mutate({ enabled: event.currentTarget.checked })}
                />
              </Group>

              {pickupMutation.isError ? (
                <Alert color="red" title="Could not update publisher pickup">
                  {pickupMutation.error?.message}
                </Alert>
              ) : null}

              <Group gap="xl" align="flex-start" wrap="wrap">
                <Count label="Pending" value={result.counts.pending} tone="pending" />
                <Count label="In progress" value={result.counts.inProgress} tone="progress" />
                <Count label="Error" value={result.counts.error} tone="negative" />
                <div>
                  <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                    Renderer revisions
                  </Text>
                  <Group gap="xs" mt={4}>
                    {result.settings
                      ? Object.entries(result.settings.rendererRevisions).map(([type, revision]) => (
                          <Badge variant="light" key={type}>
                            {formatAssetType(type)} · {revision}
                          </Badge>
                        ))
                      : 'Not initialized'}
                  </Group>
                </div>
              </Group>
            </Stack>
          </Surface>

          <Surface>
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
                  onChange={(value) =>
                    dispatch({
                      kind: 'filter',
                      update: { status: (value as PublicationJobStatus | null) ?? undefined },
                    })
                  }
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
                  onChange={(value) => dispatch({ kind: 'filter', update: { assetType: value ?? undefined } })}
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
          </Surface>

          {result.total > PAGE_SIZE ? (
            <Center>
              <Pagination
                value={result.page}
                onChange={(next) => dispatch({ kind: 'page', page: next })}
                total={Math.ceil(result.total / result.pageSize)}
                withEdges
                aria-label="Publication job pages"
              />
            </Center>
          ) : null}
        </Stack>
      </PageLayout.Content>
    </PageLayout>
  );
}

/* The same three meanings the job badges carry, at the tally's own size. */
const COUNT_TONE_COLOR = { pending: 'yellow', progress: 'blue', negative: 'red' } as const;

function Count({ label, value, tone }: { label: string; value: number; tone: keyof typeof COUNT_TONE_COLOR }) {
  return (
    <div>
      <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
        {label}
      </Text>
      <Badge size="xl" color={COUNT_TONE_COLOR[tone]} variant="light" mt={4}>
        {value}
      </Badge>
    </div>
  );
}

function JobStatusBadge({ status }: { status: PublicationJobStatus }) {
  const presentation = {
    pending: { tone: 'pending', label: 'Pending' },
    in_progress: { tone: 'progress', label: 'In progress' },
    error: { tone: 'negative', label: 'Error' },
  } as const;
  return <StatusBadge tone={presentation[status].tone}>{presentation[status].label}</StatusBadge>;
}

function formatAssetType(value: string) {
  return value.replaceAll('_', ' ');
}

function formatDate(value: number | null) {
  if (value === null) {
    return '—';
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value);
}
