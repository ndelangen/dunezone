import { Code, Group, Select, Stack, Switch, Table, Text } from '@mantine/core';
import { createFileRoute } from '@tanstack/react-router';
import { ActionError } from '@ui/block/ActionError';
import { PageTitle } from '@ui/block/PageTitle';
import { Breadcrumb } from '@ui/content/Breadcrumb';
import { Eyebrow } from '@ui/content/Eyebrow';
import { StatusBadge } from '@ui/content/StatusBadge';
import { ControlBlock } from '@ui/control/ControlBlock';
import { LabeledAction } from '@ui/control/LabeledAction';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import { BriefcaseBusiness, ChevronLeft, ChevronRight } from 'lucide-react';
import { useReducer } from 'react';

import { usePublicationJobsPage, useSetPublicationPickupEnabled } from '@db/publications';
import type { PublicationJobStatus } from '@db/publications';
import { pageHead } from '@app/routes/pageTitle';
import { AdminPageLoading } from '@app/widgets/page-message/AdminGate';

const PAGE_SIZE = 25;

export const Route = createFileRoute('/_app/admin/jobs')({
  codeSplitGroupings: [['component']],
  head: () => pageHead('Publication jobs'),
  component: PublicationJobsDashboard,
});

/** Mounted only for an administrator, so the admin-only query is never asked by anyone else. */
function PublicationJobsDashboard() {
  const [listing, dispatch] = useReducer(
    (
      state: { status: PublicationJobStatus | undefined; assetType: string | undefined; cursors: (string | null)[] },
      event:
        | { kind: 'filter'; update: Partial<Pick<typeof state, 'status' | 'assetType'>> }
        | { kind: 'next'; cursor: string }
        | { kind: 'previous' }
    ) => {
      if (event.kind === 'filter') {
        return { ...state, ...event.update, cursors: [null] };
      }
      if (event.kind === 'next') {
        return { ...state, cursors: [...state.cursors, event.cursor] };
      }
      return { ...state, cursors: state.cursors.slice(0, -1) };
    },
    { status: undefined, assetType: undefined, cursors: [null] }
  );
  const { status, assetType, cursors } = listing;
  const result = usePublicationJobsPage({
    status,
    assetType,
    paginationOpts: { cursor: cursors.at(-1) ?? null, numItems: PAGE_SIZE },
  });
  const pickupMutation = useSetPublicationPickupEnabled();

  if (result === undefined) {
    return (
      <AdminPageLoading size="compact" title="Publication jobs">
        The durable work queue is still loading.
      </AdminPageLoading>
    );
  }

  return (
    <PageLayout>
      <PageLayout.Header size="compact">
        <Stack align="center" gap="xs">
          <BriefcaseBusiness size={32} strokeWidth={1.6} aria-hidden />
          <PageTitle
            breadcrumb={<Breadcrumb to="/admin">Admin tools</Breadcrumb>}
            title="Publication jobs"
            lede="Inspect the durable work queue and control whether the next scheduled run may pick up pending work."
          />
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
                  label={result.settings?.publicationPickupEnabled ? 'Enabled' : 'Disabled'}
                  size="lg"
                  checked={result.settings?.publicationPickupEnabled ?? false}
                  disabled={result.settings === null || pickupMutation.isPending}
                  onChange={(event) => pickupMutation.mutate({ enabled: event.currentTarget.checked })}
                />
              </Group>

              <ActionError subject="publisher pickup" verb="update" error={pickupMutation.error} />

              <Group gap="xl" align="flex-start" wrap="wrap">
                <Count label="Pending" value={result.counts.pending} tone="pending" />
                <Count label="In progress" value={result.counts.inProgress} tone="progress" />
                <Count label="Error" value={result.counts.error} tone="negative" />
                <div>
                  <Eyebrow>Renderer revisions</Eyebrow>
                  <Group gap="xs" mt={4}>
                    {result.settings
                      ? Object.entries(result.settings.rendererRevisions).map(([type, revision]) => (
                          <StatusBadge key={type}>{`${formatAssetType(type)} · ${revision}`}</StatusBadge>
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
                <ControlBlock
                  title="Status"
                  input={(fieldProps) => (
                    <Select
                      {...fieldProps}
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
                  )}
                />
                <ControlBlock
                  title="Asset type"
                  input={(fieldProps) => (
                    <Select
                      {...fieldProps}
                      clearable
                      placeholder="All asset types"
                      value={assetType ?? null}
                      data={Object.keys(result.settings?.rendererRevisions ?? {}).map((value) => ({
                        value,
                        label: formatAssetType(value),
                      }))}
                      onChange={(value) => dispatch({ kind: 'filter', update: { assetType: value ?? undefined } })}
                    />
                  )}
                />
              </Group>
              <Text size="sm" c="dimmed">
                Page {cursors.length}
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
                  {result.page.length > 0 ? (
                    result.page.map((job) => (
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
                          {cursors.length > 1
                            ? 'No jobs remain on this page. Use Previous to return to earlier jobs.'
                            : 'No publication jobs match these filters.'}
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  )}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </Surface>

          <Group justify="center" aria-label="Publication job pages">
            <LabeledAction
              icon={<ChevronLeft size={16} />}
              disabledReason={cursors.length === 1 ? 'This is the first page.' : undefined}
              onClick={() => dispatch({ kind: 'previous' })}
            >
              Previous
            </LabeledAction>
            <LabeledAction
              icon={<ChevronRight size={16} />}
              disabledReason={result.isDone ? 'This is the last page.' : undefined}
              onClick={() => dispatch({ kind: 'next', cursor: result.continueCursor })}
            >
              Next
            </LabeledAction>
          </Group>
        </Stack>
      </PageLayout.Content>
    </PageLayout>
  );
}

/* The same three meanings the job badges carry, under a caption naming the tally. */
function Count({ label, value, tone }: { label: string; value: number; tone: 'pending' | 'progress' | 'negative' }) {
  return (
    <div>
      <Eyebrow>{label}</Eyebrow>
      <StatusBadge tone={tone}>{value.toLocaleString()}</StatusBadge>
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
