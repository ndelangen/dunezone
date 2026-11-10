import { Anchor, Code, Group, Stack, Switch, Table, Text } from '@mantine/core';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ActionError } from '@ui/block/ActionError';
import { PageTitle } from '@ui/block/PageTitle';
import { Section } from '@ui/block/Section';
import { Breadcrumb } from '@ui/content/Breadcrumb';
import { EmptyNote } from '@ui/content/EmptyNote';
import { StatusBadge } from '@ui/content/StatusBadge';
import { ControlBlock } from '@ui/control/ControlBlock';
import { HoldAction } from '@ui/control/HoldAction';
import { LabeledAction } from '@ui/control/LabeledAction';
import { PageLayout } from '@ui/layout/PageLayout';
import { Surface } from '@ui/surface';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { useReducer } from 'react';
import type { Dispatch } from 'react';

import {
  useDeleteDiscordChannel,
  useDeleteDiscordOrphan,
  useDiscordAdminPage,
  useRefreshDiscordOrphans,
  useSetDiscordEnabled,
} from '@db/discordAdmin';
import { pageHead } from '@app/routes/pageTitle';
import { AdminPageLoading } from '@app/widgets/page-message/AdminGate';

export const Route = createFileRoute('/_app/admin/discord')({
  codeSplitGroupings: [['component']],
  head: () => pageHead('Discord channels'),
  component: DiscordDashboard,
});

const utcDateTime = new Intl.DateTimeFormat('en', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
  timeZoneName: 'short',
});

type CursorEvent = { type: 'previous' } | { type: 'next'; cursor: string };

function cursorReducer(cursors: (string | null)[], event: CursorEvent) {
  return event.type === 'previous' ? cursors.slice(0, -1) : [...cursors, event.cursor];
}

function DiscordDashboard() {
  const [cursors, dispatchCursor] = useReducer(cursorReducer, [null]);
  const result = useDiscordAdminPage({ cursor: cursors.at(-1) ?? null, numItems: 25 });
  const enabled = useSetDiscordEnabled();
  const deleteChannel = useDeleteDiscordChannel();
  const refresh = useRefreshDiscordOrphans();
  const deleteOrphan = useDeleteDiscordOrphan();

  if (result === undefined) {
    return (
      <AdminPageLoading size="compact" title="Discord channels">
        Loading Discord channels.
      </AdminPageLoading>
    );
  }

  return (
    <PageLayout>
      <PageLayout.Header size="compact" align="start">
        <PageTitle
          breadcrumb={<Breadcrumb to="/admin">Admin tools</Breadcrumb>}
          title="Discord channels"
          lede="Manage game voice channels and inspect untracked channels."
        />
      </PageLayout.Header>
      <PageLayout.Content>
        <Stack gap="lg">
          <Surface padding="lg">
            <Stack gap="sm">
              <ControlBlock
                title="Discord integration"
                input={(field) => (
                  <Switch
                    {...field}
                    checked={result.enabled}
                    disabled={!result.configured || enabled.isPending}
                    onChange={(event) => enabled.mutate({ enabled: event.currentTarget.checked })}
                  />
                )}
              />
              <Text size="sm" c="dimmed">
                Turning this off pauses channel creation, pings and cleanup. Existing channels remain available.
              </Text>
              {!result.configured && (
                <Text size="sm" c="dimmed">
                  Discord is not configured for this deployment.
                </Text>
              )}
            </Stack>
            <ActionError subject="Discord integration" verb="update" error={enabled.error} />
          </Surface>
          <TrackedChannels
            channels={result.channels}
            enabled={result.enabled}
            cursors={cursors}
            dispatchCursor={dispatchCursor}
            pending={deleteChannel.isPending}
            error={deleteChannel.error}
            onDelete={(channelId) => deleteChannel.mutate({ channelId })}
          />
          <NudgeDeliveryIssues issues={result.nudgeErrors} />
          <UntrackedChannels
            configured={result.configured}
            enabled={result.enabled}
            channels={refresh.data}
            refreshPending={refresh.isPending}
            refreshError={refresh.error}
            deletePending={deleteOrphan.isPending}
            deleteError={deleteOrphan.error}
            onRefresh={() => refresh.mutate(undefined)}
            onDelete={(channelId) => deleteOrphan.mutate({ channelId }, { onSuccess: () => refresh.mutate(undefined) })}
          />
        </Stack>
      </PageLayout.Content>
    </PageLayout>
  );
}

type DashboardResult = NonNullable<ReturnType<typeof useDiscordAdminPage>>;

type TrackedChannelsProps = {
  channels: DashboardResult['channels'];
  enabled: boolean;
  cursors: (string | null)[];
  dispatchCursor: Dispatch<CursorEvent>;
  pending: boolean;
  error: ReturnType<typeof useDeleteDiscordChannel>['error'];
  onDelete: (id: DashboardResult['channels']['page'][number]['_id']) => void;
};

function trackedDeleteReason(channel: DashboardResult['channels']['page'][number], enabled: boolean) {
  if (channel.state === 'deleted') {
    return 'This channel has already been removed.';
  }
  if (channel.state === 'deleting') {
    return 'Channel removal is in progress.';
  }
  if (channel.state === 'creating' && !channel.channel_id) {
    return 'Creation is unconfirmed. Check Discord first.';
  }
  if (!enabled) {
    return 'Discord integration is disabled.';
  }
  return undefined;
}

function TrackedChannels({
  channels,
  enabled,
  cursors,
  dispatchCursor,
  pending,
  error,
  onDelete,
}: TrackedChannelsProps) {
  return (
    <Surface padding="lg">
      <Section title="Tracked channels">
        <Text size="sm" c="dimmed">
          Game invites are shared. Individual Discord access is not tracked.
        </Text>
        <Table.ScrollContainer minWidth={800}>
          <Table verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Game</Table.Th>
                <Table.Th>Channel</Table.Th>
                <Table.Th>State</Table.Th>
                <Table.Th>Created</Table.Th>
                <Table.Th>Cleanup due</Table.Th>
                <Table.Th>Last error</Table.Th>
                <Table.Th>Action</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {channels.page.map((channel) => (
                <Table.Tr key={channel._id}>
                  <Table.Td>
                    {channel.gameSlug ? (
                      <Anchor
                        renderRoot={(props) => (
                          <Link {...props} to="/play/$gameId" params={{ gameId: channel.gameSlug! }} />
                        )}
                      >
                        {channel.gameName ?? channel.gameSlug}
                      </Anchor>
                    ) : (
                      <Code>{channel.game_id}</Code>
                    )}
                  </Table.Td>
                  <Table.Td>
                    {channel.channel_id ? (
                      <Anchor
                        href={`https://discord.com/channels/${channel.guild_id}/${channel.channel_id}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {channel.channel_id}
                      </Anchor>
                    ) : channel.state === 'creating' ? (
                      'Creation unconfirmed'
                    ) : (
                      'Not created'
                    )}
                    <Text size="xs" c="dimmed">
                      Guild {channel.guild_id}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <StatusBadge>{channel.state}</StatusBadge>
                  </Table.Td>
                  <Table.Td>{utcDateTime.format(channel.created_at)}</Table.Td>
                  <Table.Td>{utcDateTime.format(channel.cleanup_at)}</Table.Td>
                  <Table.Td>
                    <Text size="sm">{channel.error ?? 'None'}</Text>
                  </Table.Td>
                  <Table.Td>
                    <HoldAction
                      label={`Delete channel for ${channel.gameName ?? channel.gameSlug ?? channel.game_id}`}
                      disabledReason={trackedDeleteReason(channel, enabled)}
                      pending={pending}
                      onConfirm={() => onDelete(channel._id)}
                    />
                  </Table.Td>
                </Table.Tr>
              ))}
              {channels.page.length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={7}>
                    <EmptyNote>No tracked channels on this page.</EmptyNote>
                  </Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
        <ActionError subject="channel" verb="delete" error={error} />
        <Group justify="center" aria-label="Channel pages">
          <LabeledAction
            icon={<ChevronLeft size={16} />}
            disabledReason={cursors.length === 1 ? 'This is the first page.' : undefined}
            onClick={() => dispatchCursor({ type: 'previous' })}
          >
            Previous
          </LabeledAction>
          <Text size="sm">Page {cursors.length}</Text>
          <LabeledAction
            icon={<ChevronRight size={16} />}
            disabledReason={channels.isDone ? 'This is the last page.' : undefined}
            onClick={() => dispatchCursor({ type: 'next', cursor: channels.continueCursor })}
          >
            Next
          </LabeledAction>
        </Group>
      </Section>
    </Surface>
  );
}

function NudgeDeliveryIssues({ issues }: { issues: DashboardResult['nudgeErrors'] }) {
  return (
    <Surface padding="lg">
      <Section title="Recent nudge delivery issues">
        {issues.length === 0 ? (
          <EmptyNote>No recent delivery issues.</EmptyNote>
        ) : (
          <Table.ScrollContainer minWidth={700}>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Time</Table.Th>
                  <Table.Th>Game</Table.Th>
                  <Table.Th>Seat</Table.Th>
                  <Table.Th>State</Table.Th>
                  <Table.Th>Error</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {issues.map((failure, index) => (
                  <Table.Tr key={`${failure.at}-${index}`}>
                    <Table.Td>{utcDateTime.format(failure.at)}</Table.Td>
                    <Table.Td>
                      {failure.gameSlug ? (
                        <Anchor
                          renderRoot={(props) => (
                            <Link {...props} to="/play/$gameId" params={{ gameId: failure.gameSlug! }} />
                          )}
                        >
                          {failure.gameName ?? failure.gameSlug}
                        </Anchor>
                      ) : (
                        <Code>{failure.game_id}</Code>
                      )}
                    </Table.Td>
                    <Table.Td>{failure.toSeat}</Table.Td>
                    <Table.Td>{failure.state === 'sending' ? 'Sending (unconfirmed)' : failure.state}</Table.Td>
                    <Table.Td>{failure.error ?? 'None'}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Section>
    </Surface>
  );
}

type UntrackedChannelsProps = {
  configured: boolean;
  enabled: boolean;
  channels: ReturnType<typeof useRefreshDiscordOrphans>['data'];
  refreshPending: boolean;
  refreshError: ReturnType<typeof useRefreshDiscordOrphans>['error'];
  deletePending: boolean;
  deleteError: ReturnType<typeof useDeleteDiscordOrphan>['error'];
  onRefresh: () => void;
  onDelete: (channelId: string) => void;
};

function UntrackedChannels({
  configured,
  enabled,
  channels,
  refreshPending,
  refreshError,
  deletePending,
  deleteError,
  onRefresh,
  onDelete,
}: UntrackedChannelsProps) {
  return (
    <Surface padding="lg">
      <Section
        title="Untracked channels"
        action={
          <LabeledAction
            icon={<RefreshCw size={16} />}
            disabledReason={
              !configured ? 'Discord is not configured.' : !enabled ? 'Discord integration is disabled.' : undefined
            }
            busy={refreshPending}
            onClick={onRefresh}
          >
            Refresh
          </LabeledAction>
        }
      >
        <Text size="sm" c="dimmed">
          Refresh checks voice channels in the configured game categories and shows up to 100 untracked channels.
          Recently created channels are omitted while creation may still be in progress. These channels are never
          removed automatically. Check each channel before deleting it.
        </Text>
        <ActionError subject="untracked channels" verb="update" error={refreshError} />
        <ActionError subject="untracked channel" verb="delete" error={deleteError} />
        {channels && (
          <Table.ScrollContainer minWidth={600}>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Name</Table.Th>
                  <Table.Th>Channel ID</Table.Th>
                  <Table.Th>Category ID</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Action</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {channels.map((channel) => (
                  <Table.Tr key={channel.id}>
                    <Table.Td>{channel.name}</Table.Td>
                    <Table.Td>
                      <Anchor
                        href={`https://discord.com/channels/${channel.guild_id}/${channel.id}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {channel.id}
                      </Anchor>
                    </Table.Td>
                    <Table.Td>
                      <Code>{channel.parent_id}</Code>
                    </Table.Td>
                    <Table.Td>Untracked</Table.Td>
                    <Table.Td>
                      <HoldAction
                        label={`Delete untracked channel ${channel.name}`}
                        disabledReason={!enabled ? 'Discord integration is disabled.' : undefined}
                        pending={deletePending}
                        onConfirm={() => onDelete(channel.id)}
                      />
                    </Table.Td>
                  </Table.Tr>
                ))}
                {channels.length === 0 && (
                  <Table.Tr>
                    <Table.Td colSpan={5}>
                      <EmptyNote>No untracked voice channels found.</EmptyNote>
                    </Table.Td>
                  </Table.Tr>
                )}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Section>
    </Surface>
  );
}
